import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';

const router = Router({ mergeParams: true });

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