/**
 * Token Generator for Interview Links
 * Generates secure, unique tokens for interview links
 */

import crypto from 'crypto';

/**
 * Generate a secure random token for interview links
 * @param length - Length of the token (default: 32)
 * @returns Unique token string
 */
export function generateInterviewToken(length: number = 32): string {
  return crypto
    .randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
}

/**
 * Generate interview link URL
 * @param token - Unique interview token
 * @param appUrl - Base application URL (from env)
 * @returns Complete interview link URL
 */
export function generateInterviewLink(token: string, appUrl?: string): string {
  const baseUrl = appUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${baseUrl}/interview/${token}`;
}

/**
 * Calculate expiry date for interview link
 * @param hours - Hours until expiry (default: 48)
 * @returns Date object for expiry time
 */
export function calculateExpiryDate(hours: number = 48): Date {
  const now = new Date();
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

/**
 * Check if interview link has expired
 * @param expiryDate - Expiry date to check
 * @returns True if expired, false otherwise
 */
export function isLinkExpired(expiryDate: Date): boolean {
  return new Date() > new Date(expiryDate);
}

/**
 * Get hours remaining until expiry
 * @param expiryDate - Expiry date
 * @returns Hours remaining (rounded up), minimum 0
 */
export function getHoursRemaining(expiryDate: Date): number {
  const now = new Date();
  const diff = new Date(expiryDate).getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60)));
}
