import { Router } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { subscriptionService } from '../services/subscription.service';
import { z } from 'zod';

const router = Router();

// Validation schema
const upgradePlanSchema = z.object({
  planSlug: z.string().min(1),
});

// -------------------------
// GET: USER'S CURRENT SUBSCRIPTION
// -------------------------
router.get('/', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { userId } = req;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Ensure user has a subscription (auto-create Free if not)
    const subscription = await subscriptionService.ensureUserHasSubscription(userId);

    res.json({
      success: true,
      subscription,
    });
  } catch (error: any) {
    console.error('Error fetching subscription:', error);
    next(error);
  }
});

// -------------------------
// POST: UPGRADE/CHANGE PLAN
// -------------------------
router.post('/upgrade', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { userId } = req;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Validate request body
    const parseResult = upgradePlanSchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error,
      });
    }

    const { planSlug } = parseResult.data;

    // Change plan
    const updatedSubscription = await subscriptionService.changePlan(userId, planSlug);

    res.json({
      success: true,
      message: `Successfully upgraded to ${updatedSubscription.plan.name} plan`,
      subscription: updatedSubscription,
    });
  } catch (error: any) {
    console.error('Error upgrading plan:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    if (error.message.includes('already on this plan')) {
      return res.status(400).json({ error: error.message });
    }

    next(error);
  }
});

// -------------------------
// POST: CANCEL SUBSCRIPTION
// -------------------------
router.post('/cancel', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { userId } = req;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const cancelledSubscription = await subscriptionService.cancelSubscription(userId);

    res.json({
      success: true,
      message: 'Subscription cancelled successfully',
      subscription: cancelledSubscription,
    });
  } catch (error: any) {
    console.error('Error cancelling subscription:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    next(error);
  }
});

export default router;
