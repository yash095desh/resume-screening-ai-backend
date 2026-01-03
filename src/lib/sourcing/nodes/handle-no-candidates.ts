// lib/sourcing/nodes/handle-no-candidates.ts
import { prisma } from "../../prisma";
import { SourcingState } from "../state";

export async function handleNoCandidates(state: SourcingState) {
  console.log("❌ No candidates found after all search strategies");
  
  try {
    // Generate recommendations based on search attempts
    const recommendations = [
      "Try broader location requirements",
      "Consider reducing years of experience needed",
      "Expand list of acceptable job titles",
      "Review required skills - may be too specific",
      "Consider alternative industries with transferable skills"
    ];
    
    // Create detailed report
    const report = `
# No Candidates Found

After trying ${state.searchIterations} different search strategies, no suitable candidates were found.

## Search Strategies Attempted:
${state.searchQueries.map((q, i) => `${i + 1}. ${q.type}: ${q.searchQuery || 'Title-based search'}`).join('\n')}

## Recommendations:
${recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}

## Next Steps:
- Review job requirements to ensure they're not overly restrictive
- Consider manual LinkedIn search with the queries above
- Adjust required skills or location preferences
- Try again with modified criteria
    `.trim();
    
    // ✅ Update database with completion status and report
    await prisma.sourcingJob.update({
      where: { id: state.jobId },
      data: {
        status: "COMPLETED",
        currentStage: "NO_CANDIDATES_FOUND",
        lastCompletedStage: "handle_no_candidates", // ✅ ADD THIS LINE
        completedAt: new Date(),
        lastActivityAt: new Date(),
        errorMessage: report, // Store report in errorMessage for user to see
        totalProfilesFound: 0,
        profilesScraped: 0,
        profilesParsed: 0,
        profilesSaved: 0,
        profilesScored: 0
      }
    });
    
    console.log("✅ Job marked as complete with no candidates found");
    
    // Return state update for LangGraph
    return {
      currentStage: "NO_CANDIDATES_FOUND",
      errors: [
        {
          stage: "no_candidates",
          message: "No candidates found after exhausting all search strategies",
          timestamp: new Date(),
          retryable: true,
          recommendations: recommendations
        }
      ]
    };
    
  } catch (error: any) {
    console.error("❌ Error handling no candidates scenario:", error);
    
    // Fallback: at least mark the job as failed
    try {
      await prisma.sourcingJob.update({
        where: { id: state.jobId },
        data: {
          status: "FAILED",
          currentStage: "ERROR_HANDLING_NO_CANDIDATES",
          errorMessage: `Failed to handle no candidates scenario: ${error.message}`,
          failedAt: new Date(),
          lastActivityAt: new Date()
        }
      });
    } catch (dbError) {
      console.error("❌ Critical: Could not update database:", dbError);
    }
    
    return {
      currentStage: "ERROR_HANDLING_NO_CANDIDATES",
      errors: [
        {
          stage: "handle_no_candidates",
          message: error.message,
          timestamp: new Date(),
          retryable: false
        }
      ]
    };
  }
}