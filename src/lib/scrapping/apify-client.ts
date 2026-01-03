// lib/scrapping/apify-client.ts

import { ApifyClient } from "apify-client";
import { RateLimitError } from "../errors/rate-limit-error";

// Initialize Apify client
const client = new ApifyClient({
  token: process.env.APIFY_API_TOKEN!,
});

export interface LinkedInSearchFilters {
  searchQuery?: string;
  currentJobTitles?: string[];
  pastJobTitles?: string[];
  locations?: string[];
  currentCompanies?: string[];
  industryIds?: number[];
  yearsOfExperienceIds?: string[]; // ✅ NEW
  seniorityLevelIds?: string[]; // ✅ NEW
  maxItems?: number;
  takePages?: number;
  _meta?: any;
}

export interface ProfileSearchResult {
  profileUrl: string;
  name: string;
  headline?: string;
  location?: string;
}

/**
 * Normalize filters for Apify compatibility
 * Apify expects string arrays for these fields
 */
// In normalizeFiltersForApify function:
function normalizeFiltersForApify(filters: LinkedInSearchFilters) {
  return {
    ...filters,
    industryIds: filters.industryIds?.map(String),
  };
}

/**
 * Search LinkedIn profiles using Apify actor
 * Uses harvestapi/linkedin-profile-search for discovery
 */
export async function searchLinkedInProfiles(
  searchFilters: LinkedInSearchFilters
): Promise<ProfileSearchResult[]> {
  try {
    console.log("🔍 Starting LinkedIn profile search...");

    // ✅ IMPORTANT: Remove _meta before processing (shouldn't go to Apify)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _meta, ...cleanFilters } = searchFilters;

    // ✅ Normalize before sending to Apify
    const normalizedFilters = normalizeFiltersForApify(cleanFilters);

    const actorInput: any = {
      profileScraperMode: "Full",
      maxItems: normalizedFilters.maxItems || 50,
      takePages:
        normalizedFilters.takePages ||
        Math.ceil((normalizedFilters.maxItems || 50) / 25),
    };

    if (normalizedFilters.searchQuery) {
      actorInput.searchQuery = normalizedFilters.searchQuery;
    }

    if (
      normalizedFilters.currentJobTitles &&
      normalizedFilters.currentJobTitles.length > 0
    ) {
      actorInput.currentJobTitles = normalizedFilters.currentJobTitles;
    }

    if (
      normalizedFilters.pastJobTitles &&
      normalizedFilters.pastJobTitles.length > 0
    ) {
      actorInput.pastJobTitles = normalizedFilters.pastJobTitles;
    }

    if (normalizedFilters.locations && normalizedFilters.locations.length > 0) {
      actorInput.locations = normalizedFilters.locations;
    }

    if (
      normalizedFilters.currentCompanies &&
      normalizedFilters.currentCompanies.length > 0
    ) {
      actorInput.currentCompanies = normalizedFilters.currentCompanies;
    }

    if (
      normalizedFilters.industryIds &&
      normalizedFilters.industryIds.length > 0
    ) {
      actorInput.industryIds = normalizedFilters.industryIds;
    }

    if (
      normalizedFilters.yearsOfExperienceIds &&
      normalizedFilters.yearsOfExperienceIds.length > 0
    ) {
      actorInput.yearsOfExperienceIds = normalizedFilters.yearsOfExperienceIds;
    }

    if (
      normalizedFilters.seniorityLevelIds &&
      normalizedFilters.seniorityLevelIds.length > 0
    ) {
      actorInput.seniorityLevelIds = normalizedFilters.seniorityLevelIds;
    }

    console.log(
      "🔧 Actor input (sending to Apify):",
      JSON.stringify(actorInput, null, 2)
    );

    const run = await client
      .actor("harvestapi/linkedin-profile-search")
      .call(actorInput);

    if (run.statusMessage === "rate limited") {
      const resetAt = new Date();
      resetAt.setHours(resetAt.getHours() + 1, 0, 0); // Default: next hour

      throw new RateLimitError("LinkedIn search API rate limit exceeded", {
        type: "apify_search",
        resetAt,
        message: "Profile search limit reached. Will retry automatically.",
      });
    }

    // Also add check for run.status:
    if (
      run.status === "FAILED" &&
      run.statusMessage?.toLowerCase().includes("limit")
    ) {
      const resetAt = new Date();
      resetAt.setHours(resetAt.getHours() + 1, 0, 0);

      throw new RateLimitError("LinkedIn search API limit exceeded", {
        type: "apify_search",
        resetAt,
        message: run.statusMessage || "Profile search limit reached.",
      });
    }

    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    console.log(`✅ Found ${items.length} profiles from search`);

    return mapSearchResults(items);
  } catch (error) {
    if (error instanceof RateLimitError) {
      throw error;
    }
    console.error("❌ Error searching LinkedIn profiles:", error);
    throw new Error("Failed to search LinkedIn profiles");
  }
}

/**
 * Map search results to our interface
 */
function mapSearchResults(items: any[]): ProfileSearchResult[] {
  return items
    .map((item: any) => ({
      profileUrl:
        item.linkedinUrl ||
        item.profileUrl ||
        `https://linkedin.com/in/${item.publicIdentifier}`,
      name: `${item.firstName || ""} ${item.lastName || ""}`.trim(),
      headline: item.headline,
      location: item.location?.linkedinText || item.location,
    }))
    .filter((result) => result.profileUrl);
}

/**
 * Scrape detailed LinkedIn profiles with email/phone enrichment
 * Uses dev_fusion/linkedin-profile-scraper
 */
export async function scrapeLinkedInProfiles(
  profileUrls: string[]
): Promise<any[]> {
  try {
    console.log(
      `🔍 Starting profile scraping for ${profileUrls.length} profiles...`
    );

    const run = await client.actor("dev_fusion/linkedin-profile-scraper").call({
      profileUrls,
    });

    // In scrapeLinkedInProfiles (around line 205):
    if (run.statusMessage === "rate limited") {
      const resetAt = new Date();
      resetAt.setHours(resetAt.getHours() + 1, 0, 0);

      throw new RateLimitError("LinkedIn scraping API rate limit exceeded", {
        type: "apify_scrape",
        resetAt,
        message: "Profile scraping limit reached. Will retry automatically."
      });
    }

    // Also add:
    if (run.status === "FAILED" && run.statusMessage?.toLowerCase().includes("limit")) {
      const resetAt = new Date();
      resetAt.setHours(resetAt.getHours() + 1, 0, 0);
      
      throw new RateLimitError("LinkedIn scraping API limit exceeded", {
        type: "apify_scrape",
        resetAt,
        message: run.statusMessage || "Profile scraping limit reached."
      });
    }

    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    console.log(`✅ Scraped ${items.length} profiles successfully`);

    return items;
  } catch (error) {
    if (error instanceof RateLimitError) {
      throw error;
    }
    console.error("❌ Error scraping profiles:", error);
    throw new Error("Failed to scrape LinkedIn profiles");
  }
}

/**
 * Scrape profiles in batches with parallel execution
 */
export async function scrapeProfilesInBatches(
  profileUrls: string[],
  batchSize: number = 20,
  maxParallel: number = 3
): Promise<any[]> {
  const batches: string[][] = [];

  for (let i = 0; i < profileUrls.length; i += batchSize) {
    batches.push(profileUrls.slice(i, i + batchSize));
  }

  const allResults: any[] = [];

  for (let i = 0; i < batches.length; i += maxParallel) {
    const batchGroup = batches.slice(i, i + maxParallel);

    const results = await Promise.all(
      batchGroup.map((batch) => scrapeLinkedInProfiles(batch))
    );

    allResults.push(...results.flat());

    if (i + maxParallel < batches.length) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  return allResults;
}
