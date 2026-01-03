// lib/errors/rate-limit-error.ts

export interface RateLimitMetadata {
  type: "apify_search" | "apify_scrape" | "salesql";
  resetAt: Date;
  retryAfter?: number; // seconds
  message?: string;
}

export class RateLimitError extends Error {
  public metadata: RateLimitMetadata;

  constructor(message: string, metadata: RateLimitMetadata) {
    super(message);
    this.name = "RateLimitError";
    this.metadata = metadata;
  }
}