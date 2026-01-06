// lib/ai/job-description-formator.ts

import { openai, OpenAIChatLanguageModelOptions } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { INDUSTRY_TO_LINKEDIN_ID, SENIORITY_LEVEL_IDS_MAPPING, YEARS_OF_EXPERIENCE_IDS_MAPPING } from "../constants/linkedin-mappings";

// Schema for a single search variant
const searchVariantSchema = z.object({
  searchQuery: z.string().describe("Boolean search query with 2-3 skills using AND"),
  currentJobTitles: z.array(z.string()).describe("3-5 related job titles for this variant"),
  variantReasoning: z.string().describe("Brief explanation of this variant's approach (1 sentence)")
});

// Schema for the complete response with 3 variants
const linkedInSearchVariantsSchema = z.object({
  locations: z.array(z.string()).optional().describe("Locations in LinkedIn format (same for all variants)"),
  variants: z.array(searchVariantSchema).length(3).describe("Exactly 3 different search query variants")
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
    console.log("🎨 Formatting job description with AI-powered variants...");

    // ✅ STEP 1: Let AI generate 3 different search variants
    const { object } = await generateObject({
      model: openai("gpt-4o"),
      schema: linkedInSearchVariantsSchema,
      providerOptions: {
        openai: {
          strictJsonSchema: false,
        } satisfies OpenAIChatLanguageModelOptions,
      },
      system: `You are creating diverse LinkedIn search strategies to find candidates for a job posting.

CRITICAL: Generate EXACTLY 3 DIFFERENT search variants. Each variant should find the same type of candidate but use different approaches.

For EACH of the 3 variants:

1. searchQuery:
   - Use DIFFERENT keywords/synonyms for each variant
   - Combine 2-3 critical skills with " AND "
   - Examples for a React job:
     * Variant 1: "React AND TypeScript AND Redux"
     * Variant 2: "Frontend Engineer AND JavaScript AND State Management"
     * Variant 3: "UI Developer AND Modern Web Frameworks"

2. currentJobTitles:
   - Each variant should have DIFFERENT but related job titles (3-5 titles)
   - Examples:
     * Variant 1: ["React Developer", "Frontend Engineer", "React Specialist"]
     * Variant 2: ["Frontend Developer", "JavaScript Engineer", "Web Developer"]
     * Variant 3: ["UI Engineer", "Web Application Developer", "SPA Developer"]

3. variantReasoning:
   - Brief explanation of this variant's approach

COMMON FIELDS (same for all variants):
- locations: Convert to LinkedIn format:
  * "San Francisco" → "San Francisco Bay Area"
  * "NYC" → "New York City Metropolitan Area"
  * "Seattle" → "Greater Seattle Area"

IMPORTANT:
- Each variant must be genuinely different (not just reordered)
- All variants should target the same seniority level and experience
- Don't over-filter - we score candidates later`,

      prompt: `Job Description:
${jobDescription}

Job Requirements:
- Required Skills: ${jobRequirements?.requiredSkills || 'Not specified'}
- Nice to Have: ${jobRequirements?.niceToHave || 'Not specified'}
- Location: ${jobRequirements?.location || 'Not specified'}
- Experience Level: ${jobRequirements?.yearsOfExperience || 'Not specified'}

Generate 3 DIFFERENT LinkedIn search variants that will find relevant candidates using different keyword strategies.`,
    });

    console.log("✅ AI generated 3 search variants:");
    object.variants.forEach((variant, idx) => {
      console.log(`\n   Variant ${idx + 1}: ${variant.variantReasoning}`);
      console.log(`   - Query: ${variant.searchQuery}`);
      console.log(`   - Titles: ${variant.currentJobTitles.slice(0, 3).join(', ')}`);
    });

    // ✅ STEP 2: Map user inputs to LinkedIn filters (common across all variants)
    const yearsOfExperienceIds = jobRequirements?.yearsOfExperience
      ? YEARS_OF_EXPERIENCE_IDS_MAPPING[jobRequirements.yearsOfExperience] || []
      : undefined;

    const seniorityLevelIds = jobRequirements?.yearsOfExperience
      ? SENIORITY_LEVEL_IDS_MAPPING[jobRequirements.yearsOfExperience] || []
      : undefined;

    const industryIds = jobRequirements?.industry
      ? INDUSTRY_TO_LINKEDIN_ID[jobRequirements.industry]
      : undefined;

    const commonFields = {
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

    // ✅ STEP 3: Build 3 complete search filter objects
    const searchFiltersVariants = object.variants.map((variant, idx) => ({
      variantId: idx + 1,
      variantReasoning: variant.variantReasoning,
      searchQuery: variant.searchQuery,
      currentJobTitles: variant.currentJobTitles,
      ...commonFields
    }));

    console.log("\n📋 Created 3 search filter variants with common fields");

    return {
      variants: searchFiltersVariants,
      // Keep single searchFilters for backward compatibility (uses first variant)
      searchFilters: searchFiltersVariants[0]
    };

  } catch (error) {
    console.error("❌ Failed to format job description:", error);

    // Fallback: Create 3 basic variants from skills
    const skills = jobRequirements?.requiredSkills?.split(/[,;\n]/).map(s => s.trim()).filter(Boolean) || [];

    const yearsOfExperienceIds = jobRequirements?.yearsOfExperience
      ? YEARS_OF_EXPERIENCE_IDS_MAPPING[jobRequirements.yearsOfExperience]
      : undefined;

    const seniorityLevelIds = jobRequirements?.yearsOfExperience
      ? SENIORITY_LEVEL_IDS_MAPPING[jobRequirements.yearsOfExperience]
      : undefined;

    const industryIds = jobRequirements?.industry
      ? INDUSTRY_TO_LINKEDIN_ID[jobRequirements.industry]
      : undefined;

    const commonFields = {
      yearsOfExperienceIds: yearsOfExperienceIds,
      seniorityLevelIds: seniorityLevelIds,
      industryIds: industryIds,
      maxItems: maxCandidates,
      takePages: Math.ceil(maxCandidates / 25),
      _meta: {
        requiredSkills: skills,
        niceToHaveSkills: [],
        rawJobDescription: jobDescription,
      }
    };

    // Create 3 simple variants using top skills
    const variant1 = {
      variantId: 1,
      variantReasoning: "Primary skills with AND logic",
      searchQuery: skills.slice(0, 3).join(" AND ") || undefined,
      currentJobTitles: [],
      ...commonFields
    };

    const variant2 = {
      variantId: 2,
      variantReasoning: "Alternative skill combination",
      searchQuery: skills.slice(1, 4).join(" AND ") || undefined,
      currentJobTitles: [],
      ...commonFields
    };

    const variant3 = {
      variantId: 3,
      variantReasoning: "Broad skill search with OR",
      searchQuery: skills.slice(0, 3).join(" OR ") || undefined,
      currentJobTitles: [],
      ...commonFields
    };

    const variants = [variant1, variant2, variant3];

    console.log("⚠️ Using fallback: 3 basic variants created");

    return {
      variants: variants,
      searchFilters: variant1 // Backward compatibility
    };
  }
}
