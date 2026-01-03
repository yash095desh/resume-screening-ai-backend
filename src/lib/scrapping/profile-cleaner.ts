/**
 * Smart profile cleaner - Keeps essential data, removes noise
 * Optimized for GPT-4o mini parsing (minimizes tokens while preserving quality)
 */

export function cleanProfileData(rawProfile: any): any {
  // Extract experience in a token-efficient format
  const experiences = (rawProfile.experiences || rawProfile.experience || [])
    .filter((exp: any) => exp.title || exp.jobTitle) // Only keep if has title
    .slice(0, 10) // Limit to last 10 jobs (saves tokens)
    .map((exp: any) => ({
      title: exp.title || exp.jobTitle || exp.position,
      company: (exp.companyName || exp.company || "").substring(0, 100), // Limit company name length
      duration:
        exp.currentJobDuration ||
        exp.duration ||
        `${exp.jobStartedOn || exp.startDate || ""} - ${
          exp.jobEndedOn || exp.endDate || "Present"
        }`,
      // Skip description for token savings - AI can infer from title
      ...(exp.jobLocation && { location: exp.jobLocation }),
    }));

  // Extract skills - keep top 50 max (LinkedIn shows endorsements)
  // Convert to array of strings for schema compatibility
  const skills = (rawProfile.skills || [])
    .filter((s: any) => s && (typeof s === "string" || s.title || s.name))
    .slice(0, 50) // Limit to top 50
    .map((s: any) => {
      if (typeof s === "string") return s;
      return s.title || s.name;
    })
    .filter(Boolean); // Remove any undefined/null values

  // Extract education - keep top 3
  const education = (rawProfile.educations || rawProfile.education || [])
    .filter((edu: any) => edu.title || edu.degree || edu.schoolName)
    .slice(0, 3) // Most recent 3
    .map((edu: any) => ({
      degree: edu.title || edu.degree || edu.subtitle,
      school: edu.schoolName || edu.school || edu.companyName,
      ...(edu.period?.endedOn?.year && { year: edu.period.endedOn.year }),
    }));

  // Extract certifications - keep top 5
  const certifications = (
    rawProfile.licenseAndCertificates ||
    rawProfile.certifications ||
    []
  )
    .filter((cert: any) => cert.title || cert.name)
    .slice(0, 5)
    .map((cert: any) => ({
      name: cert.title || cert.name,
      issuer: cert.companyName || cert.issuedBy,
      ...(cert.period?.startedOn?.year && { year: cert.period.startedOn.year }),
    }));

  // Extract languages
  const languages = (rawProfile.languages || [])
    .slice(0, 5)
    .map((lang: any) => ({
      name: lang.name || lang.title,
      ...(lang.proficiency && { level: lang.proficiency }),
    }));

  return {
    // === BASIC INFO ===
    fullName:
      rawProfile.fullName ||
      `${rawProfile.firstName || ""} ${rawProfile.lastName || ""}`.trim(),
    headline: rawProfile.headline?.substring(0, 200), // Limit headline length
    location:
      rawProfile.addressWithCountry ||
      rawProfile.addressWithoutCountry ||
      rawProfile.location,
    profileUrl:
      rawProfile.linkedinUrl ||
      rawProfile.linkedinPublicUrl ||
      rawProfile.profileUrl,
    photoUrl:
      rawProfile.profilePicHighQuality ||
      rawProfile.profilePic ||
      rawProfile.photoUrl,
    linkedInId: rawProfile.linkedinId || rawProfile.linkedInId,
    publicIdentifier: rawProfile.publicIdentifier,

    // === CURRENT ROLE ===
    currentPosition: rawProfile.jobTitle || experiences[0]?.title,
    currentCompany: rawProfile.companyName || experiences[0]?.company,
    currentCompanyLogo: experiences[0]?.logo,
    currentJobDuration: rawProfile.currentJobDuration,
    experienceYears:
      rawProfile.totalExperienceYears || calculateExperienceYears(experiences),

    // === STRUCTURED DATA ===
    skills,
    experience: experiences,
    education,
    ...(certifications.length > 0 && { certifications }),
    ...(languages.length > 0 && { languages }),

    // === CONTACT ===
    email: rawProfile.email,
    phone: rawProfile.mobileNumber || rawProfile.phone,

    // === PROFILE STATS ===
    connections: rawProfile.connections,
    followers: rawProfile.followers,
    isPremium: rawProfile.isPremium || false,
    isVerified: rawProfile.isVerified || false,
    isOpenToWork: rawProfile.isJobSeeker || rawProfile.isOpenToWork || false,

    // === ABOUT (Truncate for tokens) ===
    about: rawProfile.about?.substring(0, 500), // Keep first 500 chars only
  };
}

/**
 * Validate profile has minimum data
 */
export function isValidProfile(profile: any): boolean {
  const hasBasicInfo = !!(profile.fullName && profile.profileUrl);
  const hasContent = !!(
    profile.headline ||
    profile.currentPosition ||
    (profile.experience && profile.experience.length > 0) ||
    (profile.skills && profile.skills.length > 0)
  );

  return hasBasicInfo && hasContent;
}

/**
 * Calculate total years of experience from experience array
 */
function calculateExperienceYears(experiences: any[]): number {
  if (!experiences || experiences.length === 0) return 0;

  let totalYears = 0;

  for (const exp of experiences) {
    if (!exp.duration) continue;

    // Try to extract years from duration string
    const yearMatch = exp.duration.match(/(\d+)\s*(yr|year)/i);
    const monthMatch = exp.duration.match(/(\d+)\s*(mo|month)/i);

    if (yearMatch) totalYears += parseInt(yearMatch[1]);
    if (monthMatch) totalYears += parseInt(monthMatch[1]) / 12;

    // Try date range format "2020 - 2023"
    const dateMatch = exp.duration.match(/(\d{4})\s*-\s*(?:Present|(\d{4}))/i);
    if (dateMatch) {
      const start = parseInt(dateMatch[1]);
      const end = dateMatch[2]
        ? parseInt(dateMatch[2])
        : new Date().getFullYear();
      totalYears += end - start;
    }
  }

  return Math.round(totalYears * 10) / 10; // Round to 1 decimal
}

/**
 * Check if profile has contact info
 */
export function hasContactInfo(profile: any): boolean {
  return !!(profile.email || profile.phone);
}
