// lib/sourcing/nodes/generate-queries.ts

import { prisma } from "../../prisma";
import type { SourcingState } from "../state";

export async function generateSearchQueries(state: SourcingState) {
  console.log("🔍 Generating search strategies...");

  try {
    // ✅ STEP 1: Check state first
    let searchFilters = state.searchFilters;

    // ✅ STEP 2: If not in state, get from database
    if (!searchFilters) {
      console.log("📂 searchFilters not in state, checking database...");
      const job = await prisma.sourcingJob.findUnique({
        where: { id: state.jobId },
        select: { 
          searchFilters: true,
          lastCompletedStage: true 
        },
      });
      
      searchFilters = job?.searchFilters as any;
      
      // ✅ STEP 3: Skip if already completed
      if (job?.lastCompletedStage === "generate_queries" && searchFilters) {
        console.log("♻️ Queries already generated, skipping");
        
        // Reconstruct queries from filters
        const meta = (searchFilters as any)._meta || {};
        const queries = [];
        
        // Precise strategy
        queries.push({
          type: "precise",
          searchQuery: (searchFilters as any).searchQuery,
          currentJobTitles: (searchFilters as any).currentJobTitles,
          locations: (searchFilters as any).locations,
          industryIds: (searchFilters as any).industryIds,
          yearsOfExperienceIds: (searchFilters as any).yearsOfExperienceIds,
          seniorityLevelIds: (searchFilters as any).seniorityLevelIds,
          maxItems: state.maxCandidates,
          takePages: (searchFilters as any).takePages,
        });
        
        // Broad strategy
        queries.push({
          type: "broad",
          searchQuery: (searchFilters as any).searchQuery,
          currentJobTitles: (searchFilters as any).currentJobTitles?.slice(0, 3),
          locations: (searchFilters as any).locations,
          yearsOfExperienceIds: (searchFilters as any).yearsOfExperienceIds,
          seniorityLevelIds: (searchFilters as any).seniorityLevelIds,
          maxItems: state.maxCandidates,
          takePages: (searchFilters as any).takePages,
        });
        
        // Alternative strategy
        if (meta.niceToHaveSkills && meta.niceToHaveSkills.length > 0) {
          const alternativeQuery = meta.niceToHaveSkills.slice(0, 3).join(" AND ");
          queries.push({
            type: "alternative",
            searchQuery: alternativeQuery,
            currentJobTitles: (searchFilters as any).currentJobTitles,
            locations: (searchFilters as any).locations,
            yearsOfExperienceIds: (searchFilters as any).yearsOfExperienceIds,
            seniorityLevelIds: (searchFilters as any).seniorityLevelIds,
            maxItems: state.maxCandidates,
            takePages: (searchFilters as any).takePages,
          });
        }
        
        return {
          searchFilters: searchFilters,
          searchQueries: queries,
          currentQueryIndex: 0,
          searchAttempts: 0,
          currentStage: "QUERY_GENERATED",
        };
      }
    }

    if (!searchFilters) {
      throw new Error("Search filters not found in state or database");
    }

    // ✅ Generate queries for first time
    const meta = (searchFilters as any)._meta || {};
    const queries = [];

    // === STRATEGY 1: PRECISE ===
    queries.push({
      type: "precise",
      searchQuery: (searchFilters as any).searchQuery,
      currentJobTitles: (searchFilters as any).currentJobTitles,
      locations: (searchFilters as any).locations,
      industryIds: (searchFilters as any).industryIds,
      yearsOfExperienceIds: (searchFilters as any).yearsOfExperienceIds,
      seniorityLevelIds: (searchFilters as any).seniorityLevelIds,
      maxItems: state.maxCandidates,
      takePages: (searchFilters as any).takePages,
    });

    // === STRATEGY 2: BROAD ===
    queries.push({
      type: "broad",
      searchQuery: (searchFilters as any).searchQuery,
      currentJobTitles: (searchFilters as any).currentJobTitles?.slice(0, 3),
      locations: (searchFilters as any).locations,
      yearsOfExperienceIds: (searchFilters as any).yearsOfExperienceIds,
      seniorityLevelIds: (searchFilters as any).seniorityLevelIds,
      maxItems: state.maxCandidates,
      takePages: (searchFilters as any).takePages,
    });

    // === STRATEGY 3: ALTERNATIVE ===
    if (meta.niceToHaveSkills && meta.niceToHaveSkills.length > 0) {
      const alternativeQuery = meta.niceToHaveSkills.slice(0, 3).join(" AND ");
      queries.push({
        type: "alternative",
        searchQuery: alternativeQuery,
        currentJobTitles: (searchFilters as any).currentJobTitles,
        locations: (searchFilters as any).locations,
        yearsOfExperienceIds: (searchFilters as any).yearsOfExperienceIds,
        seniorityLevelIds: (searchFilters as any).seniorityLevelIds,
        maxItems: state.maxCandidates,
        takePages: (searchFilters as any).takePages,
      });
    }

    console.log(`✅ Generated ${queries.length} search strategies`);

    await prisma.sourcingJob.update({
      where: { id: state.jobId },
      data: {
        status: "SEARCHING_PROFILES",
        currentStage: "QUERY_GENERATED",
        lastCompletedStage: "generate_queries",
        lastActivityAt: new Date(),
      },
    });

    return {
      searchFilters: searchFilters,
      searchQueries: queries,
      currentQueryIndex: 0,
      searchAttempts: 0,
      currentStage: "QUERY_GENERATED",
    };
  } catch (error: any) {
    console.error("❌ Generate queries failed:", error.message);

    await prisma.sourcingJob.update({
      where: { id: state.jobId },
      data: {
        status: "FAILED",
        errorMessage: error.message,
        failedAt: new Date(),
      },
    });

    return {
      errors: [
        {
          stage: "generate_queries",
          message: error.message,
          timestamp: new Date(),
          retryable: true,
        },
      ],
      currentStage: "QUERY_GENERATION_FAILED",
    };
  }
}
