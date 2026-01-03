import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { createSourcingWorkflow, buildResumeState } from '../lib/sourcing/workflow';

const router = Router({ mergeParams: true });

/**
 * POST /api/sourcing/:jobId/retry - Retry failed job from last checkpoint
 */
router.get('/:jobId', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { userId } = req;
    const { jobId } = req.params;

    // Verify ownership and check if retryable
    const job = await prisma.sourcingJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        userId: true,
        status: true,
        retryCount: true,
        maxRetries: true,
        lastCompletedStage: true,
      },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Check if job can be retried
    // const retryableStatuses = ['FAILED', 'RATE_LIMITED'];
    // if (!retryableStatuses.includes(job.status)) {
    //   return res.status(400).json({
    //     error: `Cannot retry job with status: ${job.status}`,
    //   });
    // }

    // Check retry limit
    if (job.retryCount >= job.maxRetries) {
      return res.status(400).json({
        error: `Max retries (${job.maxRetries}) exceeded`,
      });
    }

    console.log(`🔄 Retrying job ${jobId} (attempt ${job.retryCount + 1}/${job.maxRetries})`);
    console.log(`📍 Resuming from stage: ${job.lastCompletedStage || 'START'}`);

    // Reset job status for retry
    await prisma.sourcingJob.update({
      where: { id: jobId },
      data: {
        status: 'CREATED',
        currentStage: 'RETRY_INITIATED',
        errorMessage: null,
        failedAt: null,
        retryCount: { increment: 1 },
        lastActivityAt: new Date(),
      },
    });

    // Build resume state from checkpoints
    const resumeState = await buildResumeState(jobId);

    console.log(`📦 Resume state built:`, {
      candidatesWithEmails: resumeState.candidatesWithEmails,
      discoveredUrlsCount: resumeState.discoveredUrls.size,
      scrapedProfilesCount: (resumeState.scrapedProfiles as any[]).length,
      parsedProfilesCount: (resumeState.parsedProfiles as any[]).length,
    });

    // Create workflow and resume
    const app = await createSourcingWorkflow();

    // Run asynchronously with same thread_id for checkpoint continuation
    app
      .invoke(resumeState as any, {
        configurable: {
          thread_id: jobId, // Same thread_id = continue from checkpoint
        },
      })
      .catch(async (error) => {
        console.error(`Retry of job ${jobId} failed:`, error);

        await prisma.sourcingJob.update({
          where: { id: jobId },
          data: {
            status: 'FAILED',
            errorMessage: `Retry failed: ${error.message}`,
            failedAt: new Date(),
          },
        });
      });

    res.json({
      success: true,
      message: 'Job retry initiated',
      job: {
        id: job.id,
        status: 'PROCESSING',
        retryCount: job.retryCount + 1,
        resumingFrom: job.lastCompletedStage || 'START',
      },
    });
  } catch (error: any) {
    console.error('Error retrying sourcing job:', error);
    next(error);
  }
});

export default router;