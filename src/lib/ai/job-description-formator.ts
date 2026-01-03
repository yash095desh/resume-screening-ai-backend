// lib/ai/job-description-formator.ts

import { openai, OpenAIChatLanguageModelOptions } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { INDUSTRY_TO_LINKEDIN_ID, SENIORITY_LEVEL_IDS_MAPPING, YEARS_OF_EXPERIENCE_IDS_MAPPING } from "../constants/linkedin-mappings";



const linkedInSearchSchema = z.object({
  searchQuery: z.string().optional().describe("Boolean search query combining top 2-3 skills with AND (e.g., 'React AND Node.js')"),
  currentJobTitles: z.array(z.string()).describe("Array of 3-5 exact job titles from the job description"),
  locations: z.array(z.string()).optional().describe("Array of location strings (e.g., 'San Francisco Bay Area', 'New York City Metropolitan Area')"),
});

export async function formatJobDescriptionForLinkedIn(
  jobDescription: string,
  jobRequirements?: {
    requiredSkills?: string;
    niceToHave?: string;
    yearsOfExperience?: string;
    location?: string;
    industry?: string;
    educationLevel?: string;
    companyType?: string;
  },
  maxCandidates: number = 20
) {
  try {
    console.log("🎨 Formatting job description for LinkedIn search...");

    // ✅ STEP 1: Let AI extract search query, titles, and locations
    const { object } = await generateObject({
      model: openai("gpt-4o"),
      schema: linkedInSearchSchema,
      providerOptions: {
                    openai: {
                      strictJsonSchema: false,
                    } satisfies OpenAIChatLanguageModelOptions,
                  },
      system: `You are formatting job requirements for LinkedIn search via Apify harvestapi/linkedin-profile-search actor.

CRITICAL INSTRUCTIONS:

1. searchQuery: 
   - Extract ONLY the top 2-3 most critical technical skills from requiredSkills
   - Join with " AND " (e.g., "React AND Node.js AND TypeScript")
   - Keep it concise - more filters = fewer results
   - If no technical skills, use the job category (e.g., "Software Engineer")

2. currentJobTitles:
   - Extract 3-5 EXACT job titles that would appear on LinkedIn
   - Examples: "Senior Software Engineer", "Full Stack Developer", "Engineering Manager"
   - Avoid generic titles like "Engineer" or "Developer" alone
   - Include variations (e.g., both "Senior Engineer" and "Staff Engineer")

3. locations:
   - Convert to LinkedIn's standard format:
     * "San Francisco" → "San Francisco Bay Area"
     * "NYC" or "New York" → "New York City Metropolitan Area"  
     * "Los Angeles" → "Greater Los Angeles Area"
     * "Seattle" → "Greater Seattle Area"
     * "Boston" → "Greater Boston"
   - If multiple cities mentioned, include all

IMPORTANT: Don't over-filter! We score candidates later. Cast a wide net in search.`,
      
      prompt: `Job Description:
${jobDescription}

Job Requirements:
- Required Skills: ${jobRequirements?.requiredSkills || 'Not specified'}
- Nice to Have: ${jobRequirements?.niceToHave || 'Not specified'}
- Location: ${jobRequirements?.location || 'Not specified'}

Generate LinkedIn search filters that will find relevant candidates.`,
    });

    console.log("✅ AI generated filters:", JSON.stringify(object, null, 2));

    // ✅ STEP 2: Map user inputs to LinkedIn filters
    const yearsOfExperienceIds = jobRequirements?.yearsOfExperience
      ? YEARS_OF_EXPERIENCE_IDS_MAPPING[jobRequirements.yearsOfExperience] || []
      : undefined;

    const seniorityLevelIds = jobRequirements?.yearsOfExperience
      ? SENIORITY_LEVEL_IDS_MAPPING[jobRequirements.yearsOfExperience] || []
      : undefined;

    const industryIds = jobRequirements?.industry
      ? INDUSTRY_TO_LINKEDIN_ID[jobRequirements.industry]
      : undefined;

    // ✅ STEP 3: Build final search input
    const searchInput = {
      searchQuery: object.searchQuery,
      currentJobTitles: object.currentJobTitles,
      locations: object.locations,
      yearsOfExperienceIds: yearsOfExperienceIds,  
      seniorityLevelIds: seniorityLevelIds,          
      industryIds: industryIds,
      maxItems: maxCandidates,
      takePages: Math.ceil(maxCandidates / 25),
      
      _meta: {
        requiredSkills: jobRequirements?.requiredSkills?.split(/[,;\n]/).map(s => s.trim()).filter(Boolean) || [],
        niceToHaveSkills: jobRequirements?.niceToHave?.split(/[,;\n]/).map(s => s.trim()).filter(Boolean) || [],
        yearsOfExperience: jobRequirements?.yearsOfExperience,
        educationLevel: jobRequirements?.educationLevel,
        companyType: jobRequirements?.companyType,
        rawJobDescription: jobDescription,
      }
    };

    console.log("📋 Final search input:", JSON.stringify(searchInput, null, 2));
    
    return searchInput;
    
  } catch (error) {
    console.error("❌ Failed to format job description:", error);
    
    // Fallback: Create basic search from skills
    const skills = jobRequirements?.requiredSkills?.split(/[,;\n]/).map(s => s.trim()).filter(Boolean) || [];
    const searchQuery = skills.slice(0, 3).join(" AND ");
    
    const yearsOfExperienceIds = jobRequirements?.yearsOfExperience
      ? YEARS_OF_EXPERIENCE_IDS_MAPPING[jobRequirements.yearsOfExperience]
      : undefined;

    const seniorityLevelIds = jobRequirements?.yearsOfExperience
      ? SENIORITY_LEVEL_IDS_MAPPING[jobRequirements.yearsOfExperience]
      : undefined;

    const industryIds = jobRequirements?.industry
      ? INDUSTRY_TO_LINKEDIN_ID[jobRequirements.industry]
      : undefined;
    
    console.log("⚠️ Using fallback search query:", searchQuery);
    
    return {
      searchQuery: searchQuery || undefined,
      yearsOfExperienceIds: yearsOfExperienceIds,  // ✅ NEW
      seniorityLevelIds: seniorityLevelIds,         // ✅ NEW
      industryIds: industryIds,
      maxItems: maxCandidates,
      takePages: Math.ceil(maxCandidates / 25),
      _meta: {
        requiredSkills: skills,
        niceToHaveSkills: [],
        rawJobDescription: jobDescription,
      }
    };
  }
}