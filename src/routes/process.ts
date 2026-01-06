import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { checkScreeningCredits } from '../middleware/creditCheck';
import { parseResumeBuffer } from '../lib/utils/file-parser';
import { processResumeCombined, JobRequirements } from '../lib/ai/resume-processor';
import { getSupabaseFile } from '../lib/storage/supabase';
import { creditService } from '../services/credit.service';
import { CreditCategory } from '@prisma/client';

const router = Router({ mergeParams: true });

// -------------------------
// POST: PROCESS RESUMES (OPTIMIZED)
// -------------------------
router.post('/:jobId', requireAuth, checkScreeningCredits, async (req: AuthenticatedRequest, res, next) => {
  let processingLog: any = null;

  try {
    const { jobId } = req.params;
    const { userId } = req;

    const job = await prisma.job.findFirst({
      where: { id: jobId, userId: userId! },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const candidates = await prisma.candidate.findMany({
      where: { jobId, processingStatus: 'pending' },
    });

    if (!candidates.length) {
      return res.json({
        message: 'No pending candidates to process',
      });
    }

    // Update job status
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'processing' },
    });

    processingLog = await prisma.processingLog.create({
      data: {
        jobId,
        status: 'started',
        totalResumes: candidates.length,
      },
    });

    let processedCount = 0;
    let failedCount = 0;

    // OPTIMIZATION: Increased batch size for better throughput (12 vs 5)
    const BATCH_SIZE = 12;

    // Prepare job requirements for batch processing
    const jobRequirements: JobRequirements = {
      requiredSkills: job.requiredSkills || [],
      experienceRequired: job.experienceRequired || '0',
      qualifications: job.qualifications || [],
    };

    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      const batch = candidates.slice(i, i + BATCH_SIZE);

      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(candidates.length / BATCH_SIZE)} (${batch.length} candidates)`);

      try {
        // OPTIMIZATION 1: Mark all candidates as processing in parallel
        await Promise.all(
          batch.map((candidate) =>
            prisma.candidate.update({
              where: { id: candidate.id },
              data: { processingStatus: 'processing' },
            })
          )
        );

        // OPTIMIZATION 2: Pre-fetch all files in parallel
        console.log('Fetching files in parallel...');
        const fileResults = await Promise.allSettled(
          batch.map(async (candidate) => {
            if (!candidate.resumePath) {
              throw new Error('Resume path is missing');
            }

            const { buffer: fileBuffer, mimeType } = await getSupabaseFile(
              candidate.resumePath
            );

            return {
              candidateId: candidate.id,
              buffer: fileBuffer,
              mimeType,
              resumePath: candidate.resumePath,
            };
          })
        );

        // OPTIMIZATION 3: Parse all files in parallel
        console.log('Parsing files in parallel...');
        const parseResults = await Promise.allSettled(
          fileResults.map(async (result, idx) => {
            if (result.status === 'rejected') {
              throw result.reason;
            }

            const { candidateId, buffer, mimeType, resumePath } = result.value;

            const resumeText = await parseResumeBuffer(buffer, mimeType, resumePath);

            if (!resumeText || resumeText.trim().length === 0) {
              throw new Error('Resume parsing returned empty text');
            }

            return {
              candidateId,
              resumeText,
            };
          })
        );

        // OPTIMIZATION 4: Process all resumes with AI in parallel (combined extraction + analysis)
        console.log('Processing with AI in parallel (combined extraction + summary)...');
        const aiResults = await Promise.allSettled(
          parseResults.map(async (result) => {
            if (result.status === 'rejected') {
              throw result.reason;
            }

            const { candidateId, resumeText } = result.value;

            // Single AI call for extraction + analysis (50% fewer API calls!)
            const processedResult = await processResumeCombined(
              resumeText,
              jobRequirements
            );

            return {
              candidateId,
              resumeText,
              ...processedResult,
            };
          })
        );

        // OPTIMIZATION 5: Batch update all successful candidates
        const successfulUpdates = aiResults
          .map((result, idx) => ({
            result,
            candidate: batch[idx],
          }))
          .filter((item) => item.result.status === 'fulfilled')
          .map((item) => ({
            candidate: item.candidate,
            data: (item.result as PromiseFulfilledResult<any>).value,
          }));

        console.log(`Updating ${successfulUpdates.length} successful candidates...`);

        await Promise.all(
          successfulUpdates.map(({ candidate, data }) =>
            prisma.candidate.update({
              where: { id: candidate.id },
              data: {
                name: data.name,
                email: data.email,
                phone: data.phone,
                resumeText: data.resumeText,
                skills: data.skills,
                experience: data.experience as any,
                education: data.education as any,
                totalExperienceYears: data.totalExperienceYears,
                matchScore: data.matchScore,
                matchedSkills: data.matchedSkills,
                missingSkills: data.missingSkills,
                fitVerdict: data.fitVerdict,
                summary: data.summary,
                strengths: data.strengths,
                weaknesses: data.weaknesses,
                processingStatus: 'completed',
                updatedAt: new Date(),
              },
            })
          )
        );

        processedCount += successfulUpdates.length;

        // Deduct screening credits for each successfully processed candidate
        for (const { candidate } of successfulUpdates) {
          try {
            await creditService.deductCredits(
              userId!,
              CreditCategory.SCREENING,
              1,
              jobId,
              'JOB',
              `Resume screening for candidate ${candidate.id}`
            );
          } catch (creditError: any) {
            console.error(`⚠️ Failed to deduct screening credit:`, creditError.message);
            // Don't fail the entire batch, just log the error
          }
        }

        // OPTIMIZATION 6: Handle failures
        const failures = aiResults
          .map((result, idx) => ({
            result,
            candidate: batch[idx],
          }))
          .filter((item) => item.result.status === 'rejected');

        if (failures.length > 0) {
          console.log(`Handling ${failures.length} failed candidates...`);

          await Promise.all(
            failures.map(({ candidate, result }) =>
              prisma.candidate.update({
                where: { id: candidate.id },
                data: {
                  processingStatus: 'failed',
                  processingError:
                    (result as PromiseRejectedResult).reason?.message || 'Processing failed',
                },
              })
            )
          );

          failedCount += failures.length;
        }

        // OPTIMIZATION 7: Single processing log update per batch (vs per candidate)
        await prisma.processingLog.update({
          where: { id: processingLog.id },
          data: {
            processedResumes: processedCount,
            failedResumes: failedCount,
            status: 'in_progress',
          },
        });

        console.log(`Batch completed: ${processedCount} processed, ${failedCount} failed`);

      } catch (batchErr: any) {
        console.error('Critical batch error:', batchErr);

        // Mark all candidates in this batch as failed
        await Promise.all(
          batch.map((candidate) =>
            prisma.candidate.update({
              where: { id: candidate.id },
              data: {
                processingStatus: 'failed',
                processingError: batchErr?.message || 'Batch processing failed',
              },
            })
          )
        );

        failedCount += batch.length;
      }

      // OPTIMIZATION 8: Reduced delay between batches (500ms vs 2000ms)
      if (i + BATCH_SIZE < candidates.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    // Update job and processing log status
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'completed' },
    });

    await prisma.processingLog.update({
      where: { id: processingLog.id },
      data: { status: 'completed', completedAt: new Date() },
    });

    res.json({
      success: true,
      processed: processedCount,
      failed: failedCount,
      total: candidates.length,
    });
  } catch (error: any) {
    console.error('Critical error in resume processing:', error);

    // Update processing log and job status on failure
    if (processingLog) {
      try {
        await prisma.processingLog.update({
          where: { id: processingLog.id },
          data: {
            status: 'failed',
            completedAt: new Date()
          },
        });
      } catch (logError) {
        console.error('Failed to update processing log:', logError);
      }
    }

    // Try to update job status to failed
    try {
      const { jobId } = req.params;
      await prisma.job.update({
        where: { id: jobId },
        data: { status: 'failed' },
      });
    } catch (jobError) {
      console.error('Failed to update job status:', jobError);
    }

    next(error);
  }
});

// -------------------------
// GET: CHECK PROCESSING STATUS
// -------------------------
router.get('/:jobId/status', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { jobId } = req.params;
    const { userId } = req;

    // Verify ownership
    const job = await prisma.job.findFirst({
      where: { id: jobId, userId: userId! },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const latestLog = await prisma.processingLog.findFirst({
      where: { jobId },
      orderBy: { startedAt: 'desc' },
    });

    if (!latestLog) {
      return res.json({ status: 'not_started' });
    }

    res.json(latestLog);
  } catch (error: any) {
    console.error('Error fetching processing status:', error);
    next(error);
  }
});

export default router;
