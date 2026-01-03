// lib/constants/linkedin-mappings.ts

export const INDUSTRY_TO_LINKEDIN_ID: Record<string, number[] | undefined> = {
  "Software Development": [4],
  "SaaS": [4, 6],
  "FinTech": [43, 4],
  "E-commerce": [6],
  "Healthcare": [14],
  "Education": [69],  // Education Management
  "Finance": [43],    // Financial Services
  "Consulting": [11], // Management Consulting
  "Cloud": [96, 4],   // IT Services + Software
  "AI/ML": [4, 6],
  "Cybersecurity": [96, 122], // IT Services + Security
  "Gaming": [4, 6],
  "Marketing": [80],  // Marketing and Advertising
  "Any": undefined,   // Don't filter by industry
};

export const YEARS_OF_EXPERIENCE_IDS_MAPPING: Record<string, string[]> = {
  "internship": ["1"],           // Less than 1 year
  "entry": ["1", "2"],            // Less than 1 year + 1-2 years
  "associate": ["2", "3"],        // 1-2 years + 3-5 years
  "mid-senior": ["3", "4"],       // 3-5 years + 6-10 years
  "director": ["4", "5"],         // 6-10 years + 10+ years
  "executive": ["5"],             // 10+ years only
};

export const SENIORITY_LEVEL_IDS_MAPPING: Record<string, string[]> = {
  "internship": ["100"],          // In Training
  "entry": ["110"],               // Entry Level
  "associate": ["110", "120"],    // Entry Level + Senior
  "mid-senior": ["120", "130"],   // Senior + Strategic
  "director": ["200", "210", "220"], // Managers + Director
  "executive": ["300", "310", "320"], // VP + CXO + Owner
};