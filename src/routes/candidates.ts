import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';

const router = Router({ mergeParams: true });

// GET /api/candidates?source=SCREENING|SOURCING - List candidates for interview scheduling
router.get('/', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { userId } = req;
    const source = req.query.source as string;

    if (!source || !['SCREENING', 'SOURCING'].includes(source)) {
      return res.status(400).json({
        error: 'Invalid or missing source parameter. Must be SCREENING or SOURCING'
      });
    }

    if (source === 'SCREENING') {
      // Fetch screening candidates (from resume uploads)
      const candidates = await prisma.candidate.findMany({
        where: {
          job: {
            userId,
          },
        },
        include: {
          job: {
            select: {
              id: true,
              title: true,
              description: true,
            },
          },
        },
        orderBy: {
          matchScore: 'desc',
        },
      });

      // Transform to match frontend interface
      const formatted = candidates.map(candidate => ({
        id: candidate.id,
        name: candidate.name,
        email: candidate.email,
        matchScore: candidate.matchScore,
        jobId: candidate.jobId,
        job: candidate.job,
      }));

      return res.json(formatted);
    } else {
      // Fetch sourcing candidates (from LinkedIn)
      const candidates = await prisma.linkedInCandidate.findMany({
        where: {
          sourcingJob: {
            userId,
          },
        },
        include: {
          sourcingJob: {
            select: {
              id: true,
              title: true,
              rawJobDescription: true,
            },
          },
        },
        orderBy: {
          matchScore: 'desc',
        },
      });

      // Transform to match frontend interface
      const formatted = candidates.map(candidate => ({
        id: candidate.id,
        name: candidate.fullName,
        email: candidate.email,
        matchScore: candidate.matchScore,
        sourcingJobId: candidate.sourcingJobId,
        sourcingJob: {
          id: candidate.sourcingJob.id,
          jobTitle: candidate.sourcingJob.title,
          rawJobDescription: candidate.sourcingJob.rawJobDescription,
        },
      }));

      return res.json(formatted);
    }
  } catch (error) {
    next(error);
  }
});

// GET /api/candidates/:candidateId - Get candidate details
router.get('/:candidateId', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { candidateId } = req.params;
    const { userId } = req;

    const candidate = await prisma.candidate.findFirst({
      where: { id: candidateId },
      include: {
        job: {
          select: {
            userId: true,
            title: true,
            requiredSkills: true,
            experienceRequired: true,
            qualifications: true,
          },
        },
      },
    });

    if (!candidate) {
      return res.status(404).json({ error: 'Candidate not found' });
    }

    // Verify ownership
    if (candidate.job.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    res.json(candidate);
  } catch (error: any) {
    console.error('Error fetching candidate:', error);
    next(error);
  }
});

export default router;