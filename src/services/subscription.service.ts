import { prisma } from '../lib/prisma';
import { SubscriptionStatus } from '@prisma/client';
import { addMonths } from 'date-fns';
import { creditService } from './credit.service';

export class SubscriptionService {
  /**
   * Get user's current subscription
   */
  async getUserSubscription(userId: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });

    return subscription;
  }

  /**
   * Create a new subscription for a user (auto-assigns Free plan by default)
   */
  async createSubscription(userId: string, planSlug: string = 'free') {
    // Check if subscription already exists
    const existing = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (existing) {
      throw new Error('User already has a subscription');
    }

    // Get plan
    const plan = await prisma.plan.findUnique({
      where: { slug: planSlug },
    });

    if (!plan) {
      throw new Error(`Plan "${planSlug}" not found`);
    }

    // Create subscription
    const subscription = await prisma.subscription.create({
      data: {
        userId,
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: new Date(),
        currentPeriodEnd: addMonths(new Date(), 1), // 1 month from now
      },
      include: { plan: true },
    });

    // Initialize user credits
    await creditService.initializeUserCredits(userId, plan.id);

    return subscription;
  }

  /**
   * Upgrade or downgrade user's plan
   */
  async changePlan(userId: string, newPlanSlug: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });

    if (!subscription) {
      throw new Error('User subscription not found');
    }

    // Get new plan
    const newPlan = await prisma.plan.findUnique({
      where: { slug: newPlanSlug },
    });

    if (!newPlan) {
      throw new Error(`Plan "${newPlanSlug}" not found`);
    }

    if (subscription.planId === newPlan.id) {
      throw new Error('User is already on this plan');
    }

    // Update subscription
    const updatedSubscription = await prisma.subscription.update({
      where: { userId },
      data: {
        planId: newPlan.id,
        currentPeriodStart: new Date(),
        currentPeriodEnd: addMonths(new Date(), 1),
      },
      include: { plan: true },
    });

    // Reset credits to new plan limits immediately
    await creditService.resetCredits(userId);

    return updatedSubscription;
  }

  /**
   * Cancel user's subscription
   */
  async cancelSubscription(userId: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription) {
      throw new Error('User subscription not found');
    }

    // Update status to CANCELLED
    const cancelled = await prisma.subscription.update({
      where: { userId },
      data: {
        status: SubscriptionStatus.CANCELLED,
        cancelledAt: new Date(),
      },
      include: { plan: true },
    });

    return cancelled;
  }

  /**
   * Renew subscription (called monthly by cron job)
   */
  async renewSubscription(userId: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });

    if (!subscription) {
      throw new Error('User subscription not found');
    }

    if (subscription.status !== SubscriptionStatus.ACTIVE) {
      throw new Error('Cannot renew inactive subscription');
    }

    // Update subscription period
    const renewed = await prisma.subscription.update({
      where: { userId },
      data: {
        currentPeriodStart: subscription.currentPeriodEnd,
        currentPeriodEnd: addMonths(subscription.currentPeriodEnd, 1),
      },
      include: { plan: true },
    });

    // Reset credits
    await creditService.resetCredits(userId);

    return renewed;
  }

  /**
   * Handle expired subscriptions (called by cron job)
   */
  async handleExpiredSubscriptions() {
    const now = new Date();

    // Find all subscriptions that have expired
    const expiredSubscriptions = await prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: {
          lte: now,
        },
      },
      include: { plan: true },
    });

    const results = [];

    for (const subscription of expiredSubscriptions) {
      try {
        // Renew subscription
        const renewed = await this.renewSubscription(subscription.userId);
        results.push({
          userId: subscription.userId,
          status: 'renewed',
          subscription: renewed,
        });
      } catch (error: any) {
        console.error(
          `Failed to renew subscription for user ${subscription.userId}:`,
          error.message
        );
        results.push({
          userId: subscription.userId,
          status: 'failed',
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Get all available plans
   */
  async getAvailablePlans() {
    const plans = await prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { priceInRupees: 'asc' },
    });

    return plans;
  }

  /**
   * Get plan by slug
   */
  async getPlanBySlug(slug: string) {
    const plan = await prisma.plan.findUnique({
      where: { slug },
    });

    return plan;
  }

  /**
   * Ensure user has a subscription (create Free plan if not)
   */
  async ensureUserHasSubscription(userId: string) {
    let subscription = await this.getUserSubscription(userId);

    if (!subscription) {
      // Auto-assign Free plan
      subscription = await this.createSubscription(userId, 'free');
    }

    return subscription;
  }
}

// Export singleton instance
export const subscriptionService = new SubscriptionService();
