// lib/sourcing/nodes/search-profiles.ts
import { prisma } from "../../prisma";
import { searchLinkedInProfiles } from "../../scrapping/apify-client";
import type { SourcingState } from "../state";

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
  
  // ✅ NEW STEP 2.5: Check if we have pending URLs from resume
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
  
  // ✅ STEP 3: Restore discoveredUrls from state or DB
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
  } else {
    console.log(`♻️ Using ${discoveredUrls.size} URLs from state`);
  }
  
  const searchTarget = Math.ceil(remaining * 2);
  console.log(`Current: ${currentCount}/${state.maxCandidates} | Need: ${remaining} | Searching: ${searchTarget}`);

  let foundProfiles: any[] = [];
  const strategies = ["precise", "broad", "alternative"];
  
  for (const strategy of strategies) {
    console.log(`\n🔎 Trying ${strategy.toUpperCase()} strategy...`);
    
    const query = state.searchQueries.find((q: any) => q.type === strategy);
    if (!query) {
      console.log(`⚠️ No ${strategy} query found, skipping`);
      continue;
    }
    
    const adjustedQuery = {
      ...query,
      maxItems: searchTarget,
    };
    
    try {
      const results = await searchLinkedInProfiles(adjustedQuery);
      
      console.log(`   Found ${results.length} profiles from search`);
      
      const newProfiles = results.filter((profile: any) => 
        profile.profileUrl && !discoveredUrls.has(profile.profileUrl)
      );
      
      console.log(`   ${newProfiles.length} are new (${results.length - newProfiles.length} duplicates removed)`);
      
      foundProfiles = [...foundProfiles, ...newProfiles];
      newProfiles.forEach((profile: any) => discoveredUrls.add(profile.profileUrl));
      
      if (foundProfiles.length >= searchTarget) {
        console.log(`✅ Found enough profiles (${foundProfiles.length}), stopping search`);
        break;
      }
      
      console.log(`   Need ${searchTarget - foundProfiles.length} more profiles, trying next strategy...`);
      
    } catch (error: any) {
      // ✅ NEW: Check if it's a rate limit error
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
            lastActivityAt: new Date()
          }
        });
        
        // Return current state (don't throw further)
        return {
          currentSearchResults: foundProfiles,
          discoveredUrls: discoveredUrls,
          searchIterations: state.searchIterations + 1,
          candidatesWithEmails: currentCount,
          currentStage: "RATE_LIMITED"
        };
      }
      
      // ✅ Existing error handling for non-rate-limit errors
      console.error(`❌ ${strategy} search failed:`, error.message);
      
      await prisma.sourcingJob.update({
        where: { id: state.jobId },
        data: {
          errorMessage: `Search ${strategy} failed: ${error.message}`,
          lastActivityAt: new Date()
        }
      });
  
  continue;
    }
  }
  
  console.log(`\n✅ Search complete: Found ${foundProfiles.length} new profiles (Total discovered: ${discoveredUrls.size})\n`);
  
  // ✅ STEP 4: Save checkpoint with lastCompletedStage
  await prisma.sourcingJob.update({
    where: { id: state.jobId },
    data: {
      discoveredUrls: Array.from(discoveredUrls) as any,
      status: "SEARCHING_PROFILES",
      currentStage: `SEARCH_ITERATION_${state.searchIterations + 1}`,
      lastCompletedStage: "search_profiles",
      lastActivityAt: new Date()
    }
  });
  
  return {
    currentSearchResults: foundProfiles,
    discoveredUrls: discoveredUrls,
    searchIterations: state.searchIterations + 1,
    candidatesWithEmails: currentCount,
    currentStage: "SEARCH_COMPLETE"
  };
}
