export interface MatchResult {
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
}

export function calculateMatchScore(
  candidateSkills: string[],
  requiredSkills: string[],
  candidateExperience: number,
  requiredExperience: string
): MatchResult {
  // Normalize skills to lowercase for comparison
  const normalizeCandidateSkills = candidateSkills.map((s) =>
    s.toLowerCase().trim()
  );
  const normalizeRequiredSkills = requiredSkills.map((s) =>
    s.toLowerCase().trim()
  );

  // Find matched skills (exact or partial match)
  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];

  for (const reqSkill of normalizeRequiredSkills) {
    const found = normalizeCandidateSkills.some(
      (candSkill) =>
        candSkill.includes(reqSkill) ||
        reqSkill.includes(candSkill) ||
        levenshteinSimilarity(candSkill, reqSkill) > 0.8
    );

    if (found) {
      // Find original casing from requiredSkills
      const originalSkill = requiredSkills.find(
        (s) => s.toLowerCase().trim() === reqSkill
      )!;
      matchedSkills.push(originalSkill);
    } else {
      const originalSkill = requiredSkills.find(
        (s) => s.toLowerCase().trim() === reqSkill
      )!;
      missingSkills.push(originalSkill);
    }
  }

  // Calculate skill match percentage (70% weight)
  const skillMatchPercentage =
    normalizeRequiredSkills.length > 0
      ? (matchedSkills.length / normalizeRequiredSkills.length) * 100
      : 100;
  const skillScore = skillMatchPercentage * 0.7;

  // Extract required experience years
  const reqExpYears = extractExperienceYears(requiredExperience);

  // Calculate experience score (30% weight)
  let expScore = 0;
  if (reqExpYears > 0) {
    if (candidateExperience >= reqExpYears) {
      expScore = 30; // Full points if meets or exceeds
    } else {
      expScore = (candidateExperience / reqExpYears) * 30;
    }
  } else {
    // No experience requirement = no points awarded or deducted (neutral)
    expScore = 0;
  }

  const totalScore = Math.round(skillScore + expScore);

  return {
    score: Math.min(totalScore, 100),
    matchedSkills,
    missingSkills,
  };
}

// Helper: Extract years from experience string
function extractExperienceYears(expString: string): number {
  const match = expString.match(/(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

// Helper: Levenshtein similarity for fuzzy matching
function levenshteinSimilarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(s1: string, s2: string): number {
  const costs: number[] = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}