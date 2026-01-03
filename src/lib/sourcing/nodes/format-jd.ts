// lib/sourcing/nodes/format-jd.ts
import { formatJobDescriptionForLinkedIn } from "../../ai/job-description-formator";
import { prisma } from "../../prisma";
import type { SourcingState } from "../state";

export async function formatJobDescription(state: SourcingState) {
  console.log("🎨 Formatting job description...");
  
  // ✅ STEP 1: Check state first (no DB query)
  if (state.searchFilters) {
    console.log("♻️ Using searchFilters from state (no DB query)");
    return {
      searchFilters: state.searchFilters,
      currentStage: "JD_FORMATTED"
    };
  }
  
  // ✅ STEP 2: Check database (resume scenario)
  console.log("📂 searchFilters not in state, checking database...");
  const existingJob = await prisma.sourcingJob.findUnique({
    where: { id: state.jobId },
    select: { 
      searchFilters: true,
      lastCompletedStage: true 
    }
  });
  
  if (existingJob?.searchFilters && existingJob.lastCompletedStage === "format_jd") {
    console.log("♻️ Found searchFilters in database, skipping format");
    return {
      searchFilters: existingJob.searchFilters,
      currentStage: "JD_FORMATTED"
    };
  }
  
  // ✅ STEP 3: Format for first time
  console.log("🎨 Formatting job description for first time...");
  
  try {
    const searchFilters = await formatJobDescriptionForLinkedIn(
      state.rawJobDescription,
      state.jobRequirements,
      state.maxCandidates
    );
    
    await prisma.sourcingJob.update({
      where: { id: state.jobId },
      data: {
        searchFilters: searchFilters as any,
        status: "JD_FORMATTED",
        currentStage: "JD_FORMATTED",
        lastCompletedStage: "format_jd",
        lastActivityAt: new Date()
      }
    });
    
    return {
      searchFilters: searchFilters,
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