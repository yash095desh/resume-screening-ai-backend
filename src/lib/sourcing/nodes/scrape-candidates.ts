// lib/sourcing/nodes/scrape-candidates.ts
import { prisma } from "../../prisma";
import { scrapeLinkedInProfiles } from "../../scrapping/apify-client";
import type { SourcingState } from "../state";

export async function scrapeCandidates(state: SourcingState) {
  console.log(`\n📦 SCRAPING PHASE`);

  // Get candidates that need scraping (all have emails already)
  const candidates = await prisma.linkedInCandidate.findMany({
    where: {
      sourcingJobId: state.jobId,
      scrapingStatus: "PENDING",
    },
    select: {
      id: true,
      profileUrl: true,
      fullName: true,
    },
  });

  console.log(`📊 Scraping ${candidates.length} candidates...`);

  if (candidates.length === 0) {
    console.log(`✅ No candidates to scrape`);
    return {
      scrapedProfiles: [],
      currentStage: "SCRAPING_COMPLETE",
    };
  }

  // ✅ RESUME SUPPORT: Check what's already scraped
  const existingJob = await prisma.sourcingJob.findUnique({
    where: { id: state.jobId },
    select: {
      scrapedProfilesData: true,
      profilesScraped: true,
    },
  });

  let allScrapedProfiles: any[] = [];

  if (
    existingJob?.scrapedProfilesData &&
    Array.isArray(existingJob.scrapedProfilesData)
  ) {
    allScrapedProfiles = existingJob.scrapedProfilesData as any[];
    console.log(
      `♻️ Resuming with ${allScrapedProfiles.length} already scraped profiles`
    );
  }

  const alreadyScrapedUrls = new Set(
    allScrapedProfiles.filter((p: any) => p.succeeded).map((p: any) => p.url)
  );

  const remainingCandidates = candidates.filter(
    (c: any) => !alreadyScrapedUrls.has(c.profileUrl)
  );

  if (remainingCandidates.length === 0) {
    console.log(`✅ All profiles already scraped`);
    return {
      scrapedProfiles: allScrapedProfiles,
      currentStage: "SCRAPING_COMPLETE",
    };
  }

  console.log(
    `🔄 Scraping ${remainingCandidates.length} remaining profiles...`
  );

  const batchSize = state.batchSize || 20;
  const totalBatches = Math.ceil(remainingCandidates.length / batchSize);

  for (let i = 0; i < totalBatches; i++) {
    const start = i * batchSize;
    const end = Math.min(start + batchSize, remainingCandidates.length);
    const batch = remainingCandidates.slice(start, end);
    const urls = batch.map((c:any) => c.profileUrl);

    console.log(
      `📦 Scraping batch ${i + 1}/${totalBatches} (${urls.length} profiles)...`
    );

    try {
      const rawProfiles = await scrapeLinkedInProfiles(urls);
      const succeeded = rawProfiles.filter((p: any) => p.succeeded).length;

      console.log(
        `✓ Batch ${i + 1}: Scraped ${succeeded}/${
          rawProfiles.length
        } successfully`
      );

      // Add to results
      allScrapedProfiles = [...allScrapedProfiles, ...rawProfiles];

      // ✅ Save checkpoint after each batch
      await prisma.sourcingJob.update({
        where: { id: state.jobId },
        data: {
          scrapedProfilesData: allScrapedProfiles as any,
          profilesScraped: allScrapedProfiles.filter((p: any) => p.succeeded)
            .length,
          status: "SCRAPING_PROFILES",
          currentStage: `SCRAPING_BATCH_${i + 1}_OF_${totalBatches}`,
          lastActivityAt: new Date(),
        },
      });
    } catch (error: any) {
      if (error.name === "RateLimitError") {
        console.error(`🛑 Rate limited by ${error.metadata.type}`);

        // Save what we have so far + rate limit info
        await prisma.sourcingJob.update({
          where: { id: state.jobId },
          data: {
            scrapedProfilesData: allScrapedProfiles as any,
            profilesScraped: allScrapedProfiles.filter((p: any) => p.succeeded)
              .length,
            status: "RATE_LIMITED",
            rateLimitHitAt: new Date(),
            rateLimitResetAt: error.metadata.resetAt,
            rateLimitService: error.metadata.type,
            errorMessage: error.metadata.message || error.message,
            lastActivityAt: new Date(),
          },
        });

        return {
          scrapedProfiles: allScrapedProfiles,
          currentStage: "RATE_LIMITED",
        };
      }

      console.error(`❌ Batch ${i + 1} scraping failed:`, error.message);

      await prisma.sourcingJob.update({
        where: { id: state.jobId },
        data: {
          scrapedProfilesData: allScrapedProfiles as any,
          profilesScraped: allScrapedProfiles.filter((p: any) => p.succeeded)
            .length,
          errorMessage: `Batch ${i + 1} failed: ${error.message}`,
          lastActivityAt: new Date(),
        },
      });

      continue;
    }
  }

  const successCount = allScrapedProfiles.filter(
    (p: any) => p.succeeded
  ).length;
  console.log(`✅ Scraping complete: ${successCount} profiles scraped`);

  await prisma.sourcingJob.update({
    where: { id: state.jobId },
    data: {
      status: "SCRAPING_PROFILES",
      currentStage: "SCRAPING_COMPLETE",
      lastCompletedStage: "scrape_candidates", // ✅ ADD THIS LINE
      lastActivityAt: new Date(),
    },
  });

  return {
    scrapedProfiles: allScrapedProfiles,
    currentStage: "SCRAPING_COMPLETE",
  };
}
