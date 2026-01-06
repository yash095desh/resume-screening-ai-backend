import { openai, OpenAIChatLanguageModelOptions } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';

const JDSchema = z.object({
  requiredSkills: z.array(z.string()).describe('Array of required technical and soft skills'),
  experienceRequired: z.string().describe('Required years of experience (e.g., "3-5 years")'),
  qualifications: z.array(z.string()).describe('Educational qualifications and certifications'),
  keyResponsibilities: z.array(z.string()).describe('Main job responsibilities'),
});

export async function extractJDRequirements(jdText: string) {
  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: JDSchema,
      providerOptions: {
                    openai: {
                      strictJsonSchema: false,
                    } satisfies OpenAIChatLanguageModelOptions,
                  },
      messages: [
        {
          role: "user",
          content: `
          Extract structured information from this job description:

          ${jdText}
          `.trim(),
        },
      ],
    });

    return object;
  } catch (error) {
    console.error('Error extracting JD requirements:', error);
    throw new Error('Failed to extract job requirements');
  }
}

// Add to src/lib/ai/parser.ts

const ResumeSchema = z.object({
  name: z.string().describe('Candidate full name'),
  email: z.string().nullable().describe('Email address'),
  phone: z.string().nullable().describe('Phone number'),
  skills: z.array(z.string()).describe('Technical and soft skills'),
  experience: z.array(
    z.object({
      company: z.string(),
      role: z.string(),
      duration: z.string(),
      description: z.string().nullable(),
    })
  ).describe('Work experience history'),
  education: z.array(
    z.object({
      degree: z.string(),
      institution: z.string(),
      year: z.string().nullable(),
    })
  ).describe('Educational background'),
  totalExperienceYears: z.number().describe('Total years of professional experience'),
});

export async function extractResumeInfo(resumeText: string) {
  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: ResumeSchema,
      providerOptions: {
                    openai: {
                      strictJsonSchema: false,
                    } satisfies OpenAIChatLanguageModelOptions,
                  },
      prompt: `
        Extract structured information from this resume:

        Resume Text:
        ${resumeText}

        Please extract:
        - Candidate's name, email, and phone
        - All technical and soft skills mentioned
        - Work experience with company names, roles, and durations
        - Educational background
        - Calculate total years of experience
              `.trim(),
            });

    return object;
  } catch (error) {
    console.error('Error extracting resume info:', error);
    throw new Error('Failed to extract resume information');
  }
}