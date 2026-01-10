/**
 * Public Interview Link Routes (No Authentication Required)
 * These endpoints are accessed by candidates via their unique interview link
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { isLinkExpired } from '../lib/interview/token-generator';

const router = Router();

/**
 * GET /api/interview-link/:token
 * Validate interview link and get interview details
 * Public endpoint - no authentication required
 */
router.get('/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.params;

    // Find interview by token
    const interview = await prisma.interview.findUnique({
      where: { linkToken: token },
      include: {
        candidate: {
          select: {
            id: true,
            name: true,
          }
        },
        linkedInCandidate: {
          select: {
            id: true,
            fullName: true,
          }
        },
        job: {
          select: {
            id: true,
            title: true,
            description: true,
          }
        },
        sourcingJob: {
          select: {
            id: true,
            title: true,
            rawJobDescription: true,
          }
        }
      }
    });

    if (!interview) {
      return res.status(404).json({
        error: 'Invalid interview link',
        message: 'This interview link does not exist or has been removed.'
      });
    }

    // Check if link has expired
    if (isLinkExpired(interview.linkExpiresAt)) {
      return res.status(410).json({
        error: 'Link expired',
        message: 'This interview link has expired. Please contact the recruiter for a new link.',
        expiresAt: interview.linkExpiresAt
      });
    }

    // Check if interview is cancelled
    if (interview.status === 'CANCELLED') {
      return res.status(410).json({
        error: 'Interview cancelled',
        message: 'This interview has been cancelled. Please contact the recruiter for more information.'
      });
    }

    // Check if interview is already completed
    if (interview.status === 'COMPLETED') {
      return res.status(410).json({
        error: 'Already completed',
        message: 'You have already completed this interview. Thank you!'
      });
    }

    // Update status to LINK_OPENED if this is first access
    if (interview.status === 'PENDING' || interview.status === 'LINK_SENT') {
      await prisma.interview.update({
        where: { id: interview.id },
        data: {
          status: 'LINK_OPENED',
          linkOpenedAt: interview.linkOpenedAt || new Date() // Only set once
        }
      });
    }

    // Get candidate name based on source
    const candidateName = interview.source === 'SCREENING'
      ? interview.candidate?.name
      : interview.linkedInCandidate?.fullName;

    const job = interview.source === 'SCREENING' ? interview.job : interview.sourcingJob;
    const jobTitle = job?.title || 'Position';
    const jobDescription = interview.source === 'SCREENING'
      ? interview.job?.description
      : interview.sourcingJob?.rawJobDescription;

    // Return interview details (without sensitive data)
    res.json({
      id: interview.id,
      candidateName,
      jobTitle,
      jobDescription,
      vapiAssistantId: interview.vapiAssistantId,
      status: interview.status === 'LINK_OPENED' ? 'LINK_OPENED' : interview.status,
      linkExpiresAt: interview.linkExpiresAt,
      startedAt: interview.startedAt,
      completedAt: interview.completedAt,
      message: 'Interview link is valid. You can start the interview.'
    });
  } catch (error) {
    console.error('Error validating interview link:', error);
    next(error);
  }
});

/**
 * POST /api/interview-link/:token/start
 * Mark interview as started
 * Public endpoint - no authentication required
 */
router.post('/:token/start', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.params;

    // Find interview
    const interview = await prisma.interview.findUnique({
      where: { linkToken: token }
    });

    if (!interview) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    // Check if expired
    if (isLinkExpired(interview.linkExpiresAt)) {
      return res.status(410).json({ error: 'Interview link has expired' });
    }

    // Check if already completed
    if (interview.status === 'COMPLETED') {
      return res.status(400).json({ error: 'Interview already completed' });
    }

    // Update status to IN_PROGRESS
    const updatedInterview = await prisma.interview.update({
      where: { id: interview.id },
      data: {
        status: 'IN_PROGRESS',
        startedAt: interview.startedAt || new Date() // Only set once
      }
    });

    res.json({
      message: 'Interview started',
      status: updatedInterview.status,
      startedAt: updatedInterview.startedAt
    });
  } catch (error) {
    console.error('Error starting interview:', error);
    next(error);
  }
});

/**
 * POST /api/interview-link/:token/complete
 * Mark interview as completed (called from frontend after Vapi call ends)
 * Public endpoint - no authentication required
 */
router.post('/:token/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.params;

    // Find interview
    const interview = await prisma.interview.findUnique({
      where: { linkToken: token }
    });

    if (!interview) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    // Update status to COMPLETED
    const updatedInterview = await prisma.interview.update({
      where: { id: interview.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        vapiCallId: interview.vapiCallId,
        duration: interview.duration
      }
    });

    res.json({
      message: 'Interview completed successfully',
      status: updatedInterview.status,
      completedAt: updatedInterview.completedAt
    });
  } catch (error) {
    console.error('Error completing interview:', error);
    next(error);
  }
});

/**
 * POST /api/interview-link/:token/abandon
 * Mark interview as abandoned (candidate left before completing)
 * Public endpoint - no authentication required
 */
router.post('/:token/abandon', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.params;
    const { abandonedAtQuestion, duration } = req.body;

    // Find interview
    const interview = await prisma.interview.findUnique({
      where: { linkToken: token }
    });

    if (!interview) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    // Only abandon if it was in progress
    if (interview.status !== 'IN_PROGRESS') {
      return res.status(400).json({ error: 'Interview was not in progress' });
    }

    // Update status to ABANDONED
    const updatedInterview = await prisma.interview.update({
      where: { id: interview.id },
      data: {
        status: 'ABANDONED',
        abandonedAt: new Date(),
        abandonedAtQuestion: abandonedAtQuestion || null,
        duration: duration || interview.duration
      }
    });

    res.json({
      message: 'Interview marked as abandoned',
      status: updatedInterview.status,
      abandonedAt: updatedInterview.abandonedAt
    });
  } catch (error) {
    console.error('Error abandoning interview:', error);
    next(error);
  }
});

export default router;
