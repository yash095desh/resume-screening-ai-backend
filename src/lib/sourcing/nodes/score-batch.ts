// lib/sourcing/nodes/score-all.ts
import { scoreCandidatesInParallel } from "../../ai/linkedin-scorer";
import { prisma } from "../../prisma";
import { SourcingState } from "../state";


export async function scoreAllCandidates(state: SourcingState) {
  console.log(`⭐ Starting scoring phase...`);

  // ✅ RESUME SUPPORT: Get only unscored candidates
  const totalCandidates = await prisma.linkedInCandidate.count({
    where: { sourcingJobId: state.jobId }
  });

  const scoredCount = await prisma.linkedInCandidate.count({
    where: { 
      sourcingJobId: state.jobId,
      isScored: true 
    }
  });

  if (scoredCount >= totalCandidates) {
    console.log(`✅ All ${totalCandidates} candidates already scored`);
    
    await prisma.sourcingJob.update({
      where: { id: state.jobId },
      data: {
        status: "COMPLETED",
        currentStage: "SCORING_COMPLETE",
        completedAt: new Date(),
        lastActivityAt: new Date()
      }
    });

    return {
      currentStage: "COMPLETED"
    };
  }

  console.log(`♻️ ${scoredCount}/${totalCandidates} already scored, processing remaining...`);

  // Get job requirements
  const job = await prisma.sourcingJob.findUnique({
    where: { id: state.jobId }
  });

  if (!job) {
    throw new Error("Job not found");
  }

  const batchSize = 20;
  let processedInThisRun = 0;

  while (true) {
    const candidates = await prisma.linkedInCandidate.findMany({
      where: {
        sourcingJobId: state.jobId,
        isScored: false
      },
      take: batchSize
    });

    if (candidates.length === 0) break;

    console.log(`⭐ Scoring batch of ${candidates.length} with full analysis...`);
    
    try {
      const results = await scoreCandidatesInParallel(
        candidates,
        job.rawJobDescription,
        job.jobRequirements as any,
        5 // Concurrency
      );

      let batchScoredCount = 0;

      for (const result of results) {
        if (result.status === 'success' && result.score) {
          try {
            await prisma.linkedInCandidate.update({
              where: { id: result.candidateId },
              data: {
                // ===== EXISTING FIELDS =====
                matchScore: result.score.totalScore,
                skillsScore: result.score.skillsScore,
                experienceScore: result.score.experienceScore,
                industryScore: result.score.industryScore,
                titleScore: result.score.titleScore,
                niceToHaveScore: result.score.niceToHaveScore,
                matchReason: result.score.reasoning,
                matchedSkills: result.score.matchedSkills || [],
                missingSkills: result.score.missingSkills || [],
                bonusSkills: result.score.bonusSkills || [],
                relevantYears: result.score.relevantYears,
                seniorityLevel: result.score.seniorityLevel,
                industryMatch: result.score.industryMatch,
                
                // ===== 🆕 NEW: INTERVIEW READINESS =====
                interviewReadiness: result.score.interviewReadiness,
                interviewReadinessReason: result.score.interviewReadinessReason,
                interviewConfidenceScore: result.score.interviewConfidenceScore,
                candidateSummary: result.score.candidateSummary,
                keyStrengths: result.score.keyStrengths,
                
                // ===== 🆕 NEW: ENHANCED SKILLS =====
                skillsProficiency: result.score.skillsProficiency,
                criticalGaps: result.score.criticalGaps,
                skillGapImpact: result.score.skillGapImpact,
                skillsAnalysisSummary: result.score.skillsAnalysisSummary,
                
                // ===== 🆕 NEW: ENHANCED EXPERIENCE =====
                experienceRelevanceScore: result.score.experienceRelevanceScore,
                seniorityAlignment: result.score.seniorityAlignment,
                industryAlignment: result.score.industryAlignment,
                experienceHighlights: result.score.experienceHighlights,
                experienceAnalysisSummary: result.score.experienceAnalysisSummary,
                
                // ===== 🆕 NEW: GAPS & TRADE-OFFS =====
                hasSignificantGaps: result.score.hasSignificantGaps,
                gapsAndTradeoffs: result.score.gapsAndTradeoffs,
                gapsOverallImpact: result.score.gapsOverallImpact,
                gapsSummary: result.score.gapsSummary,
                
                // ===== 🆕 NEW: INTERVIEW FOCUS =====
                interviewFocusAreas: result.score.interviewFocusAreas,
                suggestedQuestions: result.score.suggestedQuestions,
                redFlags: result.score.redFlags,
                interviewFocusSummary: result.score.interviewFocusSummary,
                
                // ===== METADATA =====
                isScored: true,
                scoredAt: new Date(),
                scoringVersion: "v3.0",
                fullAnalysisGenerated: true,
                analysisGeneratedAt: new Date()
              }
            });
            
            batchScoredCount++;
            
            // Enhanced logging
            console.log(
              `   ✓ ${result.candidateName}: ` +
              `${result.score.totalScore}/100 | ` +
              `${result.score.interviewReadiness} | ` +
              `Confidence: ${result.score.interviewConfidenceScore}%`
            );
            
          } catch (error: any) {
            console.error(`❌ Failed to save: ${result.candidateName}`, error.message);
          }
        } else if (result.status === 'failed') {
          console.error(`❌ Scoring failed for ${result.candidateName}:`, result.error);
        }
      }

      processedInThisRun += batchScoredCount;
      const totalScored = scoredCount + processedInThisRun;

      console.log(`✓ Scored ${batchScoredCount} candidates (${totalScored}/${totalCandidates} total)`);

      // ✅ Update progress
      await prisma.sourcingJob.update({
        where: { id: state.jobId },
        data: {
          profilesScored: totalScored,
          status: "SCORING_PROFILES",
          currentStage: `SCORED_${totalScored}_OF_${totalCandidates}`,
          lastActivityAt: new Date()
        }
      });

    } catch (error: any) {
      console.error(`❌ Scoring batch failed:`, error.message);

      await prisma.sourcingJob.update({
        where: { id: state.jobId },
        data: {
          errorMessage: `Scoring failed: ${error.message}`,
          lastActivityAt: new Date()
        }
      });

      // Continue to next batch instead of failing
      continue;
    }
  }

  console.log(`✅ Scoring complete: ${scoredCount + processedInThisRun}/${totalCandidates} candidates scored`);

  // Mark job as complete
  await prisma.sourcingJob.update({
    where: { id: state.jobId },
    data: {
      status: "COMPLETED",
      currentStage: "SCORING_COMPLETE",
      lastCompletedStage: "score_all", // ✅ ADD THIS LINE
      completedAt: new Date(),
      lastActivityAt: new Date()
    }
  });

  return {
    scoredCandidates: state.scoredCandidates || [],
    currentStage: "COMPLETED"
  };
}