import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { createSourcingWorkflow, buildResumeState } from '../lib/sourcing/workflow';
import { sendInterviewEmail } from '../lib/interview/email-service';
import { getHoursRemaining } from '../lib/interview/token-generator';

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

/**
 * GET /api/cron/interview-reminders - Send automated interview reminders
 *
 * Should be called hourly to send:
 * - 24h gentle reminders (for interviews 24-25h after link sent, no reminders yet)
 * - 6h urgent reminders (for interviews 6-7h before expiry, less than 2 reminders)
 *
 * Protected by CRON_SECRET for security
 */
router.get('/interview-reminders', async (req, res, next) => {
  try {
    // Verify cron secret
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized - Invalid cron secret' });
    }

    console.log('📧 [CRON] Checking for interviews needing reminders...');

    const now = new Date();

    // Find interviews needing 24h reminder
    // Criteria: Link sent 24-25 hours ago, status LINK_SENT or LINK_OPENED, no reminders sent yet
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twentyFiveHoursAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000);

    const interviewsFor24hReminder = await prisma.interview.findMany({
      where: {
        status: { in: ['LINK_SENT', 'LINK_OPENED'] },
        linkSentAt: {
          gte: twentyFiveHoursAgo,
          lte: twentyFourHoursAgo,
        },
        remindersSent: 0,
        linkExpiresAt: { gt: now }, // Not expired
      },
      include: {
        candidate: true,
        linkedInCandidate: true,
        job: true,
        sourcingJob: true,
        user: true,
      }
    });

    console.log(`Found ${interviewsFor24hReminder.length} interviews for 24h reminder`);

    // Find interviews needing 6h urgent reminder
    // Criteria: 6-7 hours before expiry, less than 2 reminders sent, not completed/cancelled
    const sixHoursFromNow = new Date(now.getTime() + 6 * 60 * 60 * 1000);
    const sevenHoursFromNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);

    const interviewsFor6hReminder = await prisma.interview.findMany({
      where: {
        status: { in: ['LINK_SENT', 'LINK_OPENED'] },
        linkExpiresAt: {
          gte: sixHoursFromNow,
          lte: sevenHoursFromNow,
        },
        remindersSent: { lt: 2 },
      },
      include: {
        candidate: true,
        linkedInCandidate: true,
        job: true,
        sourcingJob: true,
        user: true,
      }
    });

    console.log(`Found ${interviewsFor6hReminder.length} interviews for 6h reminder`);

    let sentCount = 0;
    let failedCount = 0;

    // Send 24h reminders
    for (const interview of interviewsFor24hReminder) {
      try {
        const candidate = interview.source === 'SCREENING' ? interview.candidate : interview.linkedInCandidate;
        const job = interview.source === 'SCREENING' ? interview.job : interview.sourcingJob;

        if (!candidate?.email || !job) continue;

        // Get 24h reminder template
        const template = await prisma.emailTemplate.findFirst({
          where: {
            userId: interview.userId,
            type: 'REMINDER_24H',
            isDefault: true,
            isActive: true
          }
        });

        if (!template) {
          console.log(`No 24h reminder template found for user ${interview.userId}`);
          continue;
        }

        // Send reminder
        const result = await sendInterviewEmail({
          to: candidate.email,
          subject: template.subject,
          bodyHtml: template.bodyHtml,
          bodyText: template.bodyText || undefined,
          interview,
          candidate,
          job,
          recruiter: interview.user,
        });

        if (result.success) {
          await prisma.interview.update({
            where: { id: interview.id },
            data: {
              remindersSent: interview.remindersSent + 1,
              lastReminderAt: now
            }
          });
          sentCount++;
          console.log(`✅ Sent 24h reminder for interview ${interview.id}`);
        } else {
          failedCount++;
          console.error(`❌ Failed to send 24h reminder: ${result.error}`);
        }
      } catch (error) {
        failedCount++;
        console.error(`Error sending 24h reminder for interview ${interview.id}:`, error);
      }
    }

    // Send 6h urgent reminders
    for (const interview of interviewsFor6hReminder) {
      try {
        const candidate = interview.source === 'SCREENING' ? interview.candidate : interview.linkedInCandidate;
        const job = interview.source === 'SCREENING' ? interview.job : interview.sourcingJob;

        if (!candidate?.email || !job) continue;

        // Get 6h reminder template
        const template = await prisma.emailTemplate.findFirst({
          where: {
            userId: interview.userId,
            type: 'REMINDER_6H',
            isDefault: true,
            isActive: true
          }
        });

        if (!template) {
          console.log(`No 6h reminder template found for user ${interview.userId}`);
          continue;
        }

        // Send reminder
        const result = await sendInterviewEmail({
          to: candidate.email,
          subject: template.subject,
          bodyHtml: template.bodyHtml,
          bodyText: template.bodyText || undefined,
          interview,
          candidate,
          job,
          recruiter: interview.user,
        });

        if (result.success) {
          await prisma.interview.update({
            where: { id: interview.id },
            data: {
              remindersSent: interview.remindersSent + 1,
              lastReminderAt: now
            }
          });
          sentCount++;
          console.log(`✅ Sent 6h reminder for interview ${interview.id}`);
        } else {
          failedCount++;
          console.error(`❌ Failed to send 6h reminder: ${result.error}`);
        }
      } catch (error) {
        failedCount++;
        console.error(`Error sending 6h reminder for interview ${interview.id}:`, error);
      }
    }

    res.json({
      success: true,
      timestamp: now.toISOString(),
      remindersSent: sentCount,
      remindersFailed: failedCount,
      breakdown: {
        reminder24h: interviewsFor24hReminder.length,
        reminder6h: interviewsFor6hReminder.length,
      }
    });
  } catch (error: any) {
    console.error('Interview reminders cron error:', error);
    next(error);
  }
});

/**
 * GET /api/cron/check-expired - Mark expired interviews
 *
 * Should be called every 15 minutes to mark:
 * - Interviews that have passed their expiry time as EXPIRED
 * - Only updates interviews in PENDING, LINK_SENT, or LINK_OPENED status
 *
 * Protected by CRON_SECRET for security
 */
router.get('/check-expired', async (req, res, next) => {
  try {
    // Verify cron secret
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized - Invalid cron secret' });
    }

    console.log('⏰ [CRON] Checking for expired interviews...');

    const now = new Date();

    // Find expired interviews
    const expiredInterviews = await prisma.interview.findMany({
      where: {
        status: { in: ['PENDING', 'LINK_SENT', 'LINK_OPENED'] },
        linkExpiresAt: { lte: now },
      }
    });

    console.log(`Found ${expiredInterviews.length} expired interviews`);

    // Mark as EXPIRED
    if (expiredInterviews.length > 0) {
      const result = await prisma.interview.updateMany({
        where: {
          id: { in: expiredInterviews.map(i => i.id) },
        },
        data: {
          status: 'EXPIRED',
        }
      });

      console.log(`✅ Marked ${result.count} interviews as EXPIRED`);
    }

    // Also check for NO_SHOW (link sent 48+ hours ago, never opened, not expired yet)
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    const noShowInterviews = await prisma.interview.findMany({
      where: {
        status: 'LINK_SENT',
        linkSentAt: { lte: fortyEightHoursAgo },
        linkOpenedAt: null,
        linkExpiresAt: { gt: now }, // Not expired yet
      }
    });

    console.log(`Found ${noShowInterviews.length} no-show interviews`);

    if (noShowInterviews.length > 0) {
      const noShowResult = await prisma.interview.updateMany({
        where: {
          id: { in: noShowInterviews.map(i => i.id) },
        },
        data: {
          status: 'NO_SHOW',
          noShowReason: 'Link sent but never opened within 48 hours'
        }
      });

      console.log(`✅ Marked ${noShowResult.count} interviews as NO_SHOW`);
    }

    res.json({
      success: true,
      timestamp: now.toISOString(),
      expiredCount: expiredInterviews.length,
      noShowCount: noShowInterviews.length,
    });
  } catch (error: any) {
    console.error('Check expired cron error:', error);
    next(error);
  }
});

export default router;