import { Router } from 'express';
import { subscriptionService } from '../services/subscription.service';

const router = Router();

// -------------------------
// GET: ALL AVAILABLE PLANS
// -------------------------
router.get('/', async (req, res, next) => {
  try {
    const plans = await subscriptionService.getAvailablePlans();

    res.json({
      success: true,
      count: plans.length,
      plans,
    });
  } catch (error: any) {
    console.error('Error fetching plans:', error);
    next(error);
  }
});

// -------------------------
// GET: PLAN BY SLUG
// -------------------------
router.get('/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params;

    const plan = await subscriptionService.getPlanBySlug(slug);

    if (!plan) {
      return res.status(404).json({
        error: 'Plan not found',
      });
    }

    res.json({
      success: true,
      plan,
    });
  } catch (error: any) {
    console.error('Error fetching plan:', error);
    next(error);
  }
});

export default router;
