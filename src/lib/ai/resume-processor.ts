import { openai, OpenAIChatLanguageModelOptions } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import { calculateMatchScore } from './matcher';

// -------------------------
// SCHEMAS
// -------------------------

const ResumeExtractionSchema = z.object({
  name: z.string().describe('Candidate full name'),
  email: z.string().nullable().describe('Email address'),
  phone: z.string().nullable().describe('Phone number'),
  skills: z.array(z.string()).describe('Technical and soft skills'),
  experience: z
    .array(
      z.object({
        company: z.string(),
        role: z.string(),
        duration: z.string(),
        description: z.string().nullable(),
      })
    )
    .describe('Work experience history'),
  education: z
    .array(
      z.object({
        degree: z.string(),
        institution: z.string(),
        year: z.string().nullable(),
      })
    )
    .describe('Educational background'),
  totalExperienceYears: z
    .number()
    .describe('Total years of professional experience'),
});

const SummarySchema = z.object({
  summary: z.string().describe('2-3 sentence candidate summary'),
  strengths: z
    .array(z.string())
    .length(3)
    .describe('Top 3 candidate strengths'),
  weaknesses: z
    .array(z.string())
    .length(3)
    .describe('Top 3 gaps or weaknesses'),
  fitVerdict: z
    .enum(['Good Fit', 'Moderate Fit', 'Low Fit'])
    .describe('Overall fit assessment'),
});

// Combined schema for single-pass processing
const CombinedResumeProcessingSchema = z.object({
  extraction: ResumeExtractionSchema,
  analysis: SummarySchema,
});

// -------------------------
// TYPES
// -------------------------

export interface ProcessedResumeResult {
  name: string;
  email: string | null;
  phone: string | null;
  skills: string[];
  experience: Array<{
    company: string;
    role: string;
    duration: string;
    description?: string | null;
  }>;
  education: Array<{
    degree: string;
    institution: string;
    year?: string | null;
  }>;
  totalExperienceYears: number;
  matchScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  summary: string;
  strengths: string[];
  weaknesses: string[];
  fitVerdict: 'Good Fit' | 'Moderate Fit' | 'Low Fit';
}

export interface JobRequirements {
  requiredSkills: string[];
  experienceRequired: string;
  qualifications: string[];
}

// -------------------------
// OPTIMIZED PROCESSOR
// -------------------------

/**
 * Process a single resume with combined AI extraction and analysis
 * Reduces API calls from 2 to 1 per resume
 *
 * @param resumeText - Resume text content
 * @param jobRequirements - Job requirements for matching
 * @returns Complete processing result
 */
export async function processResumeCombined(
  resumeText: string,
  jobRequirements: JobRequirements
): Promise<ProcessedResumeResult> {
  try {
    // Single AI call for both extraction and analysis
    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: CombinedResumeProcessingSchema,
      temperature: 0,
      providerOptions: {
        openai: {
          strictJsonSchema: false,
        } satisfies OpenAIChatLanguageModelOptions,
      },
      prompt: `
You are a recruitment expert. Extract structured information from this resume AND analyze the candidate's fit for the role.

Resume Text:
${resumeText}

Job Requirements:
- Required Skills: ${jobRequirements.requiredSkills.join(', ')}
- Experience Required: ${jobRequirements.experienceRequired}
- Qualifications: ${jobRequirements.qualifications.join(', ')}

TASK 1 - Extract candidate information:
- Full name, email, and phone
- All technical and soft skills mentioned
- Work experience with company names, roles, and durations
- Educational background
- Calculate total years of professional experience

TASK 2 - Analyze candidate fit:
- Write a 2-3 sentence summary of the candidate
- List top 3 strengths relative to the job requirements
- List top 3 weaknesses or gaps
- Provide overall fit verdict based on match between candidate profile and job requirements (Good Fit if highly qualified, Moderate Fit if partially qualified, Low Fit if poorly qualified)
      `.trim(),
    });

    const { extraction, analysis } = object;

    // Calculate match score using existing algorithm
    const matchResult = calculateMatchScore(
      extraction.skills || [],
      jobRequirements.requiredSkills || [],
      extraction.totalExperienceYears || 0,
      jobRequirements.experienceRequired || '0'
    );

    return {
      name: extraction.name,
      email: extraction.email,
      phone: extraction.phone,
      skills: extraction.skills || [],
      experience: extraction.experience || [],
      education: extraction.education || [],
      totalExperienceYears: extraction.totalExperienceYears || 0,
      matchScore: matchResult.score,
      matchedSkills: matchResult.matchedSkills,
      missingSkills: matchResult.missingSkills,
      summary: analysis.summary,
      strengths: analysis.strengths || [],
      weaknesses: analysis.weaknesses || [],
      fitVerdict: analysis.fitVerdict,
    };
  } catch (error: any) {
    console.error('Error processing resume:', error);
    throw new Error(`Failed to process resume: ${error?.message}`);
  }
}

/**
 * Process multiple resumes in parallel
 * Optimized for batch processing
 *
 * @param resumes - Array of resume texts with job requirements
 * @returns Array of processing results
 */
export async function processResumesBatch(
  resumes: Array<{
    resumeText: string;
    jobRequirements: JobRequirements;
  }>
): Promise<ProcessedResumeResult[]> {
  console.log(`Batch processing ${resumes.length} resumes with combined AI...`);

  // Process all resumes in parallel
  const results = await Promise.all(
    resumes.map(({ resumeText, jobRequirements }) =>
      processResumeCombined(resumeText, jobRequirements)
    )
  );

  return results;
}
