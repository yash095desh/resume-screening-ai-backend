// lib/sourcing/nodes/generate-queries.ts

import { prisma } from "../../prisma";
import type { SourcingState } from "../state";

/**
 * Generate tiered queries from AI-generated search filter variants
 * For each variant, creates: Tier 1 (precise), Tier 2 (broad), Tier 3 (alternative)
 */
export async function generateSearchQueries(state: SourcingState) {
  console.log("🔍 Generating tiered queries from AI-generated variants...");

  try {
    // ✅ STEP 1: Get searchFiltersVariants from state
    let searchFiltersVariants = state.searchFiltersVariants;

    // ✅ STEP 2: If not in state, get from database
    if (!searchFiltersVariants || searchFiltersVariants.length === 0) {
      console.log("📂 searchFiltersVariants not in state, checking database...");
      const job = await prisma.sourcingJob.findUnique({
        where: { id: state.jobId },
        select: {
          searchFilters: true,
          lastCompletedStage: true
        },
      });

      const searchFiltersData = job?.searchFilters as any;

      // Handle both new format (array) and old format (single object)
      if (Array.isArray(searchFiltersData)) {
        searchFiltersVariants = searchFiltersData;
        console.log(`♻️ Found ${searchFiltersVariants.length} variants in database`);
      } else if (searchFiltersData) {
        // Old format: convert single object to array
        searchFiltersVariants = [searchFiltersData];
        console.log("♻️ Found legacy format, converted to 1 variant");
      }

      // ✅ STEP 3: Skip if already completed
      if (job?.lastCompletedStage === "generate_queries" && searchFiltersVariants && searchFiltersVariants.length > 0) {
        console.log("♻️ Queries already generated, reconstructing from variants");

        // Regenerate queries from variants (same logic as below)
        const queries = generateQueriesFromVariants(searchFiltersVariants, state.maxCandidates);

        console.log(`♻️ Reconstructed ${queries.length} queries from ${searchFiltersVariants.length} variants`);

        return {
          searchFiltersVariants: searchFiltersVariants,
          searchQueries: queries,
          currentStage: "QUERY_GENERATED",
        };
      }
    }

    if (!searchFiltersVariants || searchFiltersVariants.length === 0) {
      throw new Error("Search filter variants not found in state or database");
    }

    // ✅ STEP 4: Generate tiered queries from each variant
    console.log(`\n🎯 Generating queries from ${searchFiltersVariants.length} AI variants...\n`);

    const queries = generateQueriesFromVariants(searchFiltersVariants, state.maxCandidates);

    console.log(`\n✅ Generated ${queries.length} total queries:`);
    console.log(`   - ${searchFiltersVariants.length} variants × 3 tiers each`);
    console.log(`   - Tier 1 (Precise): ${searchFiltersVariants.length} queries`);
    console.log(`   - Tier 2 (Broad): ${searchFiltersVariants.length} queries`);
    console.log(`   - Tier 3 (Alternative): ${searchFiltersVariants.length} queries\n`);

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
      searchFiltersVariants: searchFiltersVariants,
      searchQueries: queries,
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

/**
 * Helper function to generate queries from variants
 * Creates Tier 1, 2, 3 for each AI variant
 */
function generateQueriesFromVariants(variants: any[], maxCandidates: number) {
  const queries: any = [];
  let queryId = 0;

  variants.forEach((variant, variantIdx) => {
    const variantNum = variantIdx + 1;

    console.log(`📋 Variant ${variantNum}: ${variant.variantReasoning || 'AI-generated variant'}`);
    console.log(`   Query: "${variant.searchQuery}"`);
    console.log(`   Titles: [${variant.currentJobTitles?.slice(0, 3).join(', ')}]`);

    // === TIER 1: PRECISE (use AI variant as-is with all filters) ===
    queries.push({
      tier: 1,
      type: "precise",
      variant: variantNum,
      queryId: queryId++,
      description: `Variant ${variantNum} - Precise (all filters)`,
      variantReasoning: variant.variantReasoning,
      searchQuery: variant.searchQuery,
      currentJobTitles: variant.currentJobTitles,
      locations: variant.locations,
      industryIds: variant.industryIds,
      yearsOfExperienceIds: variant.yearsOfExperienceIds,
      seniorityLevelIds: variant.seniorityLevelIds,
      maxItems: maxCandidates,
      takePages: variant.takePages || [1, 2, 3]
    });

    // === TIER 2: BROAD (remove industry filter for wider reach) ===
    queries.push({
      tier: 2,
      type: "broad",
      variant: variantNum,
      queryId: queryId++,
      description: `Variant ${variantNum} - Broad (no industry filter)`,
      variantReasoning: variant.variantReasoning,
      searchQuery: variant.searchQuery,
      currentJobTitles: variant.currentJobTitles?.slice(0, 5) || [],
      locations: variant.locations,
      industryIds: [], // ← Removed for broader search
      yearsOfExperienceIds: variant.yearsOfExperienceIds,
      seniorityLevelIds: variant.seniorityLevelIds,
      maxItems: maxCandidates,
      takePages: variant.takePages || [1, 2, 3]
    });

    // === TIER 3: ALTERNATIVE (OR logic for maximum reach) ===
    const altQuery = variant.searchQuery
      ? variant.searchQuery.replace(/ AND /g, ' OR ')
      : variant.searchQuery;

    queries.push({
      tier: 3,
      type: "alternative",
      variant: variantNum,
      queryId: queryId++,
      description: `Variant ${variantNum} - Alternative (OR logic)`,
      variantReasoning: variant.variantReasoning,
      searchQuery: altQuery,
      currentJobTitles: variant.currentJobTitles,
      locations: variant.locations,
      yearsOfExperienceIds: variant.yearsOfExperienceIds,
      seniorityLevelIds: variant.seniorityLevelIds,
      maxItems: maxCandidates,
      takePages: [1, 2, 3, 4] // Search deeper pages
    });

    console.log(`   ✓ Created 3 tiers for variant ${variantNum}\n`);
  });

  return queries;
}
