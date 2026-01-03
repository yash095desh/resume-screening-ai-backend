import { openai, OpenAIChatLanguageModelOptions } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';

const SummarySchema = z.object({
  summary: z.string().describe('2-3 sentence candidate summary'),
  strengths: z.array(z.string()).length(3).describe('Top 3 candidate strengths'),
  weaknesses: z.array(z.string()).length(3).describe('Top 3 gaps or weaknesses'),
  fitVerdict: z.enum(['Good Fit', 'Moderate Fit', 'Low Fit']).describe('Overall fit assessment'),
});

export async function generateCandidateSummary(
  candidateInfo: any,
  jdRequirements: any,
  matchScore: number
) {
  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: SummarySchema,
      providerOptions: {
              openai: {
                strictJsonSchema: false,
              } satisfies OpenAIChatLanguageModelOptions,
            },
      prompt: `
        You are a recruitment expert. Analyze this candidate against the job requirements.

        Candidate Profile:
        - Name: ${candidateInfo.name}
        - Skills: ${candidateInfo.skills.join(', ')}
        - Experience: ${candidateInfo.totalExperienceYears} years
        - Match Score: ${matchScore}/100

        Job Requirements:
        - Required Skills: ${jdRequirements.requiredSkills.join(', ')}
        - Experience Required: ${jdRequirements.experienceRequired}
        - Qualifications: ${jdRequirements.qualifications.join(', ')}

        Provide:
        1. A brief 2-3 sentence summary of the candidate
        2. Top 3 strengths relative to the role
        3. Top 3 weaknesses or gaps
        4. Overall fit verdict (Good Fit if score >= 70, Moderate Fit if 40-69, Low Fit if < 40)
            `.trim(),
            });

    return object;
  } catch (error) {
    console.error('Error generating summary:', error);
    throw new Error('Failed to generate candidate summary');
  }
}