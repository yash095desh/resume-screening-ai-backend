import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { extractJDRequirements } from '../lib/ai/parser';

const router = Router();

router.post('/', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { userId } = req;
    const { title, description } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }

    console.log('Extracting job requirements using AI...');

    // Use AI to extract structured requirements from job description
    const extractedRequirements = await extractJDRequirements(description);

    console.log('Extracted requirements:', extractedRequirements);

    // Create job with AI-extracted requirements
    const job = await prisma.job.create({
      data: {
        userId: userId!,
        title,
        description,
        requiredSkills: extractedRequirements.requiredSkills || [],
        experienceRequired: extractedRequirements.experienceRequired || '',
        qualifications: extractedRequirements.qualifications || [],
        status: 'draft',
      },
    });

    res.status(201).json(job);
  } catch (error: any) {
    console.error('Error creating job:', error);
    next(error);
  }
});

router.get('/', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { userId } = req;

    const jobs = await prisma.job.findMany({
      where: { userId: userId! },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { candidates: true } },
      },
    });

    res.json(jobs);
  } catch (error) {
    console.error('Error fetching jobs:', error);
    next(error);
  }
});

export default router;