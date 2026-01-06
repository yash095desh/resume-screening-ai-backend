// lib/sourcing/workflow.ts
import { StateGraph, START, END } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { SourcingStateAnnotation } from "./state";
import type { SourcingState } from "./state";

import { formatJobDescription } from "./nodes/format-jd";
import { generateSearchQueries } from "./nodes/generate-queries";
import { searchProfiles } from "./nodes/search-profiles";
import { enrichAndCreateCandidates } from "./nodes/enrich-and-create";
import { scrapeCandidates } from "./nodes/scrape-candidates";
import { parseCandidates } from "./nodes/parse-candidates";
import { handleNoCandidates } from "./nodes/handle-no-candidates";
import { updateCandidates } from "./nodes/updates-candidate";
import { scoreAllCandidates } from "./nodes/score-batch";
import { prisma } from "../prisma";

let checkpointer: PostgresSaver | null = null;

async function getCheckpointer() {
  if (!checkpointer) {
    checkpointer = PostgresSaver.fromConnString(process.env.DATABASE_URL!);
    await checkpointer.setup();
  }
  return checkpointer;
}

export async function createSourcingWorkflow() {
  const graph = new StateGraph(SourcingStateAnnotation)
    .addNode("format_jd", formatJobDescription)
    .addNode("generate_queries", generateSearchQueries)
    .addNode("search_profiles", searchProfiles)
    .addNode("enrich_and_create", enrichAndCreateCandidates)
    .addNode("scrape_candidates", scrapeCandidates)
    .addNode("parse_candidates", parseCandidates)
    .addNode("update_candidates", updateCandidates)
    .addNode("score_all", scoreAllCandidates)
    .addNode("handle_no_candidates", handleNoCandidates);

  // Initial flow
  graph.addEdge(START, "format_jd");
  graph.addEdge("format_jd", "generate_queries");
  graph.addEdge("generate_queries", "search_profiles");
  graph.addEdge("search_profiles", "enrich_and_create");

  // Conditional loop: search + enrich until target reached
  graph.addConditionalEdges(
    "enrich_and_create",
    (state: SourcingState) => {
      // ✅ NEW: Check for rate limit
      if (state.currentStage === "RATE_LIMITED") {
        console.log("⏸️ Rate limited - workflow paused");
        return "end"; // End workflow gracefully
      }

      const current = state.candidatesWithEmails || 0;
      const target = state.maxCandidates;

      if (current >= target) {
        console.log(
          `✅ Target reached: ${current}/${target} - Moving to scraping`
        );
        return "scrape";
      }

      if (state.searchIterations >= 5) {
        if (current > 0) {
          console.log(
            `⚠️ Max iterations (5) reached with ${current}/${target} candidates - proceeding to scrape`
          );
          return "scrape";
        }
        console.log(`❌ Max iterations reached with no candidates`);
        return "no_candidates";
      }

      console.log(
        `🔄 Need more candidates (${current}/${target}) - Iteration ${
          state.searchIterations + 1
        }/5`
      );
      return "search_again";
    },
    {
      scrape: "scrape_candidates",
      search_again: "search_profiles",
      no_candidates: "handle_no_candidates",
      end: END, // ✅ NEW: Add end path for rate limit
    }
  );

  // Continue with scraping pipeline
  graph.addEdge("scrape_candidates", "parse_candidates");
  graph.addEdge("parse_candidates", "update_candidates");
  graph.addEdge("update_candidates", "score_all");
  graph.addEdge("score_all", END);
  graph.addEdge("handle_no_candidates", END);

  const cp = await getCheckpointer();
  return graph.compile({ checkpointer: cp });
}

/**
 * Build resume state from database checkpoints
 * Called by retry route to restore workflow state after failure
 */
export async function buildResumeState(jobId: string) {
  const job = await prisma.sourcingJob.findUnique({
    where: { id: jobId },
    include: {
      candidates: {
        select: {
          profileUrl: true,
          hasContactInfo: true,
          scrapingStatus: true,
          isScored: true,
        },
      },
    },
  });

  if (!job) throw new Error("Job not found");

  const candidatesWithEmails = job.candidates.filter(
    (c:any) => c.hasContactInfo
  ).length;

  const discoveredUrlsArray = (job.discoveredUrls as string[]) || [];
  const enrichedUrlsArray = (job.enrichedUrls as string[]) || [];
  const usedQueryIndicesArray = (job.usedQueryIndices as number[]) || [];

  // ✅ Handle searchFiltersVariants (can be array or single object)
  const searchFiltersData = job.searchFilters as any;
  let searchFiltersVariants = [];

  if (Array.isArray(searchFiltersData)) {
    searchFiltersVariants = searchFiltersData;
  } else if (searchFiltersData) {
    // Old format: convert single object to array
    searchFiltersVariants = [searchFiltersData];
  }

  const pendingUrls = discoveredUrlsArray.filter(
    (url) => !enrichedUrlsArray.includes(url)
  );

  console.log(`📦 Building resume state for job ${jobId}:`);
  console.log(`   - Last completed stage: ${job.lastCompletedStage || "NONE"}`);
  console.log(
    `   - Candidates with emails: ${candidatesWithEmails}/${job.maxCandidates}`
  );
  console.log(`   - Search filter variants: ${searchFiltersVariants.length}`);
  console.log(`   - Discovered URLs: ${discoveredUrlsArray.length}`);
  console.log(`   - Enriched URLs: ${enrichedUrlsArray.length}`);
  console.log(`   - Pending URLs: ${pendingUrls.length}`);
  console.log(`   - Used queries: ${usedQueryIndicesArray.length}`);

  const estimatedIterations = Math.max(
    Math.floor(candidatesWithEmails / 10),
    discoveredUrlsArray.length > 0 ? 1 : 0
  );

  return {
    jobId: job.id,
    userId: job.userId,
    rawJobDescription: job.rawJobDescription,
    jobRequirements: job.jobRequirements,
    maxCandidates: job.maxCandidates,

    searchFilters: searchFiltersVariants.length > 0 ? searchFiltersVariants[0] : job.searchFilters,
    searchFiltersVariants: searchFiltersVariants, // ✅ Load AI-generated variants
    discoveredUrls: new Set(discoveredUrlsArray),
    enrichedUrls: new Set(enrichedUrlsArray), // ✅ Load into state
    usedQueryIndices: new Set(usedQueryIndicesArray), // ✅ Load query usage tracking
    scrapedProfiles: job.scrapedProfilesData || [],
    parsedProfiles: job.parsedProfilesData || [],

    candidatesWithEmails,
    searchIterations: estimatedIterations,

    currentSearchResults: pendingUrls.map((url) => ({
      profileUrl: url,
      fullName: "Unknown",
      headline: null,
      location: null,
    })),

    searchQueries: [],
    scoredCandidates: [],

    batchSize: 20,
    errors: [],
    currentStage: job.currentStage || "CREATED",
  };
}
