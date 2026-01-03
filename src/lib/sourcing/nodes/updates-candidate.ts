// lib/sourcing/nodes/update-candidates.ts

import { prisma } from "../../prisma";
import { checkDuplicateCandidate } from "../../utils/deduplication";
import { SourcingState } from "../state";


export async function updateCandidates(state: SourcingState) {
  console.log(`\n💾 UPDATE PHASE`);
  console.log(`📊 Updating ${state.parsedProfiles.length} candidates with parsed data...`);

  if (state.parsedProfiles.length === 0) {
    console.log(`✅ No parsed profiles to update`);
    return { currentStage: "UPDATE_COMPLETE" };
  }

  // ✅ RESUME SUPPORT: Check what's already updated
  const alreadyUpdated = await prisma.linkedInCandidate.findMany({
    where: {
      sourcingJobId: state.jobId,
      scrapingStatus: "SCRAPED"
    },
    select: { profileUrl: true }
  });

  const updatedUrls = new Set(alreadyUpdated.map((c: any) => c.profileUrl));
  const remainingProfiles = state.parsedProfiles.filter(
    p => !updatedUrls.has(p.profileUrl)
  );

  if (remainingProfiles.length === 0) {
    console.log(`✅ All candidates already updated`);
    return { currentStage: "UPDATE_COMPLETE" };
  }

  console.log(`♻️ ${alreadyUpdated.length} already updated, processing ${remainingProfiles.length} remaining...`);

  let updated = 0;
  let failed = 0;
  const batchSize = 20;
  const totalBatches = Math.ceil(remainingProfiles.length / batchSize);

  for (let i = 0; i < totalBatches; i++) {
    const start = i * batchSize;
    const end = Math.min(start + batchSize, remainingProfiles.length);
    const batch = remainingProfiles.slice(start, end);

    console.log(`💾 Updating batch ${i + 1}/${totalBatches} (${batch.length} candidates)...`);

    for (const profile of batch) {
      try {
        // Check for duplicate across user's jobs
        const duplicate = await checkDuplicateCandidate(
          state.userId,
          profile.profileUrl
        );

        // UPDATE existing candidate (created in enrich_and_create)
        await prisma.linkedInCandidate.update({
          where: {
            sourcingJobId_profileUrl: {
              sourcingJobId: state.jobId,
              profileUrl: profile.profileUrl
            }
          },
          data: {
            // Update with parsed data (don't overwrite email from enrichment)
            fullName: profile.fullName,
            headline: profile.headline,
            location: profile.location,
            photoUrl: profile.photoUrl,
            linkedInId: profile.linkedInId,
            publicIdentifier: profile.publicIdentifier,
            
            // Current role
            currentPosition: profile.currentPosition,
            currentCompany: profile.currentCompany,
            currentCompanyLogo: profile.currentCompanyLogo,
            currentJobDuration: profile.currentJobDuration,
            experienceYears: profile.experienceYears,
            
            // Detailed data
            skills: profile.skills || [],
            experience: profile.experience || [],
            education: profile.education || [],
            certifications: profile.certifications || [],
            languages: profile.languages || [],
            
            // LinkedIn stats
            connections: profile.connections,
            followers: profile.followers,
            isPremium: profile.isPremium || false,
            isVerified: profile.isVerified || false,
            isOpenToWork: profile.isOpenToWork || false,
            
            // Duplication
            isDuplicate: !!duplicate,
            firstSeenJobId: duplicate?.sourcingJobId || undefined,
            
            // Status
            scrapingStatus: "SCRAPED",
            scrapedAt: new Date(),
            
            // Raw data
            rawData: profile
          }
        });

        updated++;
        console.log(`   ✓ Updated: ${profile.fullName}`);

      } catch (error: any) {
        console.error(`   ❌ Failed to update ${profile.fullName}:`, error.message);
        failed++;
      }
    }

    console.log(`✓ Batch ${i + 1}: Updated ${updated} candidates so far`);

    // ✅ Update progress after each batch
    await prisma.sourcingJob.update({
      where: { id: state.jobId },
      data: {
        profilesSaved: alreadyUpdated.length + updated,
        status: "SAVING_PROFILES",
        currentStage: `UPDATING_BATCH_${i + 1}_OF_${totalBatches}`,
        lastActivityAt: new Date()
      }
    });
  }

  console.log(`\n✅ Update complete: ${updated} updated, ${failed} failed`);

  await prisma.sourcingJob.update({
    where: { id: state.jobId },
    data: {
      profilesSaved: alreadyUpdated.length + updated,
      status: "SAVING_PROFILES",
      currentStage: "UPDATE_COMPLETE",
      lastCompletedStage: "update_candidates", // ✅ ADD THIS LINE
      lastActivityAt: new Date()
    }
  });

  return {
    currentStage: "UPDATE_COMPLETE"
  };
}