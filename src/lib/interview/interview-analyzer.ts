/**
 * AI Interview Analyzer
 * Analyzes interview transcripts and generates scores and recommendations
 */

import { generateObject } from 'ai';
import { openai, OpenAIChatLanguageModelOptions } from '@ai-sdk/openai';
import { z } from 'zod';

// Analysis result schema
const InterviewAnalysisSchema = z.object({
  overallScore: z.number().min(0).max(100).describe('Overall interview score (0-100)'),
  technicalScore: z.number().min(0).max(100).describe('Technical skills score (0-100)'),
  communicationScore: z.number().min(0).max(100).describe('Communication skills score (0-100)'),
  cultureFitScore: z.number().min(0).max(100).describe('Culture fit score (0-100)'),
  strengths: z.array(z.string()).describe('List of candidate strengths (3-5 items)'),
  concerns: z.array(z.string()).describe('List of concerns or weaknesses (2-4 items)'),
  keyInsights: z.string().describe('Summary of key insights from the interview'),
  recommendation: z.enum(['STRONG_YES', 'YES', 'MAYBE', 'NO']).describe('Hiring recommendation'),
  recommendationReason: z.string().describe('Explanation for the recommendation'),
  detailedAnalysis: z.object({
    technicalSkills: z.string().describe('Analysis of technical skills demonstrated'),
    problemSolving: z.string().describe('Analysis of problem-solving ability'),
    communication: z.string().describe('Analysis of communication style and clarity'),
    experience: z.string().describe('Analysis of relevant experience'),
    cultureFit: z.string().describe('Analysis of culture fit indicators'),
  }),
});

export type InterviewAnalysis = z.infer<typeof InterviewAnalysisSchema>;

export interface AnalyzeInterviewParams {
  transcript: string;
  candidateName: string;
  jobTitle: string;
  jobDescription?: string;
  requiredSkills: string[];
  experienceRequired?: string;
}

/**
 * Analyze interview transcript using AI
 * @param params - Interview analysis parameters
 * @returns Structured analysis with scores and recommendations
 */
export async function analyzeInterview(
  params: AnalyzeInterviewParams
): Promise<InterviewAnalysis> {
  const { transcript, candidateName, jobTitle, jobDescription, requiredSkills, experienceRequired } = params;

  // Build analysis prompt
  const prompt = buildAnalysisPrompt(params);

  console.log('Analyzing interview transcript with AI...');

  try {
    const result = await generateObject({
      model: openai('gpt-4o'),
      schema: InterviewAnalysisSchema,
      providerOptions: {
              openai: {
                strictJsonSchema: false,
              } satisfies OpenAIChatLanguageModelOptions,
            },
      prompt,
    });

    console.log('Interview analysis completed');
    return result.object;
  } catch (error: any) {
    console.error('Error analyzing interview:', error);
    throw new Error(`Failed to analyze interview: ${error.message}`);
  }
}

/**
 * Build comprehensive analysis prompt
 */
function buildAnalysisPrompt(params: AnalyzeInterviewParams): string {
  const { transcript, candidateName, jobTitle, jobDescription, requiredSkills, experienceRequired } = params;

  return `You are an expert technical recruiter analyzing an AI-conducted job interview. Provide a comprehensive, fair, and objective analysis.

**JOB INFORMATION:**
Position: ${jobTitle}
${jobDescription ? `Description: ${jobDescription}` : ''}
Required Skills: ${requiredSkills.join(', ')}
${experienceRequired ? `Experience Required: ${experienceRequired}` : ''}

**CANDIDATE:**
Name: ${candidateName}

**INTERVIEW TRANSCRIPT:**
${transcript}

**ANALYSIS INSTRUCTIONS:**

1. **Overall Score (0-100):**
   - Holistic assessment of interview performance
   - Consider all factors: technical, communication, fit
   - 90-100: Exceptional candidate
   - 75-89: Strong candidate
   - 60-74: Good candidate with some gaps
   - 40-59: Average candidate, significant concerns
   - 0-39: Weak candidate, not recommended

2. **Technical Score (0-100):**
   - Assess knowledge of required skills: ${requiredSkills.join(', ')}
   - Evaluate depth of technical understanding
   - Consider problem-solving approaches
   - Look for specific examples and experience

3. **Communication Score (0-100):**
   - Clarity and articulation
   - Ability to explain complex concepts
   - Active listening (responding appropriately)
   - Professionalism and confidence

4. **Culture Fit Score (0-100):**
   - Alignment with role expectations
   - Enthusiasm and motivation
   - Work style indicators
   - Values and approach to teamwork

5. **Strengths (3-5 specific points):**
   - What did the candidate do well?
   - Specific examples from the transcript
   - Technical strengths, soft skills, unique qualities

6. **Concerns (2-4 specific points):**
   - What are the gaps or weaknesses?
   - Missing skills or experience
   - Communication issues
   - Red flags or areas needing validation

7. **Key Insights:**
   - 2-3 paragraph summary of the interview
   - Most important takeaways
   - Context for the scores and recommendation

8. **Recommendation:**
   - STRONG_YES: Exceptional, hire immediately
   - YES: Strong candidate, recommend hiring
   - MAYBE: Good but has gaps, needs further evaluation
   - NO: Not suitable for this role

9. **Recommendation Reason:**
   - Clear explanation for the recommendation
   - Key factors that influenced the decision

10. **Detailed Analysis:**
    - Break down each area with specific observations
    - Reference specific parts of the transcript
    - Provide actionable insights for hiring decision

**IMPORTANT:**
- Be objective and fair
- Base scores on evidence from the transcript
- Consider the seniority level and role requirements
- Look for both strengths and growth areas
- Provide specific, actionable feedback
- If the interview was short or incomplete, reflect this in the analysis`;
}

/**
 * Generate a summary for a quick view of the analysis
 */
export function generateAnalysisSummary(analysis: InterviewAnalysis): string {
  const recommendation = analysis.recommendation.replace(/_/g, ' ');

  return `${recommendation} (${analysis.overallScore}/100) - ${analysis.strengths.length} strengths, ${analysis.concerns.length} concerns. ${analysis.recommendationReason}`;
}

/**
 * Determine if analysis indicates a good hire
 */
export function isRecommendedHire(analysis: InterviewAnalysis): boolean {
  return analysis.recommendation === 'STRONG_YES' || analysis.recommendation === 'YES';
}

/**
 * Get score interpretation
 */
export function getScoreInterpretation(score: number): string {
  if (score >= 90) return 'Exceptional';
  if (score >= 75) return 'Strong';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Average';
  return 'Weak';
}
