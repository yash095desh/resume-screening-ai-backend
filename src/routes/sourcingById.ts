import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';

const router = Router({ mergeParams: true });

// GET /api/sourcing/:jobId - Get job details with optional candidates
router.get('/', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { userId } = req;
    const { jobId } = req.params;
    const includeCandidates = req.query.include === 'candidates';

    const job = await prisma.sourcingJob.findUnique({
      where: { id: jobId },
      include: {
        candidates: includeCandidates
          ? {
              where: { isScored: true },
              orderBy: [{ matchScore: 'desc' }],
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
                experienceYears: true,
                seniorityLevel: true,
                matchedSkills: true,
                missingSkills: true,
                bonusSkills: true,
                matchScore: true,
                skillsScore: true,
                experienceScore: true,
                industryScore: true,
                titleScore: true,
                niceToHaveScore: true,
                matchReason: true,
                email: true,
                phone: true,
                hasContactInfo: true,
                isOpenToWork: true,
                isDuplicate: true,
                isScored: true,
                scrapedAt: true,
              },
            }
          : false,
      },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const progress = {
      percentage:
        job.totalProfilesFound > 0
          ? Math.round((job.profilesScored / job.totalProfilesFound) * 100)
          : 0,
    };

    res.json({
      id: job.id,
      title: job.title,
      status: job.status,
      currentStage: job.currentStage,
      totalProfilesFound: job.totalProfilesFound,
      profilesScored: job.profilesScored,
      progress,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      errorMessage: job.errorMessage,
      candidates: job.candidates || [],
    });
  } catch (error: any) {
    console.error('Error fetching sourcing job:', error);
    next(error);
  }
});

// DELETE /api/sourcing/:jobId - Delete job and candidates
router.delete('/', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { userId } = req;
    const { jobId } = req.params;

    const job = await prisma.sourcingJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        userId: true,
        _count: {
          select: { candidates: true },
        },
      },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await prisma.sourcingJob.delete({ where: { id: jobId } });

    res.json({
      success: true,
      message: 'Job deleted successfully',
      deletedCandidates: job._count.candidates,
    });
  } catch (error: any) {
    console.error('Error deleting sourcing job:', error);
    next(error);
  }
});


export default router;