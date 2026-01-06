import { Router } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { creditService } from '../services/credit.service';
import { CreditCategory, TransactionType } from '@prisma/client';

const router = Router();

// -------------------------
// GET: USER'S CREDIT BALANCE
// -------------------------
router.get('/balance', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { userId } = req;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const balance = await creditService.getBalance(userId);

    res.json({
      success: true,
      balance,
    });
  } catch (error: any) {
    console.error('Error fetching credit balance:', error);
    next(error);
  }
});

// -------------------------
// GET: TRANSACTION HISTORY
// -------------------------
router.get('/history', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { userId } = req;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Parse query parameters
    const category = req.query.category as CreditCategory | undefined;
    const type = req.query.type as TransactionType | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

    // Validate category if provided
    if (category && !['SOURCING', 'SCREENING'].includes(category)) {
      return res.status(400).json({
        error: 'Invalid category. Must be SOURCING or SCREENING',
      });
    }

    // Validate type if provided
    if (type && !['CREDIT', 'DEBIT', 'RESET', 'REFUND'].includes(type)) {
      return res.status(400).json({
        error: 'Invalid type. Must be CREDIT, DEBIT, RESET, or REFUND',
      });
    }

    const transactions = await creditService.getTransactionHistory(userId, {
      category,
      type,
      limit,
      offset,
    });

    res.json({
      success: true,
      count: transactions.length,
      limit,
      offset,
      transactions,
    });
  } catch (error: any) {
    console.error('Error fetching transaction history:', error);
    next(error);
  }
});

export default router;
