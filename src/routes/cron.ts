import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { createSourcingWorkflow, buildResumeState } from '../lib/sourcing/workflow';

const router = Router();

const STUCK_THRESHOLD_MINUTES = 10; // No activity for 10+ minutes = stuck
const MAX_RETRIES = 3;

/**
 * GET /api/cron/recover-jobs - Recover stuck sourcing jobs
 * 
 * This endpoint should be called periodically (e.g., every 5 minutes) by:
 * - Railway Cron (in production)
 * - Vercel Cron (if using Vercel)
 * - External cron service (cron-job.org, EasyCron, etc.)
 * 
 * Protected by CRON_SECRET for security
 */
router.get('/recover-jobs', async (req, res, next) => {
  try {
    // Verify cron secret (security)
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized - Invalid cron secret' });
    }

    console.log('🔍 [CRON] Checking for stuck sourcing jobs...');

    const stuckThreshold = new Date(
      Date.now() - STUCK_THRESHOLD_MINUTES * 60 * 1000
    );

    // Find jobs that are stuck (no activity for X minutes)
    const stuckJobs = await prisma.sourcingJob.findMany({
      where: {
        status: {
          in: [
            'FORMATTING_JD',
            'JD_FORMATTED',
            'SEARCHING_PROFILES',
            'PROFILES_FOUND',
            'SCRAPING_PROFILES',
            'PARSING_PROFILES',
            'SAVING_PROFILES',
            'SCORING_PROFILES',
            'RATE_LIMITED',
          ],
        },
        lastActivityAt: {
          lt: stuckThreshold,
        },
        retryCount: {
          lt: MAX_RETRIES,
        },
      },
      select: {
        id: true,
        userId: true,
        title: true,
        status: true,
        currentStage: true,
        retryCount: true,
        lastActivityAt: true,
        lastCompletedStage: true,
      },
    });

    console.log(`🔍 [CRON] Found ${stuckJobs.length} stuck jobs`);

    const results = {
      recovered: 0,
      failed: 0,
      maxRetriesReached: 0,
      errors: [] as Array<{ jobId: string; error: string }>,
    };

    // Attempt to recover each stuck job
    for (const job of stuckJobs) {
      try {
        console.log(
          `🔄 [CRON] Attempting to recover job ${job.id} (${job.title}) - Attempt ${job.retryCount + 1}/${MAX_RETRIES}`
        );
        console.log(`📍 [CRON] Last activity: ${job.lastActivityAt}`);
        console.log(`📊 [CRON] Current stage: ${job.currentStage}`);

        // Check if max retries reached
        if (job.retryCount >= MAX_RETRIES) {
          console.log(`❌ [CRON] Job ${job.id} has reached max retries`);

          // Mark as permanently failed
          await prisma.sourcingJob.update({
            where: { id: job.id },
            data: {
              status: 'FAILED',
              errorMessage: `Job stuck - Failed after ${MAX_RETRIES} automatic recovery attempts. Last stage: ${job.currentStage}`,
              failedAt: new Date(),
              lastActivityAt: new Date(),
            },
          });

          results.maxRetriesReached++;
          continue;
        }

        // Increment retry count and reset status
        await prisma.sourcingJob.update({
          where: { id: job.id },
          data: {
            status: 'CREATED',
            currentStage: 'AUTO_RECOVERY',
            errorMessage: null,
            retryCount: { increment: 1 },
            lastActivityAt: new Date(),
          },
        });

        // Build resume state from checkpoints
        const resumeState = await buildResumeState(job.id);

        console.log(`📦 [CRON] Resume state built for ${job.id}:`, {
          candidatesWithEmails: resumeState.candidatesWithEmails,
          discoveredUrlsCount: resumeState.discoveredUrls.size,
          scrapedProfilesCount: (resumeState.scrapedProfiles as any[]).length,
          parsedProfilesCount: (resumeState.parsedProfiles as any[]).length,
        });

        // Create workflow and resume from checkpoint
        const app = await createSourcingWorkflow();

        // Run asynchronously with same thread_id for checkpoint continuation
        app
          .invoke(resumeState as any, {
            configurable: {
              thread_id: job.id, // Same thread_id = continue from checkpoint
            },
          })
          .catch(async (error) => {
            console.error(`❌ [CRON] Recovery failed for job ${job.id}:`, error);

            await prisma.sourcingJob.update({
              where: { id: job.id },
              data: {
                status: 'FAILED',
                errorMessage: `Auto-recovery failed: ${error.message}`,
                failedAt: new Date(),
                lastActivityAt: new Date(),
              },
            });
          });

        console.log(`✅ [CRON] Recovery initiated for job ${job.id}`);
        results.recovered++;

      } catch (error: any) {
        console.error(`❌ [CRON] Failed to recover job ${job.id}:`, error);

        results.failed++;
        results.errors.push({
          jobId: job.id,
          error: error.message,
        });

        // Update job with error
        try {
          await prisma.sourcingJob.update({
            where: { id: job.id },
            data: {
              errorMessage: `Cron recovery error: ${error.message}`,
              lastActivityAt: new Date(),
            },
          });
        } catch (updateError) {
          console.error(`Failed to update job ${job.id}:`, updateError);
        }
      }
    }

    console.log(
      `✅ [CRON] Recovery complete: ${results.recovered} recovered, ${results.failed} failed, ${results.maxRetriesReached} max retries reached`
    );

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        totalStuckJobs: stuckJobs.length,
        recovered: results.recovered,
        failed: results.failed,
        maxRetriesReached: results.maxRetriesReached,
      },
      errors: results.errors,
    });
  } catch (error: any) {
    console.error('❌ [CRON] Cron job error:', error);
    next(error);
  }
});

/**
 * GET /api/cron/health - Health check for cron job
 * 
 * Use this to verify cron setup is working
 */
router.get('/health', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check how many jobs are currently stuck
    const stuckThreshold = new Date(
      Date.now() - STUCK_THRESHOLD_MINUTES * 60 * 1000
    );

    const stuckJobsCount = await prisma.sourcingJob.count({
      where: {
        status: {
          in: [
            'FORMATTING_JD',
            'JD_FORMATTED',
            'SEARCHING_PROFILES',
            'PROFILES_FOUND',
            'SCRAPING_PROFILES',
            'PARSING_PROFILES',
            'SAVING_PROFILES',
            'SCORING_PROFILES',
            'RATE_LIMITED',
          ],
        },
        lastActivityAt: {
          lt: stuckThreshold,
        },
      },
    });

    const processingJobsCount = await prisma.sourcingJob.count({
      where: {
        status: {
          in: [
            'CREATED',
            'FORMATTING_JD',
            'JD_FORMATTED',
            'SEARCHING_PROFILES',
            'PROFILES_FOUND',
            'SCRAPING_PROFILES',
            'PARSING_PROFILES',
            'SAVING_PROFILES',
            'SCORING_PROFILES',
          ],
        },
      },
    });

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      config: {
        stuckThresholdMinutes: STUCK_THRESHOLD_MINUTES,
        maxRetries: MAX_RETRIES,
      },
      metrics: {
        stuckJobs: stuckJobsCount,
        processingJobs: processingJobsCount,
      },
    });
  } catch (error: any) {
    console.error('Health check error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;