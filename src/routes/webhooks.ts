import { Router } from 'express';
import { Webhook } from 'svix';
import { prisma } from '../lib/prisma';
import { subscriptionService } from '../services/subscription.service';

const router = Router();

// -------------------------
// POST: CLERK WEBHOOK
// -------------------------
router.post('/clerk', async (req, res, next) => {
  try {
    const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

    if (!WEBHOOK_SECRET) {
      console.error('CLERK_WEBHOOK_SECRET not configured');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    // Get headers
    const svix_id = req.headers['svix-id'] as string;
    const svix_timestamp = req.headers['svix-timestamp'] as string;
    const svix_signature = req.headers['svix-signature'] as string;

    // Verify webhook signature
    const wh = new Webhook(WEBHOOK_SECRET);
    let evt: any;

    try {
      evt = wh.verify(JSON.stringify(req.body), {
        'svix-id': svix_id,
        'svix-timestamp': svix_timestamp,
        'svix-signature': svix_signature,
      });
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).json({ error: 'Invalid signature' });
    }

    // Handle different event types
    const eventType = evt.type;
    const data = evt.data;
    const userId = data.id;

    console.log(`📥 Clerk webhook received: ${eventType} for user ${userId}`);
    console.log('Webhook data:', JSON.stringify(data, null, 2));

    switch (eventType) {
      case 'user.created':
        console.log('Processing user.created for ID:', userId);
        try {
          // Step 1: Create user in database
          await prisma.user.upsert({
            where: { id: userId },
            create: {
              id: userId,
              email: data.email_addresses?.[0]?.email_address,
              name: `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim(),
            },
            update: {},
          });
          console.log('✅ User created:', data.email_addresses?.[0]?.email_address);

          // Step 2: Auto-assign Free plan and credits
          const subscription = await subscriptionService.createSubscription(
            userId,
            'free'
          );

          console.log(
            `🎉 User ${userId} fully initialized:`,
            `- Plan: ${subscription.plan.name}`,
            `- Sourcing credits: ${subscription.plan.sourcingCredits}`,
            `- Screening credits: ${subscription.plan.screeningCredits}`
          );
        } catch (error: any) {
          console.error(`❌ Failed to setup user ${userId}:`, error.message);
          // Don't throw - webhook should still return 200
        }
        break;

      case 'user.updated':
        console.log('Processing user.updated for ID:', userId);
        try {
          await prisma.user.update({
            where: { id: userId },
            data: {
              email: data.email_addresses?.[0]?.email_address,
              name: `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim(),
            },
          });
          console.log('✅ User updated:', data.email_addresses?.[0]?.email_address);
        } catch (error: any) {
          console.error(`❌ Failed to update user ${userId}:`, error.message);
        }
        break;

      case 'user.deleted':
        console.log('Processing user.deleted for ID:', userId);
        try {
          await prisma.user.delete({
            where: { id: userId },
          });
          console.log('✅ User deleted (subscription + credits auto-deleted via CASCADE)');
        } catch (error: any) {
          console.error(`❌ Failed to delete user ${userId}:`, error.message);
        }
        break;

      default:
        console.log(`ℹ️ Unhandled event type: ${eventType}`);
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    next(error);
  }
});

export default router;
