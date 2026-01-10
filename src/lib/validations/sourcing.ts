import { z } from "zod";

export const createSourcingJobSchema = z.object({
  title: z.string().min(3).max(200),
  jobDescription: z.string().min(50).max(5000),
  maxCandidates: z.number().int().min(10).max(100).default(50),
  
  // All job requirements stored as a single object
  jobRequirements: z.object({
    requiredSkills: z.string().min(3).max(1000),
    niceToHave: z.string().max(1000).optional().default(""),
    yearsOfExperience: z.string().optional().default(""),
    location: z.string().max(200).optional().default(""),
    industry: z.string().optional().default(""),
    educationLevel: z.string().optional().default(""),
    companyType: z.string().optional().default(""),
  }),
});

export const linkedInSearchFiltersSchema = z.object({
  searchQuery: z.string().optional(),
  currentJobTitles: z.array(z.string()).optional(),
  pastJobTitles: z.array(z.string()).optional(),
  locations: z.array(z.string()).optional(),
  currentCompanies: z.array(z.string()).optional(),
  industryIds: z.array(z.number()).optional(),
  yearsOfExperienceIds: z.array(z.string()).optional(), // ✅ NEW
  seniorityLevelIds: z.array(z.string()).optional(),    // ✅ NEW
  maxItems: z.number().optional(),
  takePages: z.number().optional(),
});

export const structuredCandidateSchema = z.object({
  fullName: z.string().describe('Full name of the candidate'),
  headline: z.string().nullable().describe('Professional headline'),
  location: z.string().nullable().describe('Current location'),
  
  // Better URL handling
  profileUrl: z.string().url().describe('LinkedIn profile URL (must be valid)'),
  photoUrl: z.string().url().nullable().describe('Profile photo URL - must be valid URL or null'),
  
  currentPosition: z.string().nullable().describe('Current job title'),
  currentCompany: z.string().nullable().describe('Current employer'),
  experienceYears: z.number().int().nullable().describe('Total years of experience'),
  
  // Arrays should default to empty rather than optional
  skills: z.array(z.string()).default([]).describe('Array of skill names as strings'),
  
  experience: z.array(
    z.object({
      title: z.string().describe('Job title'),
      company: z.string().describe('Company name'),
      duration: z.string().describe('Time period (e.g., "2020-2023")'),
      description: z.string().nullable().describe('Job description'),
    })
  ).default([]).describe('Work experience history'),
  
  education: z.array(
    z.object({
      degree: z.string().describe('Degree or qualification'),
      school: z.string().describe('School or university name'),
      year: z.string().nullable().describe('Graduation year'),
    })
  ).default([]).describe('Education history'),
  
  // Safer email validation
  email: z.string().email().nullable().describe('Email address - must be valid format or null'),
  phone: z.string().nullable().describe('Phone number'),
});

// ============================================
// ENHANCED: Candidate Score Schema
// ============================================

export const candidateScoreSchema = z.object({
  // ============================================
  // SCORING (100 points total)
  // ============================================
  skillsScore: z.number().min(0).max(30)
    .describe('Skills match score (0-30 points). Award points for transferable skills, not just exact matches.'),
  
  experienceScore: z.number().min(0).max(25)
    .describe('Experience relevance score (0-25 points). Focus on similar roles and responsibilities.'),
  
  industryScore: z.number().min(0).max(20)
    .describe('Industry alignment score (0-20 points). Adjacent industries are acceptable.'),
  
  titleScore: z.number().min(0).max(15)
    .describe('Title/seniority match score (0-15 points). Consider similar responsibilities.'),
  
  niceToHaveScore: z.number().min(0).max(10)
    .describe('Bonus points for nice-to-have skills (0-10 points).'),
  
  totalScore: z.number().min(0).max(100)
    .describe('Sum of all scores. 80+ = excellent, 65-79 = good, 60-64 = acceptable, <60 = poor fit.'),
  
  reasoning: z.string().min(200).max(1200)
    .describe('Comprehensive reasoning for the total score. Explain scoring decisions across all categories. 3-5 paragraphs covering: skill assessment, experience relevance, industry fit, seniority match, and overall recommendation. Be specific with examples from their profile.'),
  
  // ============================================
  // SKILL MATCHING
  // ============================================
  matchedSkills: z.array(z.string()).default([])
    .describe('Array of required skills the candidate possesses. Include transferable skills. Example: ["React", "Node.js", "TypeScript"]'),
  
  missingSkills: z.array(z.string()).default([])
    .describe('Array of required skills the candidate lacks. Focus on critical gaps. Example: ["Kubernetes", "AWS"]'),
  
  bonusSkills: z.array(z.string()).default([])
    .describe('Array of nice-to-have skills the candidate has. Example: ["GraphQL", "Docker"]'),
  
  // ============================================
  // EXPERIENCE ANALYSIS
  // ============================================
  relevantYears: z.number().int().min(0).nullable()
    .describe('Years of directly relevant experience (not total career years). Count only similar roles. Return null if unclear.'),
  
  seniorityLevel: z.enum(["Entry", "Mid", "Senior", "Lead", "Executive"])
    .describe('Candidate current seniority level based on their recent roles and responsibilities.'),
  
  industryMatch: z.string().nullable()
    .describe('Brief description of industry alignment. Example: "E-commerce and retail tech" or "Financial services". Return null if no clear industry.'),
  
  // ============================================
  // INTERVIEW READINESS (Primary Decision)
  // ============================================
  interviewReadiness: z.enum([
    "READY_TO_INTERVIEW",
    "INTERVIEW_WITH_VALIDATION", 
    "NOT_RECOMMENDED"
  ]).describe('Primary recommendation: READY (80+ score OR 7+ matched skills), VALIDATION (60-80 score OR 5-7 matched skills), NOT_RECOMMENDED (<60 score OR <5 matched skills OR critical deal-breakers)'),
  
  interviewReadinessReason: z.string().min(100).max(400)
    .describe('Detailed explanation (2-4 sentences) of why you chose this readiness level. Reference specific scores, matched skills count, and any critical factors. Example: "With 8/10 required skills matched and 85 total score, candidate shows strong technical alignment. Their 5 years in similar roles at tech companies demonstrates relevant experience. Recommend proceeding to technical interview."'),
  
  interviewConfidenceScore: z.number().min(0).max(100)
    .describe('How confident are you in this recommendation? 0-50 = low confidence (risky), 50-75 = moderate (some unknowns), 75-100 = high confidence (clear decision)'),
  
  candidateSummary: z.string().min(150).max(400)
    .describe('Executive summary of the candidate (2-3 sentences). Cover: current role, key strengths, main concern/gap, and fit level. Example: "Senior Frontend Engineer at TechCorp with 6 years React experience. Strong technical foundation with 9/12 required skills. Main gap is backend experience but shows willingness to learn full-stack. Good fit for mid-level full-stack role."'),
  
  keyStrengths: z.array(z.string()).min(1).max(3)
    .describe('Top 3 compelling reasons to interview this candidate. Be specific with evidence. Each should be 10-20 words. Example: ["Led React migration at scale (5M+ users)", "Strong CS fundamentals from tier-1 university", "Current role closely matches job requirements"]'),
  
  // ============================================
  // ENHANCED SKILL ANALYSIS
  // ============================================
  skillsProficiency: z.number().min(1).max(5)
    .describe('Overall skill proficiency rating: 5=Expert (5+ yrs, led projects), 4=Advanced (3-5 yrs production), 3=Intermediate (1-3 yrs experience), 2=Beginner (mentioned only), 1=No evidence'),
  
  criticalGaps: z.array(z.string()).max(5).default([])
    .describe('Critical missing skills that would prevent job success. Max 5. Be specific. Example: ["No Kubernetes experience despite DevOps role", "Lacks SQL skills required for data role"]'),
  
  skillGapImpact: z.enum(["High", "Medium", "Low"])
    .describe('Overall impact of skill gaps: High = fundamental skills missing, Medium = important but trainable, Low = minor gaps only'),
  
  skillsAnalysisSummary: z.string().min(150).max(500)
    .describe('Comprehensive skill analysis (2-4 sentences). Address: technical foundation strength, specific matched/missing skills with examples, transferability assessment, and upskilling requirements. Example: "Candidate demonstrates strong frontend foundation with expert-level React and TypeScript skills (5+ years each). Backend skills are limited—has Node.js but missing Python/Django required for this role. However, strong CS fundamentals suggest quick ramp-up possible. Would need 2-3 months backend training."'),
  
  // ============================================
  // ENHANCED EXPERIENCE ANALYSIS  
  // ============================================
  experienceRelevanceScore: z.number().min(0).max(100)
    .describe('How relevant is their background to this role? 0-100 scale. Consider: role similarity (40%), industry alignment (30%), scope/scale (20%), recency (10%). Independent of experience score.'),
  
  seniorityAlignment: z.enum(["Perfect", "Higher", "Lower", "Unclear"])
    .describe('Does candidate seniority match role level? Perfect = same level, Higher = overqualified, Lower = underqualified, Unclear = can go either'),
  
  industryAlignment: z.enum(["Exact", "Adjacent", "Different"])
    .describe('Industry background fit: Exact = same industry, Adjacent = transferable (e.g., fintech to banking), Different = unrelated'),
  
  experienceHighlights: z.array(z.object({
    title: z.string().describe('Job title from their experience'),
    company: z.string().describe('Company name'),
    relevance: z.enum(["High", "Medium", "Low"]).describe('How relevant is this role to the job?'),
    reason: z.string().min(30).max(150).describe('Why is this experience relevant? Be specific about skills/responsibilities that transfer. 1-2 sentences.')
  })).max(3).default([])
    .describe('Top 3 most relevant roles from their background. Pick roles with highest transferability.'),
  
  experienceAnalysisSummary: z.string().min(150).max(500)
    .describe('Experience assessment (2-4 sentences). Cover: most relevant roles with specific examples, industry background fit, seniority level appropriateness, and any red flags (job hopping, gaps, career pivots). Example: "5 years as Senior Engineer at 2 fast-growing startups demonstrates relevant scaling experience. Led teams of 3-5 engineers matching leadership requirements. E-commerce background transfers well to retail tech role. Concern: short 8-month tenure at last company requires exploration."'),
  
  // ============================================
  // GAPS & TRADE-OFFS
  // ============================================
  hasSignificantGaps: z.boolean()
    .describe('Are there material gaps that need discussion? true = yes (major skill/experience gaps), false = no (minor gaps only)'),
  
  gapsAndTradeoffs: z.object({
    criticalGaps: z.array(z.object({
      type: z.enum(["skill", "experience", "seniority", "industry"])
        .describe('Gap category'),
      gap: z.string().min(20).max(150)
        .describe('Specific gap description. Be concrete. Example: "No Python experience despite role requiring Python for 60% of work"'),
      impact: z.enum(["High", "Medium", "Low"])
        .describe('High = blocks job success, Medium = makes ramp-up harder, Low = nice-to-have'),
      mitigation: z.string().min(30).max(200).nullable()
        .describe('How could this gap be addressed? Include timeline. Example: "Strong JavaScript background suggests Python ramp-up in 1-2 months with mentorship." Return null if not trainable.')
    })).max(5).default([])
      .describe('List of critical gaps (max 5). Only include gaps that materially affect job performance. Be honest but constructive.'),
    
    acceptableTradeoffs: z.array(z.object({
      tradeoff: z.string().min(20).max(100)
        .describe('What are we trading off? Example: "Has Vue instead of React"'),
      reasoning: z.string().min(30).max(200)
        .describe('Why is this acceptable? Example: "Both are component frameworks. Vue experience transfers 80% to React. 2-week ramp-up expected."')
    })).max(5).default([])
      .describe('Acceptable compromises (max 5). Things that are close enough or easily trainable. Help hiring manager see flexibility.'),
    
    dealBreakers: z.array(z.string()).max(3).default([])
      .describe('Absolute blockers if any (max 3). Only list if truly prevents job success. Example: ["Requires 10 years experience, candidate has 2", "No legal right to work in US"]. Leave empty if none.')
  }).describe('Comprehensive gap analysis with mitigation strategies'),
  
  gapsOverallImpact: z.enum(["Manageable", "Significant", "Critical"])
    .describe('Overall assessment: Manageable = minor gaps only, Significant = major gaps but workable with training, Critical = too many fundamental gaps'),
  
  gapsSummary: z.string().min(150).max(500)
    .describe('Gap analysis summary (2-4 sentences). Be honest but constructive. Cover: main gaps identified, their impact, trainability/mitigation options, and whether candidate could grow into role. Example: "Primary gap is lack of backend experience (Node.js/Express) required for full-stack role. However, strong JavaScript foundation and willingness to learn suggest 2-3 month ramp-up. Secondary gap is DevOps exposure but not critical for first 6 months. Overall, gaps are significant but manageable with proper onboarding."'),
  
  // ============================================
  // INTERVIEW FOCUS AREAS
  // ============================================
  interviewFocusAreas: z.array(z.object({
    category: z.enum(["Skill Validation", "Experience Depth", "Gap Mitigation", "Culture Fit", "Red Flag Exploration"])
      .describe('Focus area category'),
    question: z.string().min(30).max(200)
      .describe('Specific question or topic to probe. Be actionable. Example: "Describe your largest React application. What was the architecture? How did you handle state management at scale?"'),
    reasoning: z.string().min(20).max(250)
      .describe('Why is this important to explore? What are you validating? Example: "Need to verify React expertise depth since role requires leading frontend architecture. Looking for evidence of large-scale experience and architectural decision-making."')
  })).min(2).max(5)
    .describe('2-5 specific focus areas for the interview. Prioritize by importance. Mix validation (prove they can do it) with gap exploration (can they learn it).'),
  
  suggestedQuestions: z.array(z.string().min(30).max(200)).min(5).max(8).default([])
    .describe('5-8 specific interview questions. Mix: technical depth questions, behavioral/experience questions, scenario-based questions, and gap-related questions. Be specific and actionable. Example: "Walk me through your approach to optimizing a React app that was experiencing performance issues. What tools did you use?"'),
  
  redFlags: z.array(z.string().min(20).max(150)).max(3).default([])
    .describe('Genuine concerns to explore (max 3). Be specific, not generic. Example: "Short tenure at last 3 companies (6-8 months each) - explore reasons for frequent moves" or "2-year employment gap between 2020-2022 - understand career trajectory". Leave empty if none.'),
  
  interviewFocusSummary: z.string().min(150).max(500)
    .describe('Interview strategy summary (2-4 sentences). Cover: main areas to probe deeply, validation vs exploration balance, any specific concerns to address, and overall interview approach (technical deep-dive vs broad assessment). Example: "Focus interview on validating React/TypeScript depth through architecture discussions and code challenges. Probe leadership experience with behavioral questions on team management. Explore gap in backend experience—assess learning agility and interest in full-stack work. Overall strategy: deep technical validation + growth mindset assessment."')
});

export type CandidateScore = z.infer<typeof candidateScoreSchema>;
