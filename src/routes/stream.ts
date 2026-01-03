import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';

const router = Router({ mergeParams: true });

// GET /stream/:jobId - Server-Sent Events for real-time job progress
router.get('/:jobId', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { jobId } = req.params;
    const { userId } = req;

    // Verify job ownership
    const job = await prisma.sourcingJob.findUnique({
      where: { id: jobId },
    });

    if (!job || job.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering in nginx
    
    // IMPORTANT: For Express to work properly with SSE
    res.flushHeaders(); // ✅ Send headers immediately

    let isStreamClosed = false;
    let lastUpdateHash = '';

    console.log(`📡 SSE stream started for job ${jobId}`);

    // Helper function to send SSE message
    const sendSSE = (data: any) => {
      if (isStreamClosed) return;
      
      try {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        // ✅ CRITICAL: Flush after each write
        if (typeof (res as any).flush === 'function') {
          (res as any).flush();
        }
      } catch (error) {
        console.error('Error writing SSE:', error);
        isStreamClosed = true;
      }
    };

    // Send initial connection
    sendSSE({ type: 'connected', jobId });

    const intervalId = setInterval(async () => {
      if (isStreamClosed) {
        clearInterval(intervalId);
        return;
      }

      try {
        const latestJob = await prisma.sourcingJob.findUnique({
          where: { id: jobId },
          include: {
            candidates: {
              where: { isScored: true },
              orderBy: { matchScore: 'desc' },
              take: 10,
              select: {
                id: true,
                fullName: true,
                headline: true,
                location: true,
                profileUrl: true,
                photoUrl: true,
                currentPosition: true,
                currentCompany: true,
                currentCompanyLogo: true,
                matchScore: true,
                skillsScore: true,
                experienceScore: true,
                experienceYears: true,
                seniorityLevel: true,
                hasContactInfo: true,
                isDuplicate: true,
                isOpenToWork: true,
                matchedSkills: true,
                missingSkills: true,
                bonusSkills: true,
                email: true,
                phone: true,
              },
            },
          },
        });

        if (!latestJob) {
          sendSSE({
            type: 'error',
            message: 'Job not found',
          });
          res.end();
          clearInterval(intervalId);
          return;
        }

        // Create a comprehensive hash to detect ANY meaningful change
        const currentState = {
          status: latestJob.status,
          stage: latestJob.currentStage,
          totalFound: latestJob.totalProfilesFound,
          scraped: latestJob.profilesScraped,
          parsed: latestJob.profilesParsed,
          saved: latestJob.profilesSaved,
          scored: latestJob.profilesScored,
          candidateCount: latestJob.candidates.length,
          lastActivity: latestJob.lastActivityAt,
        };

        const updateHash = JSON.stringify(currentState);

        // Send update if anything changed
        if (updateHash !== lastUpdateHash) {
          lastUpdateHash = updateHash;

          const progressPercentage = calculateProgress(latestJob);

          const update = {
            type: 'update',
            status: latestJob.status,
            currentStage: latestJob.currentStage ?? 'PROCESSING',
            progress: {
              totalFound: latestJob.totalProfilesFound,
              scraped: latestJob.profilesScraped,
              parsed: latestJob.profilesParsed,
              saved: latestJob.profilesSaved,
              scored: latestJob.profilesScored,
              percentage: progressPercentage,
            },
            candidates: latestJob.candidates,
            lastActivityAt: latestJob.lastActivityAt,
          };

          console.log(
            `[SSE] ✉️  Sending update: ${update.currentStage} @ ${progressPercentage}%`
          );

          sendSSE(update);
        }

        // Close stream when complete
        if (
          latestJob.status === 'COMPLETED' ||
          latestJob.status === 'FAILED' ||
          latestJob.status === 'RATE_LIMITED'
        ) {
          console.log(`✅ Job ${jobId} finished with status ${latestJob.status}. Closing stream.`);

          sendSSE({
            type: 'complete',
            status: latestJob.status,
            errorMessage: latestJob.errorMessage,
          });

          res.end();
          clearInterval(intervalId);
          isStreamClosed = true;
        }
      } catch (error: any) {
        console.error('Error in SSE poll:', error);
        sendSSE({
          type: 'error',
          message: error.message,
        });
      }
    }, 2000); // Poll every 2 seconds

    // Cleanup on disconnect
    req.on('close', () => {
      console.log(`🔌 Client disconnected from SSE for job ${jobId}`);
      clearInterval(intervalId);
      isStreamClosed = true;
    });

  } catch (error: any) {
    console.error('Error creating SSE stream:', error);
    next(error);
  }
});

// Helper function to calculate progress
function calculateProgress(job: any): number {
  const stage = job.currentStage;
  const total = job.totalProfilesFound;

  let baseProgress = 0;

  // Handle dynamic stages
  if (stage?.startsWith('SEARCH_ITERATION_')) {
    baseProgress = 10;
  } else if (stage?.startsWith('ENRICHING_')) {
    baseProgress = 20;
  } else if (stage?.startsWith('SCRAPING_BATCH_')) {
    baseProgress = 30;
    if (total > 0 && job.profilesScraped > 0) {
      const stageProgress = Math.round((job.profilesScraped / total) * 30);
      baseProgress += stageProgress;
    }
  } else if (stage?.startsWith('PARSING_BATCH_')) {
    baseProgress = 60;
    if (total > 0 && job.profilesParsed > 0) {
      const stageProgress = Math.round((job.profilesParsed / total) * 20);
      baseProgress += stageProgress;
    }
  } else if (stage?.startsWith('UPDATING_BATCH_')) {
    baseProgress = 80;
    if (total > 0 && job.profilesSaved > 0) {
      const stageProgress = Math.round((job.profilesSaved / total) * 10);
      baseProgress += stageProgress;
    }
  } else if (stage?.startsWith('SCORED_')) {
    baseProgress = 90;
    if (total > 0 && job.profilesScored > 0) {
      const stageProgress = Math.round((job.profilesScored / total) * 10);
      baseProgress += stageProgress;
    }
  } else {
    // Static stages
    const stageProgress: Record<string, number> = {
      'CREATED': 0,
      'FORMATTING_JD': 5,
      'JD_FORMATTED': 5,
      'QUERY_GENERATED': 8,
      'ENRICHMENT_COMPLETE': 30,
      'SCRAPING_COMPLETE': 60,
      'PARSING_COMPLETE': 80,
      'UPDATE_COMPLETE': 90,
      'SCORING_COMPLETE': 100,
    };

    baseProgress = stageProgress[stage] ?? 0;

    // Fallback based on actual completion
    if (baseProgress === 0) {
      if (job.profilesScored === total && total > 0) {
        baseProgress = 100;
      } else if (job.profilesSaved === total && total > 0) {
        baseProgress = 90;
      } else if (job.profilesParsed === total && total > 0) {
        baseProgress = 80;
      } else if (job.profilesScraped === total && total > 0) {
        baseProgress = 60;
      }
    }
  }

  return Math.min(baseProgress, 100);
}

export default router;