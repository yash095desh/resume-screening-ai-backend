// lib/sourcing/nodes/search-profiles.ts
import { prisma } from "../../prisma";
import { searchLinkedInProfiles } from "../../scrapping/apify-client";
import type { SourcingState } from "../state";

/**
 * Select next query based on tier priority
 * - Tries to find unused query in lowest available tier (1 → 2 → 3)
 * - If preferTier specified, tries that tier first
 */
function selectNextQueryByTier(
  queries: any[],
  usedIndices: Set<number>,
  preferTier: number | null = null
): any | null {
  // Group queries by tier
  const tierGroups: { [key: number]: any[] } = {
    1: [],
    2: [],
    3: []
  };

  queries.forEach((query) => {
    if (query.tier && tierGroups[query.tier]) {
      tierGroups[query.tier].push(query);
    }
  });

  // If specific tier preferred, try that first
  if (preferTier && tierGroups[preferTier]) {
    const available = tierGroups[preferTier].filter(
      (q) => !usedIndices.has(q.queryId)
    );
    if (available.length > 0) {
      return available[0];
    }
  }

  // Otherwise, try tiers in priority order (1 → 2 → 3)
  for (let tier = 1; tier <= 3; tier++) {
    const available = tierGroups[tier].filter(
      (q) => !usedIndices.has(q.queryId)
    );
    if (available.length > 0) {
      return available[0];
    }
  }

  return null; // All queries exhausted
}

export async function searchProfiles(state: SourcingState) {
  console.log(`\n🔍 SEARCH ITERATION ${state.searchIterations + 1}`);

  // ✅ STEP 1: Get current count from state OR database
  let currentCount = state.candidatesWithEmails || 0;

  if (currentCount === 0) {
    console.log("📂 Checking database for existing candidates...");
    const dbCount = await prisma.linkedInCandidate.count({
      where: {
        sourcingJobId: state.jobId,
        hasContactInfo: true
      }
    });

    if (dbCount > 0) {
      currentCount = dbCount;
      console.log(`♻️ Found ${dbCount} existing candidates in database`);
    }
  } else {
    console.log(`♻️ Using ${currentCount} candidates from state`);
  }

  // ✅ STEP 2: Check if we already have enough candidates
  const remaining = state.maxCandidates - currentCount;

  if (remaining <= 0) {
    console.log(`✅ Target already reached (${currentCount}/${state.maxCandidates})`);
    return {
      currentSearchResults: [],
      discoveredUrls: state.discoveredUrls || new Set(),
      searchIterations: state.searchIterations,
      candidatesWithEmails: currentCount,
      currentStage: "SEARCH_NOT_NEEDED"
    };
  }

  // ✅ STEP 2.5: Check if we have pending URLs from previous search
  if (state.currentSearchResults && state.currentSearchResults.length > 0) {
    console.log(`♻️ Found ${state.currentSearchResults.length} pending URLs from previous search, skipping new search`);

    // Restore discoveredUrls from state or DB
    let discoveredUrls = state.discoveredUrls;

    if (!discoveredUrls || discoveredUrls.size === 0) {
      console.log("📂 discoveredUrls not in state, checking database...");
      const job = await prisma.sourcingJob.findUnique({
        where: { id: state.jobId },
        select: { discoveredUrls: true }
      });

      if (job?.discoveredUrls && Array.isArray(job.discoveredUrls)) {
        discoveredUrls = new Set(job.discoveredUrls as string[]);
        console.log(`♻️ Restored ${discoveredUrls.size} URLs from database`);
      } else {
        discoveredUrls = new Set();
      }
    }

    // Just return the pending URLs for enrichment
    return {
      currentSearchResults: state.currentSearchResults,
      discoveredUrls: discoveredUrls,
      searchIterations: state.searchIterations,
      candidatesWithEmails: currentCount,
      currentStage: "SEARCH_COMPLETE_PENDING_URLS"
    };
  }

  // ✅ STEP 3: Initialize tracking sets
  let discoveredUrls = state.discoveredUrls || new Set();
  let usedQueryIndices = state.usedQueryIndices || new Set();

  // Restore from database if not in state
  if (discoveredUrls.size === 0 || usedQueryIndices.size === 0) {
    console.log("📂 Restoring state from database...");
    const job = await prisma.sourcingJob.findUnique({
      where: { id: state.jobId },
      select: {
        discoveredUrls: true,
        usedQueryIndices: true
      }
    });

    if (job?.discoveredUrls && Array.isArray(job.discoveredUrls)) {
      discoveredUrls = new Set(job.discoveredUrls as string[]);
      console.log(`   ♻️ Restored ${discoveredUrls.size} discovered URLs`);
    }

    if (job?.usedQueryIndices && Array.isArray(job.usedQueryIndices)) {
      usedQueryIndices = new Set(job.usedQueryIndices as number[]);
      console.log(`   ♻️ Restored ${usedQueryIndices.size} used query indices`);
    }
  }

  const searchTarget = Math.ceil(remaining * 2);
  console.log(`Current: ${currentCount}/${state.maxCandidates} | Need: ${remaining} | Searching for: ${searchTarget}`);

  // ✅ STEP 4: Select next query using tier-based selection
  const selectedQuery = selectNextQueryByTier(
    state.searchQueries,
    usedQueryIndices
  );

  if (!selectedQuery) {
    console.log("⚠️ All queries exhausted across all tiers");
    return {
      currentSearchResults: [],
      discoveredUrls,
      usedQueryIndices,
      searchIterations: state.searchIterations + 1,
      candidatesWithEmails: currentCount,
      currentStage: "ALL_QUERIES_EXHAUSTED"
    };
  }

  console.log(`\n🎯 Using TIER ${selectedQuery.tier} - ${selectedQuery.type.toUpperCase()} (variant ${selectedQuery.variant})`);
  console.log(`   Description: ${selectedQuery.description}`);
  console.log(`   Query ID: ${selectedQuery.queryId}`);

  let foundProfiles: any[] = [];
  const MIN_RESULTS_THRESHOLD = 5;
  const MAX_QUERIES_PER_ITERATION = 2;
  let queriesTriedThisIteration = 0;

  // ✅ STEP 5: Try primary query
  try {
    const adjustedQuery = {
      ...selectedQuery,
      maxItems: searchTarget,
    };

    console.log(`   Searching LinkedIn...`);
    const results = await searchLinkedInProfiles(adjustedQuery);

    console.log(`   Found ${results.length} profiles from search`);

    const newProfiles = results.filter((profile: any) =>
      profile.profileUrl && !discoveredUrls.has(profile.profileUrl)
    );

    console.log(`   ${newProfiles.length} are new (${results.length - newProfiles.length} duplicates removed)`);

    foundProfiles = newProfiles;
    newProfiles.forEach((profile: any) => discoveredUrls.add(profile.profileUrl));

    // Mark query as used
    usedQueryIndices.add(selectedQuery.queryId);
    queriesTriedThisIteration++;

    // ✅ STEP 6: Fallback if insufficient results
    if (newProfiles.length < MIN_RESULTS_THRESHOLD && queriesTriedThisIteration < MAX_QUERIES_PER_ITERATION) {
      console.log(`\n   ⚠️ Only ${newProfiles.length} new profiles (< ${MIN_RESULTS_THRESHOLD}), trying fallback...`);

      // Try to get another query from the SAME tier first
      const fallbackQuery = selectNextQueryByTier(
        state.searchQueries,
        usedQueryIndices,
        selectedQuery.tier // Prefer same tier
      );

      if (fallbackQuery) {
        console.log(`   🔄 Fallback: TIER ${fallbackQuery.tier} - ${fallbackQuery.type.toUpperCase()} (variant ${fallbackQuery.variant})`);

        try {
          const fallbackAdjustedQuery = {
            ...fallbackQuery,
            maxItems: searchTarget,
          };

          const fallbackResults = await searchLinkedInProfiles(fallbackAdjustedQuery);

          const newFallbackProfiles = fallbackResults.filter((profile: any) =>
            profile.profileUrl && !discoveredUrls.has(profile.profileUrl)
          );

          console.log(`   Found ${fallbackResults.length} profiles, ${newFallbackProfiles.length} new`);

          foundProfiles = [...foundProfiles, ...newFallbackProfiles];
          newFallbackProfiles.forEach((profile: any) => discoveredUrls.add(profile.profileUrl));

          usedQueryIndices.add(fallbackQuery.queryId);
          queriesTriedThisIteration++;

        } catch (fallbackError: any) {
          console.error(`   ❌ Fallback query failed:`, fallbackError.message);
          // Continue with what we have
        }
      } else {
        console.log(`   ℹ️ No fallback queries available`);
      }
    }

    if (foundProfiles.length >= searchTarget) {
      console.log(`\n✅ Found enough profiles (${foundProfiles.length}/${searchTarget})`);
    } else {
      console.log(`\n📊 Found ${foundProfiles.length}/${searchTarget} profiles (will continue in next iteration)`);
    }

  } catch (error: any) {
    // ✅ Check if it's a rate limit error
    if (error.name === "RateLimitError") {
      console.error(`🛑 Rate limited by ${error.metadata.type}`);

      // Save rate limit info to database
      await prisma.sourcingJob.update({
        where: { id: state.jobId },
        data: {
          status: "RATE_LIMITED",
          rateLimitHitAt: new Date(),
          rateLimitResetAt: error.metadata.resetAt,
          rateLimitService: error.metadata.type,
          errorMessage: error.metadata.message || error.message,
          lastActivityAt: new Date(),
          discoveredUrls: Array.from(discoveredUrls) as any,
          usedQueryIndices: Array.from(usedQueryIndices) as any
        }
      });

      // Return current state (don't throw further)
      return {
        currentSearchResults: foundProfiles,
        discoveredUrls: discoveredUrls,
        usedQueryIndices: usedQueryIndices,
        searchIterations: state.searchIterations + 1,
        candidatesWithEmails: currentCount,
        currentStage: "RATE_LIMITED"
      };
    }

    // ✅ Other errors
    console.error(`❌ Search failed:`, error.message);

    await prisma.sourcingJob.update({
      where: { id: state.jobId },
      data: {
        errorMessage: `Search failed: ${error.message}`,
        lastActivityAt: new Date(),
        discoveredUrls: Array.from(discoveredUrls) as any,
        usedQueryIndices: Array.from(usedQueryIndices) as any
      }
    });

    // Return what we have so far
    return {
      currentSearchResults: foundProfiles,
      discoveredUrls: discoveredUrls,
      usedQueryIndices: usedQueryIndices,
      searchIterations: state.searchIterations + 1,
      candidatesWithEmails: currentCount,
      currentStage: "SEARCH_FAILED"
    };
  }

  console.log(`\n✅ Search complete: Found ${foundProfiles.length} new profiles (Total discovered: ${discoveredUrls.size})`);
  console.log(`📊 Used queries: ${usedQueryIndices.size}/${state.searchQueries.length}\n`);

  // ✅ STEP 7: Save checkpoint with lastCompletedStage
  await prisma.sourcingJob.update({
    where: { id: state.jobId },
    data: {
      discoveredUrls: Array.from(discoveredUrls) as any,
      usedQueryIndices: Array.from(usedQueryIndices) as any,
      status: "SEARCHING_PROFILES",
      currentStage: `SEARCH_ITERATION_${state.searchIterations + 1}`,
      lastCompletedStage: "search_profiles",
      lastActivityAt: new Date()
    }
  });

  return {
    currentSearchResults: foundProfiles,
    discoveredUrls: discoveredUrls,
    usedQueryIndices: usedQueryIndices,
    searchIterations: state.searchIterations + 1,
    candidatesWithEmails: currentCount,
    currentStage: "SEARCH_COMPLETE"
  };
}
