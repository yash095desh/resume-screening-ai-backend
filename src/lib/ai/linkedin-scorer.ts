import { openai, OpenAIChatLanguageModelOptions } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { CandidateScore, candidateScoreSchema } from "../validations/sourcing";

/**
 * ✅ ENHANCED: Score candidate with skill matching and experience analysis
 * Now extracts: matchedSkills, missingSkills, bonusSkills, relevantYears, seniorityLevel, industryMatch
 */
// lib/ai/linkedin-scorer.ts

export async function scoreCandidateWithFullAnalysis(
  candidate: any,
  jobDescription: string,
  jobRequirements?: {
    requiredSkills?: string;
    niceToHave?: string;
    yearsOfExperience?: string;
    location?: string;
    industry?: string;
    educationLevel?: string;
    companyType?: string;
  }
): Promise<CandidateScore> {
  try {
    const { object } = await generateObject({
      model: openai("gpt-4o"),
      providerOptions: {
        openai: {
          strictJsonSchema: false,
        } satisfies OpenAIChatLanguageModelOptions,
      },
      temperature: 0, // Consistent scoring
      schema: candidateScoreSchema,
      system: ENHANCED_SYSTEM_PROMPT,
      prompt: `
      # JOB POSTING
        ${jobDescription}

        ${
          jobRequirements
            ? `
        REQUIREMENTS:
        - Must-Have Skills: ${jobRequirements.requiredSkills || "Not specified"}
        - Nice-to-Have Skills: ${jobRequirements.niceToHave || "Not specified"}
        - Experience Needed: ${jobRequirements.yearsOfExperience || "Not specified"}
        - Industry: ${jobRequirements.industry || "Any"}
        - Education: ${jobRequirements.educationLevel || "Not specified"}
        `
            : ""
        }
      # CANDIDATE PROFILE
        Name: ${candidate.fullName}
        Current Role: ${candidate.currentPosition || "N/A"} at ${
                candidate.currentCompany || "N/A"
              }
        Location: ${candidate.location || "N/A"}

        Total Experience: ${candidate.experienceYears || "Unknown"} years
        Skills Listed: ${candidate.skills?.join(", ") || "None"}

        Work History (last 3 roles):
        ${JSON.stringify(candidate.experience?.slice(0, 3) || []).substring(0, 1000)}

        Education:
        ${JSON.stringify(candidate.education || []).substring(0, 500)}

        TASK
        Conduct a comprehensive analysis covering all 5 sections:
        1. Interview Readiness (make a clear decision)
        2. Skill Analysis (detailed breakdown)
        3. Experience Analysis (relevance assessment)
        4. Gaps & Trade-offs (honest evaluation)
        5. Interview Focus Areas (actionable plan)
        Be thorough, specific, and helpful.
`,
    });

    return object;
  } catch (error) {
    console.error("Error scoring candidate:", error);
    throw new Error("Failed to score candidate");
  }
}

const ENHANCED_SYSTEM_PROMPT = `You are an expert technical recruiter conducting comprehensive candidate analysis.

    CORE PHILOSOPHY:
    - Be realistic but fair - focus on potential, not perfection
    - Look for transferable skills, not just exact matches
    - Average good matches score 65-75, great matches 80+, poor matches <60
    - Be specific with examples, avoid generic statements

    SCORING WEIGHTS (100 total):
    Skills (30) | Experience (25) | Industry (20) | Title (15) | Bonus (10)

    INTERVIEW READINESS THRESHOLDS:
    - READY: 80+ score OR 7+ matched skills, confidence 75-100
    - VALIDATION: 60-80 score OR 5-7 matched skills, confidence 50-75  
    - NOT_RECOMMENDED: <60 score OR <5 matched skills OR critical blockers, confidence 0-50

    OUTPUT REQUIREMENTS:
    - All sections must be complete and detailed
    - Follow length guidelines in schema (min/max characters)
    - Use professional but conversational tone
    - Provide actionable, specific insights with evidence from profile
    - Help recruiters make confident decisions

    The schema describes exact requirements for each field. Follow those specifications precisely.`;

/**
 * ✅ Process candidates in parallel with concurrency control
 * This prevents overwhelming the API while maximizing throughput
 */
export async function scoreCandidatesInParallel(
  candidates: any[],
  jobDescription: string,
  jobRequirements: any,
  concurrencyLimit: number = 5
): Promise<
  Array<{
    candidateId: string;
    candidateName: string;
    status: "success" | "failed";
    score?: any;
    error?: string;
  }>
> {
  const results: Array<{
    candidateId: string;
    candidateName: string;
    status: "success" | "failed";
    score?: any;
    error?: string;
  }> = [];

  // Process in chunks to control concurrency
  for (let i = 0; i < candidates.length; i += concurrencyLimit) {
    const chunk = candidates.slice(i, i + concurrencyLimit);

    console.log(
      `   Processing ${i + 1}-${Math.min(
        i + concurrencyLimit,
        candidates.length
      )} of ${candidates.length}...`
    );

    const chunkResults = await Promise.allSettled(
      chunk.map(async (candidate) => {
        try {
          const score = await scoreCandidateWithFullAnalysis(
            candidate,
            jobDescription,
            jobRequirements
          );
          return {
            candidateId: candidate.id,
            candidateName: candidate.fullName,
            status: "success" as const,
            score,
          };
        } catch (error: any) {
          return {
            candidateId: candidate.id,
            candidateName: candidate.fullName,
            status: "failed" as const,
            error: error.message,
          };
        }
      })
    );

    // Extract results from settled promises
    for (const result of chunkResults) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        console.error("❌ Unexpected promise rejection:", result.reason);
      }
    }
  }

  return results;
}
