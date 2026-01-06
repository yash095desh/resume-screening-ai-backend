// lib/sourcing/nodes/format-jd.ts
import { formatJobDescriptionForLinkedIn } from "../../ai/job-description-formator";
import { prisma } from "../../prisma";
import type { SourcingState } from "../state";

export async function formatJobDescription(state: SourcingState) {
  console.log("🎨 Formatting job description with AI variants...");

  // ✅ STEP 1: Check state first (no DB query)
  if (state.searchFiltersVariants && state.searchFiltersVariants.length > 0) {
    console.log("♻️ Using searchFiltersVariants from state (no DB query)");
    return {
      searchFiltersVariants: state.searchFiltersVariants,
      searchFilters: state.searchFiltersVariants[0], // Backward compatibility
      currentStage: "JD_FORMATTED"
    };
  }

  // ✅ STEP 2: Check database (resume scenario)
  console.log("📂 searchFiltersVariants not in state, checking database...");
  const existingJob = await prisma.sourcingJob.findUnique({
    where: { id: state.jobId },
    select: {
      searchFilters: true,
      lastCompletedStage: true
    }
  });

  if (existingJob?.searchFilters && existingJob.lastCompletedStage === "format_jd") {
    console.log("♻️ Found searchFilters in database");

    // Check if it's an array (new format with variants) or single object (old format)
    const searchFiltersData = existingJob.searchFilters as any;

    if (Array.isArray(searchFiltersData)) {
      console.log(`✅ Found ${searchFiltersData.length} variants in database`);
      return {
        searchFiltersVariants: searchFiltersData,
        searchFilters: searchFiltersData[0], // Backward compatibility
        currentStage: "JD_FORMATTED"
      };
    } else {
      // Old format: single object, convert to array of 1 variant
      console.log("⚠️ Old format detected, converting to variant format");
      return {
        searchFiltersVariants: [searchFiltersData],
        searchFilters: searchFiltersData,
        currentStage: "JD_FORMATTED"
      };
    }
  }

  // ✅ STEP 3: Format with AI for first time
  console.log("🎨 Using AI to generate 3 search variants...");

  try {
    const result = await formatJobDescriptionForLinkedIn(
      state.rawJobDescription,
      state.jobRequirements,
      state.maxCandidates
    );

    console.log(`\n✅ AI generated ${result.variants.length} search variants`);

    // Save variants array to database
    await prisma.sourcingJob.update({
      where: { id: state.jobId },
      data: {
        searchFilters: result.variants as any, // Store array of variants
        status: "JD_FORMATTED",
        currentStage: "JD_FORMATTED",
        lastCompletedStage: "format_jd",
        lastActivityAt: new Date()
      }
    });

    return {
      searchFiltersVariants: result.variants,
      searchFilters: result.variants[0], // Backward compatibility
      currentStage: "JD_FORMATTED"
    };
  } catch (error: any) {
    console.error("❌ Format JD failed:", error.message);

    await prisma.sourcingJob.update({
      where: { id: state.jobId },
      data: {
        status: "FAILED",
        errorMessage: error.message,
        failedAt: new Date()
      }
    });

    return {
      errors: [{
        stage: "format_jd",
        message: error.message,
        timestamp: new Date(),
        retryable: true
      }],
      currentStage: "FORMAT_FAILED"
    };
  }
}
