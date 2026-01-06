import { prisma } from '../lib/prisma';
import { CreditCategory, TransactionType } from '@prisma/client';

export interface CreditsBalance {
  sourcingCredits: number;
  screeningCredits: number;
}

export class CreditService {
  /**
   * Get user's current credit balance
   */
  async getBalance(userId: string): Promise<CreditsBalance> {
    const userCredits = await prisma.userCredits.findUnique({
      where: { userId },
    });

    if (!userCredits) {
      return {
        sourcingCredits: 0,
        screeningCredits: 0,
      };
    }

    return {
      sourcingCredits: userCredits.sourcingCredits,
      screeningCredits: userCredits.screeningCredits,
    };
  }

  /**
   * Check if user has sufficient credits
   */
  async hasSufficientCredits(
    userId: string,
    category: CreditCategory,
    required: number
  ): Promise<boolean> {
    const balance = await this.getBalance(userId);

    if (category === 'SOURCING') {
      return balance.sourcingCredits >= required;
    } else {
      return balance.screeningCredits >= required;
    }
  }

  /**
   * Deduct credits from user's account (atomic operation)
   */
  async deductCredits(
    userId: string,
    category: CreditCategory,
    amount: number,
    referenceId?: string,
    referenceType?: string,
    description?: string
  ) {
    // Use transaction to ensure atomicity
    return await prisma.$transaction(async (tx) => {
      // Get or create user credits
      let userCredits = await tx.userCredits.findUnique({
        where: { userId },
      });

      if (!userCredits) {
        throw new Error('User credits not initialized. Please contact support.');
      }

      // Check sufficient balance
      const currentBalance =
        category === 'SOURCING'
          ? userCredits.sourcingCredits
          : userCredits.screeningCredits;

      if (currentBalance < amount) {
        throw new Error(
          `Insufficient ${category.toLowerCase()} credits. Required: ${amount}, Available: ${currentBalance}`
        );
      }

      // Deduct credits
      const newBalance = currentBalance - amount;
      const updateData =
        category === 'SOURCING'
          ? { sourcingCredits: newBalance }
          : { screeningCredits: newBalance };

      userCredits = await tx.userCredits.update({
        where: { userId },
        data: updateData,
      });

      // Log transaction
      await tx.creditTransaction.create({
        data: {
          userCreditsId: userCredits.id,
          type: TransactionType.DEBIT,
          category,
          amount: -amount, // Negative for debit
          balanceAfter: newBalance,
          referenceId,
          referenceType,
          description: description || `Deducted ${amount} ${category.toLowerCase()} credits`,
        },
      });

      return userCredits;
    });
  }

  /**
   * Refund credits to user's account
   */
  async refundCredits(
    userId: string,
    category: CreditCategory,
    amount: number,
    referenceId?: string,
    referenceType?: string,
    description?: string
  ) {
    return await prisma.$transaction(async (tx) => {
      let userCredits = await tx.userCredits.findUnique({
        where: { userId },
      });

      if (!userCredits) {
        throw new Error('User credits not found');
      }

      // Add credits back
      const currentBalance =
        category === 'SOURCING'
          ? userCredits.sourcingCredits
          : userCredits.screeningCredits;

      const newBalance = currentBalance + amount;
      const updateData =
        category === 'SOURCING'
          ? { sourcingCredits: newBalance }
          : { screeningCredits: newBalance };

      userCredits = await tx.userCredits.update({
        where: { userId },
        data: updateData,
      });

      // Log transaction
      await tx.creditTransaction.create({
        data: {
          userCreditsId: userCredits.id,
          type: TransactionType.REFUND,
          category,
          amount: amount, // Positive for refund
          balanceAfter: newBalance,
          referenceId,
          referenceType,
          description: description || `Refunded ${amount} ${category.toLowerCase()} credits`,
        },
      });

      return userCredits;
    });
  }

  /**
   * Reset user's credits based on their subscription plan (monthly reset)
   */
  async resetCredits(userId: string) {
    return await prisma.$transaction(async (tx) => {
      // Get user's subscription and plan
      const subscription = await tx.subscription.findUnique({
        where: { userId },
        include: { plan: true },
      });

      if (!subscription) {
        throw new Error('User subscription not found');
      }

      if (subscription.status !== 'ACTIVE') {
        throw new Error('User subscription is not active');
      }

      // Get or create user credits
      let userCredits = await tx.userCredits.findUnique({
        where: { userId },
      });

      if (!userCredits) {
        // Create if doesn't exist
        userCredits = await tx.userCredits.create({
          data: {
            userId,
            sourcingCredits: subscription.plan.sourcingCredits,
            screeningCredits: subscription.plan.screeningCredits,
            lastResetAt: new Date(),
          },
        });
      } else {
        // Reset to plan limits
        userCredits = await tx.userCredits.update({
          where: { userId },
          data: {
            sourcingCredits: subscription.plan.sourcingCredits,
            screeningCredits: subscription.plan.screeningCredits,
            lastResetAt: new Date(),
          },
        });
      }

      // Log reset transactions
      await tx.creditTransaction.createMany({
        data: [
          {
            userCreditsId: userCredits.id,
            type: TransactionType.RESET,
            category: CreditCategory.SOURCING,
            amount: subscription.plan.sourcingCredits,
            balanceAfter: subscription.plan.sourcingCredits,
            description: 'Monthly credit reset - sourcing',
          },
          {
            userCreditsId: userCredits.id,
            type: TransactionType.RESET,
            category: CreditCategory.SCREENING,
            amount: subscription.plan.screeningCredits,
            balanceAfter: subscription.plan.screeningCredits,
            description: 'Monthly credit reset - screening',
          },
        ],
      });

      return userCredits;
    });
  }

  /**
   * Initialize user credits when they first sign up or get a subscription
   */
  async initializeUserCredits(userId: string, planId: string) {
    const plan = await prisma.plan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new Error('Plan not found');
    }

    // Check if credits already exist
    const existing = await prisma.userCredits.findUnique({
      where: { userId },
    });

    if (existing) {
      return existing;
    }

    // Create user credits
    const userCredits = await prisma.userCredits.create({
      data: {
        userId,
        sourcingCredits: plan.sourcingCredits,
        screeningCredits: plan.screeningCredits,
      },
    });

    // Log initial credits
    await prisma.creditTransaction.createMany({
      data: [
        {
          userCreditsId: userCredits.id,
          type: TransactionType.CREDIT,
          category: CreditCategory.SOURCING,
          amount: plan.sourcingCredits,
          balanceAfter: plan.sourcingCredits,
          description: 'Initial sourcing credits',
        },
        {
          userCreditsId: userCredits.id,
          type: TransactionType.CREDIT,
          category: CreditCategory.SCREENING,
          amount: plan.screeningCredits,
          balanceAfter: plan.screeningCredits,
          description: 'Initial screening credits',
        },
      ],
    });

    return userCredits;
  }

  /**
   * Get transaction history for a user
   */
  async getTransactionHistory(
    userId: string,
    filters?: {
      category?: CreditCategory;
      type?: TransactionType;
      limit?: number;
      offset?: number;
    }
  ) {
    const userCredits = await prisma.userCredits.findUnique({
      where: { userId },
    });

    if (!userCredits) {
      return [];
    }

    const transactions = await prisma.creditTransaction.findMany({
      where: {
        userCreditsId: userCredits.id,
        ...(filters?.category && { category: filters.category }),
        ...(filters?.type && { type: filters.type }),
      },
      orderBy: { createdAt: 'desc' },
      take: filters?.limit || 50,
      skip: filters?.offset || 0,
    });

    return transactions;
  }
}

// Export singleton instance
export const creditService = new CreditService();
