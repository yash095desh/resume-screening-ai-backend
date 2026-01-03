import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { parseResumeBuffer } from '../lib/utils/file-parser';
import { extractResumeInfo } from '../lib/ai/parser';
import { calculateMatchScore } from '../lib/ai/matcher';
import { generateCandidateSummary } from '../lib/ai/scorer';
import { getSupabaseFile } from '../lib/storage/supabase';

const router = Router({ mergeParams: true });

// -------------------------
// POST: PROCESS RESUMES
// -------------------------
router.post('/:jobId', requireAuth, async (req: AuthenticatedRequest, res, next) => {
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

    const BATCH_SIZE = 5;

    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      const batch = candidates.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (candidate: any) => {
          try {
            // Validate resumePath exists
            if (!candidate.resumePath) {
              throw new Error('Resume path is missing');
            }

            await prisma.candidate.update({
              where: { id: candidate.id },
              data: { processingStatus: 'processing' },
            });

            // ------ FETCH FILE FROM SUPABASE ------
            const { buffer: fileBuffer, mimeType } = await getSupabaseFile(
              candidate.resumePath
            );

            console.log('Parsing resume:', {
              id: candidate.id,
              mimeType,
              resumePath: candidate.resumePath,
            });

            // ------ PARSE USING YOUR PARSER ------
            const resumeText = await parseResumeBuffer(
              fileBuffer,
              mimeType,
              candidate.resumePath
            );

            if (!resumeText || resumeText.trim().length === 0) {
              console.warn('Empty text returned for:', candidate.resumePath);
              throw new Error('Resume parsing returned empty text');
            }

            // ------ EXTRACT USING AI ------
            const candidateInfo = await extractResumeInfo(resumeText);

            // Validate candidateInfo
            if (!candidateInfo.name) {
              throw new Error('Could not extract candidate name from resume');
            }

            const matchResult = calculateMatchScore(
              candidateInfo.skills || [],
              job.requiredSkills || [],
              candidateInfo.totalExperienceYears || 0,
              job.experienceRequired || '0'
            );

            const summary = await generateCandidateSummary(
              candidateInfo,
              {
                requiredSkills: job.requiredSkills || [],
                experienceRequired: job.experienceRequired || '0',
                qualifications: job.qualifications || [],
              },
              matchResult.score
            );

            // ------ UPDATE CANDIDATE ------
            await prisma.candidate.update({
              where: { id: candidate.id },
              data: {
                name: candidateInfo.name,
                email: candidateInfo.email || null,
                phone: candidateInfo.phone || null,
                resumeText,
                skills: candidateInfo.skills || [],
                experience: candidateInfo.experience as any,
                education: candidateInfo.education as any,
                totalExperienceYears: candidateInfo.totalExperienceYears || 0,
                matchScore: matchResult.score,
                matchedSkills: matchResult.matchedSkills || [],
                missingSkills: matchResult.missingSkills || [],
                fitVerdict: summary.fitVerdict,
                summary: summary.summary,
                strengths: summary.strengths || [],
                weaknesses: summary.weaknesses || [],
                processingStatus: 'completed',
                updatedAt: new Date(),
              },
            });

            processedCount++;

            await prisma.processingLog.update({
              where: { id: processingLog.id },
              data: {
                processedResumes: processedCount,
                status: 'in_progress',
              },
            });
          } catch (err: any) {
            failedCount++;

            console.error('Error processing candidate:', candidate.id, err);

            await prisma.candidate.update({
              where: { id: candidate.id },
              data: {
                processingStatus: 'failed',
                processingError: err?.message || 'Processing failed',
              },
            });

            await prisma.processingLog.update({
              where: { id: processingLog.id },
              data: { failedResumes: failedCount },
            });
          }
        })
      );

      // Add delay between batches (except after last batch)
      if (i + BATCH_SIZE < candidates.length) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
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