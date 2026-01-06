import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import { creditService } from '../services/credit.service';
import { subscriptionService } from '../services/subscription.service';
import { CreditCategory } from '@prisma/client';
import { prisma } from '../lib/prisma';

/**
 * Middleware to check if user has sufficient screening credits
 * before processing resumes
 */
export async function checkScreeningCredits(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { userId } = req;
    const { jobId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Ensure user has a subscription (auto-create Free if not)
    await subscriptionService.ensureUserHasSubscription(userId);

    // Get pending candidates count
    const pendingCount = await prisma.candidate.count({
      where: {
        jobId,
        processingStatus: 'pending',
      },
    });

    if (pendingCount === 0) {
      // No candidates to process, skip credit check
      return next();
    }

    // Check if user has sufficient credits
    const hasSufficient = await creditService.hasSufficientCredits(
      userId,
      CreditCategory.SCREENING,
      pendingCount
    );

    if (!hasSufficient) {
      const balance = await creditService.getBalance(userId);
      return res.status(402).json({
        error: 'Insufficient screening credits',
        message: `You need ${pendingCount} screening credits to process these resumes, but you only have ${balance.screeningCredits} available.`,
        required: pendingCount,
        available: balance.screeningCredits,
        creditType: 'screening',
      });
    }

    // User has sufficient credits, proceed
    next();
  } catch (error: any) {
    console.error('Error in checkScreeningCredits middleware:', error);
    next(error);
  }
}

/**
 * Middleware to check if user has sufficient sourcing credits
 * before starting a sourcing job
 */
export async function checkSourcingCredits(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { userId } = req;
    const { maxCandidates } = req.body;
    console.log("userId:",userId)

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Ensure user has a subscription (auto-create Free if not)
    await subscriptionService.ensureUserHasSubscription(userId);

    // Default maxCandidates if not provided
    const requiredCredits = maxCandidates || 50;

    // Check if user has sufficient credits
    const hasSufficient = await creditService.hasSufficientCredits(
      userId,
      CreditCategory.SOURCING,
      requiredCredits
    );

    if (!hasSufficient) {
      const balance = await creditService.getBalance(userId);
      return res.status(402).json({
        error: 'Insufficient sourcing credits',
        message: `You need ${requiredCredits} sourcing credits to start this job, but you only have ${balance.sourcingCredits} available.`,
        required: requiredCredits,
        available: balance.sourcingCredits,
        creditType: 'sourcing',
      });
    }

    // User has sufficient credits, proceed
    next();
  } catch (error: any) {
    console.error('Error in checkSourcingCredits middleware:', error);
    next(error);
  }
}
