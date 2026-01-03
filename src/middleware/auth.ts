import { Request, Response, NextFunction } from 'express';
import { clerkClient } from '@clerk/clerk-sdk-node';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  user?: any;
}

export const requireAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized - No token provided' });
    }

    const token = authHeader.substring(7);

    const sessionClaims = await clerkClient.verifyToken(token, {
      issuer: process.env.CLERK_ISSUER!,
    });


    if (!sessionClaims.sub) {
      return res.status(401).json({ error: 'Unauthorized - Invalid token' });
    }

    req.userId = sessionClaims.sub;
    next();
  } catch (error: any) {
    console.error('Auth error:', error);
    return res.status(401).json({ error: 'Unauthorized - Token verification failed' });
  }
};