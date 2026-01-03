import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { z } from "zod";
import { createSourcingWorkflow } from "../lib/sourcing/workflow";

const router = Router();

// Validation schema
const createSourcingJobSchema = z.object({
  title: z.string().min(1),
  jobDescription: z.string().min(1),
  maxCandidates: z.number().min(1).max(200).default(50),
  jobRequirements: z.any().optional(),
});

// POST /api/sourcing - Create new sourcing job
router.post("/", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { userId } = req;

    // Check for rate-limited jobs
    const rateLimitedJob = await prisma.sourcingJob.findFirst({
      where: {
        userId: userId!,
        status: "RATE_LIMITED",
      },
      select: {
        id: true,
        title: true,
        rateLimitResetAt: true,
        errorMessage: true,
      },
    });

    if (rateLimitedJob) {
      const resetTime = rateLimitedJob.rateLimitResetAt
        ? new Date(rateLimitedJob.rateLimitResetAt).toLocaleString()
        : "soon";

      return res.status(429).json({
        error: "Service temporarily unavailable",
        message: `You have a job that hit a service limit. Please try again after ${resetTime}.`,
        rateLimited: true,
        jobId: rateLimitedJob.id,
        resetAt: rateLimitedJob.rateLimitResetAt,
      });
    }

    // Validate request body
    const validatedData = createSourcingJobSchema.parse(req.body);

    // Create job
    const job = await prisma.sourcingJob.create({
      data: {
        userId: userId!,
        title: validatedData.title,
        rawJobDescription: validatedData.jobDescription,
        maxCandidates: validatedData.maxCandidates,
        jobRequirements: validatedData.jobRequirements,
        status: "CREATED",
        lastActivityAt: new Date(),
      },
    });

    console.log(`✨ Created sourcing job ${job.id}`);

    // TODO: Start workflow processing
    // Create workflow
    const app = await createSourcingWorkflow();

    // Run asynchronously with checkpointing
    app
      .invoke(
        {
          jobId: job.id,
          userId: userId,
          rawJobDescription: job.rawJobDescription,
          jobRequirements: job.jobRequirements as any,
          maxCandidates: job.maxCandidates,
        },
        {
          configurable: {
            thread_id: job.id, // This enables checkpointing
          },
        }
      )
      .catch(async (error) => {
        console.error(`Job ${job.id} failed:`, error);

        await prisma.sourcingJob.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            errorMessage: error.message,
            failedAt: new Date(),
          },
        });
      });

    res.status(201).json({
      id: job.id,
      status: "PROCESSING",
      message: "Job started",
    });
  } catch (error: any) {
    console.error("Error creating job:", error);

    if (error.name === "ZodError") {
      return res.status(400).json({
        error: "Validation failed",
        details: error.errors,
      });
    }

    next(error);
  }
});

// GET /api/sourcing - Get all sourcing jobs
router.get("/", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { userId } = req;
    const { status, limit = "50", offset = "0" } = req.query;

    const where: any = { userId: userId! };
    if (status && status !== "ALL") {
      where.status = status;
    }

    const jobs = await prisma.sourcingJob.findMany({
      where,
      include: {
        _count: {
          select: { candidates: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
    });

    const total = await prisma.sourcingJob.count({ where });

    res.json({
      jobs: jobs.map((job: any) => ({
        id: job.id,
        title: job.title,
        status: job.status,
        maxCandidates: job.maxCandidates,
        totalProfilesFound: job.totalProfilesFound,
        profilesScraped: job.profilesScraped,
        profilesScored: job.profilesScored,
        candidatesCount: job._count.candidates,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
        lastActivityAt: job.lastActivityAt,
        progress: calculateProgress(job),
      })),
      total,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
  } catch (error) {
    console.error("Error fetching sourcing jobs:", error);
    next(error);
  }
});

// Helper function to calculate progress
function calculateProgress(job: any): number {
  if (job.status === "COMPLETED") return 100;
  if (job.status === "FAILED") return 0;
  if (job.status === "RATE_LIMITED") {
    return calculateProgressFromStage(job);
  }
  return calculateProgressFromStage(job);
}

function calculateProgressFromStage(job: any): number {
  const status = job.status;
  const totalBatches = job.totalBatches || 1;

  if (status === "CREATED") return 5;
  if (status === "FORMATTING_JD") return 10;
  if (status === "JD_FORMATTED") return 15;
  if (status === "SEARCHING_PROFILES") return 20;
  if (status === "PROFILES_FOUND") return 25;

  if (status === "SCRAPING_PROFILES") {
    const scrapeProgress = (job.lastScrapedBatch / totalBatches) * 15;
    return 25 + scrapeProgress;
  }

  if (status === "PARSING_PROFILES") {
    const parseProgress = (job.lastParsedBatch / totalBatches) * 15;
    return 40 + parseProgress;
  }

  if (status === "SAVING_PROFILES") {
    const saveProgress = (job.lastSavedBatch / totalBatches) * 15;
    return 55 + saveProgress;
  }

  if (status === "SCORING_PROFILES") {
    const scoreProgress = (job.lastScoredBatch / totalBatches) * 25;
    return 70 + scoreProgress;
  }

  return 30;
}

export default router;
