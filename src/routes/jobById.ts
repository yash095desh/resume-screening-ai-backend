import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';

const router = Router({ mergeParams: true });

router.get('/', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { jobId } = req.params;
    const { userId } = req;

    const job = await prisma.job.findFirst({
      where: { id: jobId, userId: userId! },
      include: {
        candidates: { orderBy: { matchScore: 'desc' } },
        _count: { select: { candidates: true } },
      },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(job);
  } catch (error: any) {
    console.error('Error fetching job:', error);
    next(error);
  }
});

router.patch('/', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { jobId } = req.params;
    const { userId } = req;
    const { title, description, status } = req.body;

    const job = await prisma.job.findFirst({
      where: { id: jobId, userId: userId! },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const updatedJob = await prisma.job.update({
      where: { id: jobId },
      data: {
        ...(title && { title }),
        ...(description && { description }),
        ...(status && { status }),
        updatedAt: new Date(),
      },
    });

    res.json(updatedJob);
  } catch (error: any) {
    console.error('Error updating job:', error);
    next(error);
  }
});

router.delete('/', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { jobId } = req.params;
    const { userId } = req;

    const job = await prisma.job.findFirst({
      where: { id: jobId, userId: userId! },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    await prisma.job.delete({ where: { id: jobId } });
    res.json({ message: 'Job deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting job:', error);
    next(error);
  }
});

export default router;