// import { prisma } from "../prisma";
// import { scoreCandidatesInParallel } from "../ai/linkedin-scorer";
// import { checkDuplicateCandidate } from "../utils/deduplication";
// import { formatJobDescriptionForLinkedIn } from "../ai/job-description-formator";
// import {
//   searchLinkedInProfiles,
// } from "../scrapping/apify-client";
// import { RateLimitError, isRateLimitError } from "../errors/rate-limit-error";

// const BATCH_SIZE = 20;

// /**
//  * Enhanced checkpoint-driven pipeline processor
//  * Every step saves to database and can resume from exact point
//  */
// export async function processSourcingJobWithCheckpoints(jobId: string) {
//   const startTime = Date.now();

//   try {
//     console.log(`\n${"=".repeat(80)}`);
//     console.log(`🚀 Starting/Resuming job: ${jobId}`);
//     console.log(`   Timestamp: ${new Date().toISOString()}`);
//     console.log(`${"=".repeat(80)}\n`);

//     // Fetch job with current state
//     let job = await prisma.sourcingJob.findUnique({
//       where: { id: jobId },
//       include: { user: true },
//     });

//     if (!job) {
//       throw new Error("Job not found");
//     }

//     // Check retry cooldown
//     if (job.retryAfter && new Date() < job.retryAfter) {
//       const secondsLeft = Math.ceil(
//         (job.retryAfter.getTime() - Date.now()) / 1000
//       );
//       throw new Error(
//         `Job is on cooldown. Retry after ${secondsLeft} seconds.`
//       );
//     }

//     // Check rate limit
//     if (job.status === "RATE_LIMITED") {
//       if (job.rateLimitResetAt && new Date() < job.rateLimitResetAt) {
//         const secondsLeft = Math.ceil(
//           (job.rateLimitResetAt.getTime() - Date.now()) / 1000
//         );
//         throw new RateLimitError(
//           `Rate limit active. Reset in ${secondsLeft} seconds.`,
//           {
//             type: job.rateLimitType as any,
//             resetAt: job.rateLimitResetAt,
//           }
//         );
//       }

//       // Rate limit expired, reset to continue from where we left off
//       console.log(
//         `✅ Rate limit expired, resuming from: ${
//           job.currentStage || job.status
//         }`
//       );
//       job = await prisma.sourcingJob.update({
//         where: { id: jobId },
//         data: {
//           status: determineResumeStatus(job),
//           rateLimitHitAt: null,
//           rateLimitResetAt: null,
//           rateLimitType: null,
//           lastActivityAt: new Date(),
//         },
//         include: { user: true },
//       });
//     }

//     logJobState(job);

//     // Update activity timestamp
//     await updateActivity(jobId);

//     // === CHECKPOINT-DRIVEN EXECUTION ===
//     // Resume from exact checkpoint based on status

//     // STAGE 1: Format Job Description
//     if (job.status === "CREATED" || job.status === "FORMATTING_JD") {
//       await stage1_FormatJobDescription(jobId);
//       job = await refreshJob(jobId);
//     }

//     // STAGE 2: Search Profiles
//     if (job.status === "JD_FORMATTED" || job.status === "SEARCHING_PROFILES") {
//       await stage2_SearchProfiles(jobId);
//       job = await refreshJob(jobId);
//     }

//     // STAGE 3: Scrape Profiles in Batches
//     if (job.status === "PROFILES_FOUND" || job.status === "SCRAPING_PROFILES") {
//       await stage3_ScrapeBatches(jobId);
//       job = await refreshJob(jobId);
//     }

//     // STAGE 4: Parse Profiles in Batches
//     if (job.status === "PARSING_PROFILES") {
//       await stage4_ParseBatches(jobId);
//       job = await refreshJob(jobId);
//     }

//     // STAGE 5: Save to Database in Batches
//     if (job.status === "SAVING_PROFILES") {
//       await stage5_SaveBatches(jobId);
//       job = await refreshJob(jobId);
//     }

//     // STAGE 6: Score Candidates in Batches
//     if (job.status === "SCORING_PROFILES") {
//       await stage6_ScoreBatches(jobId);
//       job = await refreshJob(jobId);
//     }

//     // === MARK COMPLETE ===
//     if (job.status !== "COMPLETED") {
//       await prisma.sourcingJob.update({
//         where: { id: jobId },
//         data: {
//           status: "COMPLETED",
//           completedAt: new Date(),
//           lastActivityAt: new Date(),
//           currentStage: "COMPLETED",
//         },
//       });
//     }

//     const duration = ((Date.now() - startTime) / 1000).toFixed(2);
//     console.log(`\n${"=".repeat(80)}`);
//     console.log(`✅ Job ${jobId} completed successfully!`);
//     console.log(`   Total duration: ${duration}s`);
//     console.log(`${"=".repeat(80)}\n`);
//   } catch (error: any) {
//     const duration = ((Date.now() - startTime) / 1000).toFixed(2);

//     // Handle rate limit errors specially
//     if (isRateLimitError(error)) {
//       console.error(`\n${"=".repeat(80)}`);
//       console.error(`⏸️  Job ${jobId} RATE LIMITED after ${duration}s`);
//       console.error(`   Type: ${error.type}`);
//       console.error(`   Reset at: ${error.resetAt.toISOString()}`);
//       console.error(`   Retry after: ${error.retryAfter}s`);
//       console.error(`${"=".repeat(80)}\n`);

//       await handleRateLimitError(jobId, error);
//       throw error; // Re-throw to propagate to API
//     }

//     // Handle other errors
//     console.error(`\n${"=".repeat(80)}`);
//     console.error(`❌ Job ${jobId} FAILED after ${duration}s`);
//     console.error(`   Error: ${error.message}`);
//     console.error(`   Stack: ${error.stack}`);
//     console.error(`${"=".repeat(80)}\n`);

//     await prisma.sourcingJob.update({
//       where: { id: jobId },
//       data: {
//         status: "FAILED",
//         errorMessage: error.message,
//         failedAt: new Date(),
//         lastActivityAt: new Date(),
//       },
//     });

//     throw error;
//   }
// }

// // ============================================================================
// // STAGE 1: Format Job Description
// // ============================================================================

// async function stage1_FormatJobDescription(jobId: string) {
//   const stageStart = Date.now();
//   console.log(`\n${"─".repeat(80)}`);
//   console.log(`📝 STAGE 1: FORMAT JOB DESCRIPTION`);
//   console.log(`${"─".repeat(80)}`);

//   try {
//     const job = await prisma.sourcingJob.findUnique({ where: { id: jobId } });
//     if (!job) throw new Error("Job not found");

//     // ✅ UPDATE THIS: Extract jobRequirements from JSON
//     const jobRequirements = job.jobRequirements as any;

//     // Check if already completed
//     if (job.searchFilters && job.status === "JD_FORMATTED") {
//       console.log(`✅ Stage 1 already completed (checkpoint exists)`);
//       return;
//     }

//     // Update status to in-progress
//     await prisma.sourcingJob.update({
//       where: { id: jobId },
//       data: {
//         status: "FORMATTING_JD",
//         currentStage: "FORMATTING_JD",
//         processingStartedAt: job.processingStartedAt || new Date(),
//         lastActivityAt: new Date(),
//       },
//     });

//     console.log(`🤖 Calling AI to format job description...`);

//     // ✅ UPDATE THIS: Pass both rawJobDescription AND jobRequirements to AI
//     const searchFilters = await formatJobDescriptionForLinkedIn(
//       job.rawJobDescription,
//       jobRequirements, // Pass the structured requirements
//       job.maxCandidates // Pass the max candidates limit
//     );

//     console.log(`✓ AI formatting complete`);
//     console.log(`📊 Extracted filters:`);
//     console.log(`   - Extracted Job Details: ${searchFilters}`);

//     // ✅ CHECKPOINT: Save filters
//     await prisma.sourcingJob.update({
//       where: { id: jobId },
//       data: {
//         searchFilters: searchFilters as any,
//         searchFiltersCreatedAt: new Date(),
//         status: "JD_FORMATTED",
//         currentStage: "JD_FORMATTED",
//         lastActivityAt: new Date(),
//       },
//     });

//     const duration = ((Date.now() - stageStart) / 1000).toFixed(2);
//     console.log(`✅ Stage 1 COMPLETE - Checkpoint saved (${duration}s)\n`);
//   } catch (error: any) {
//     console.error(`❌ Stage 1 failed: ${error.message}`);
//     throw error;
//   }
// }

// // ============================================================================
// // STAGE 2: Search Profiles
// // ============================================================================

// async function stage2_SearchProfiles(jobId: string) {
//   const stageStart = Date.now();
//   console.log(`\n${"─".repeat(80)}`);
//   console.log(`🔍 STAGE 2: SEARCH LINKEDIN PROFILES`);
//   console.log(`${"─".repeat(80)}`);

//   try {
//     const job = await prisma.sourcingJob.findUnique({ where: { id: jobId } });
//     if (!job) throw new Error("Job not found");

//     // Check if already completed
//     if (job.discoveredUrls && job.status === "PROFILES_FOUND") {
//       console.log(`✅ Stage 2 already completed (checkpoint exists)`);
//       return;
//     }

//     const searchFilters = job.searchFilters as any;
//     if (!searchFilters) {
//       throw new Error("Search filters not found. Run Stage 1 first.");
//     }

//     // Update status to in-progress
//     await prisma.sourcingJob.update({
//       where: { id: jobId },
//       data: {
//         status: "SEARCHING_PROFILES",
//         currentStage: "SEARCHING_PROFILES",
//         lastActivityAt: new Date(),
//       },
//     });

//     console.log(`📋 Search parameters:`);
//     console.log(`   - Search Query: ${searchFilters.searchQuery || "None"}`);
//     console.log(
//       `   - Current Job Titles: ${
//         searchFilters.currentJobTitles?.join(", ") || "None"
//       }`
//     );
//     console.log(
//       `   - Locations: ${searchFilters.locations?.join(", ") || "None"}`
//     );
//     console.log(
//       `   - Companies: ${searchFilters.currentCompanies?.join(", ") || "None"}`
//     );
//     console.log(
//       `   - Industry IDs: ${searchFilters.industryIds?.join(", ") || "None"}`
//     );
//     console.log(
//       `   - Experience Years: ${
//         searchFilters.totalYearsOfExperience?.join(", ") || "None"
//       }`
//     );
//     console.log(
//       `   - Max Items: ${searchFilters.maxItems || job.maxCandidates}`
//     );
//     console.log(`   - Take Pages: ${searchFilters.takePages || "Auto"}`);

//     console.log(`🌐 Calling LinkedIn search API...`);

//     // Call search function with filters
//     const results = await searchLinkedInProfiles({
//       searchQuery: searchFilters.searchQuery,
//       currentJobTitles: searchFilters.currentJobTitles,
//       pastJobTitles: searchFilters.pastJobTitles,
//       locations: searchFilters.locations,
//       currentCompanies: searchFilters.currentCompanies,
//       industryIds: searchFilters.industryIds,
//       totalYearsOfExperience: searchFilters.totalYearsOfExperience,
//       maxItems: searchFilters.maxItems || job.maxCandidates,
//       takePages: searchFilters.takePages,
//     });

//     const profileUrls = results.map((r) => r.profileUrl).filter(Boolean);

//     console.log(`✓ Found ${profileUrls.length} valid profile URLs`);

//     // Validate we got results
//     if (profileUrls.length === 0) {
//       throw new Error("No profiles found. Try adjusting search filters.");
//     }

//     const totalBatches = Math.ceil(profileUrls.length / BATCH_SIZE);

//     // ✅ CHECKPOINT: Save discovered URLs
//     await prisma.sourcingJob.update({
//       where: { id: jobId },
//       data: {
//         discoveredUrls: profileUrls as any,
//         discoveredUrlsCreatedAt: new Date(),
//         totalProfilesFound: profileUrls.length,
//         totalBatches: totalBatches,
//         status: "PROFILES_FOUND",
//         currentStage: "PROFILES_FOUND",
//         lastActivityAt: new Date(),
//       },
//     });

//     const duration = ((Date.now() - stageStart) / 1000).toFixed(2);
//     console.log(
//       `✅ Stage 2 COMPLETE - Found ${profileUrls.length} profiles - Checkpoint saved (${duration}s)\n`
//     );
//   } catch (error: any) {
//     console.error(`❌ Stage 2 failed: ${error.message}`);
//     throw error;
//   }
// }

// // ============================================================================
// // STAGE 3: SCRAPE PROFILES (BATCHED) - Using ContactOut API
// // ============================================================================

// async function stage3_ScrapeBatches(jobId: string) {
//   const stageStart = Date.now();
//   console.log(`\n${"─".repeat(80)}`);
//   console.log(`⚙️  STAGE 3: SCRAPE PROFILES (BATCHED) - ContactOut API`);
//   console.log(`${"─".repeat(80)}`);

//   try {
//     const job = await prisma.sourcingJob.findUnique({ where: { id: jobId } });
//     if (!job) throw new Error("Job not found");

//     const profileUrls: string[] = job.discoveredUrls as any;
//     if (!profileUrls || profileUrls.length === 0) {
//       throw new Error("No profile URLs found. Run Stage 2 first.");
//     }

//     // Check if already completed
//     const totalBatches = Math.ceil(profileUrls.length / BATCH_SIZE);
//     if (job.lastScrapedBatch >= totalBatches) {
//       console.log(`✅ Stage 3 already completed (all batches scraped)`);
//       await prisma.sourcingJob.update({
//         where: { id: jobId },
//         data: { status: "SAVING_PROFILES", currentStage: "SAVING_PROFILES" },
//       });
//       return;
//     }

//     // Update status
//     await prisma.sourcingJob.update({
//       where: { id: jobId },
//       data: {
//         status: "SCRAPING_PROFILES",
//         currentStage: `SCRAPING_BATCH_${job.lastScrapedBatch + 1}`,
//         lastActivityAt: new Date(),
//       },
//     });

//     // Load existing scraped data
//     const scrapedData: Record<string, any[]> =
//       (job.scrapedProfilesData as any) || {};

//     // Process batches from where we left off
//     for (let i = job.lastScrapedBatch; i < totalBatches; i++) {
//       const batchStart = i * BATCH_SIZE;
//       const batchEnd = Math.min(batchStart + BATCH_SIZE, profileUrls.length);
//       const batchUrls = profileUrls.slice(batchStart, batchEnd);

//       console.log(
//         `\n📦 Scraping Batch ${i + 1}/${totalBatches} (${
//           batchUrls.length
//         } profiles)...`
//       );

//       // Update current stage
//       await prisma.sourcingJob.update({
//         where: { id: jobId },
//         data: {
//           currentStage: `SCRAPING_BATCH_${i + 1}`,
//           lastActivityAt: new Date(),
//         },
//       });

//       // Scrape this batch using ContactOut API
//       // ContactOut returns structured data directly - no cleaning needed!
//       const structuredProfiles = await scrapeLinkedInProfiles(batchUrls);

//       const succeeded = structuredProfiles.filter((p: any) => p.succeeded).length;
//       console.log(
//         `✓ Scraped ${succeeded}/${structuredProfiles.length} profiles successfully`
//       );

//       // ✅ CHECKPOINT: Save scraped structured data for this batch
//       // Note: This is already structured, so we can save directly
//       scrapedData[`batch_${i}`] = structuredProfiles;

//       await prisma.sourcingJob.update({
//         where: { id: jobId },
//         data: {
//           scrapedProfilesData: scrapedData as any,
//           lastScrapedBatch: i + 1,
//           profilesScraped: { increment: succeeded },
//           lastActivityAt: new Date(),
//         },
//       });

//       console.log(`✅ Batch ${i + 1} checkpoint saved`);
//     }

//     // Move to next stage - SKIP PARSING, go straight to SAVING
//     await prisma.sourcingJob.update({
//       where: { id: jobId },
//       data: {
//         status: "SAVING_PROFILES",
//         currentStage: "SAVING_PROFILES",
//         lastActivityAt: new Date(),
//       },
//     });

//     const duration = ((Date.now() - stageStart) / 1000).toFixed(2);
//     console.log(`\n✅ Stage 3 COMPLETE - All batches scraped (${duration}s)\n`);
//   } catch (error: any) {
//     console.error(`❌ Stage 3 failed: ${error.message}`);
//     throw error;
//   }
// }

// // ============================================================================
// // STAGE 4: PARSE PROFILES - NO LONGER NEEDED!
// // ============================================================================
// // This stage is now obsolete since ContactOut returns structured data
// // Keep for backward compatibility but it will skip immediately

// async function stage4_ParseBatches(jobId: string) {
//   const stageStart = Date.now();
//   console.log(`\n${"─".repeat(80)}`);
//   console.log(`⏭️  STAGE 4: SKIPPED (ContactOut returns structured data)`);
//   console.log(`${"─".repeat(80)}`);

//   try {
//     const job = await prisma.sourcingJob.findUnique({ where: { id: jobId } });
//     if (!job) throw new Error("Job not found");

//     // Just move to next stage immediately
//     await prisma.sourcingJob.update({
//       where: { id: jobId },
//       data: {
//         status: "SAVING_PROFILES",
//         currentStage: "SAVING_PROFILES",
//         lastActivityAt: new Date(),
//       },
//     });

//     const duration = ((Date.now() - stageStart) / 1000).toFixed(2);
//     console.log(`\n✅ Stage 4 SKIPPED - Data already structured (${duration}s)\n`);
//   } catch (error: any) {
//     console.error(`❌ Stage 4 failed: ${error.message}`);
//     throw error;
//   }
// }

// // ============================================================================
// // STAGE 5: Save to Database in Batches - UPDATED
// // ============================================================================

// async function stage5_SaveBatches(jobId: string) {
//   const stageStart = Date.now();
//   console.log(`\n${"─".repeat(80)}`);
//   console.log(`💾 STAGE 5: SAVE TO DATABASE (BATCHED)`);
//   console.log(`${"─".repeat(80)}`);

//   try {
//     const job = await prisma.sourcingJob.findUnique({ where: { id: jobId } });
//     if (!job) throw new Error("Job not found");

//     // Now we read from scrapedProfilesData instead of parsedProfilesData
//     const scrapedData: Record<string, any[]> =
//       (job.scrapedProfilesData as any) || {};
//     const totalBatches = job.totalBatches || 0;

//     if (Object.keys(scrapedData).length === 0) {
//       throw new Error("No scraped data found. Run Stage 3 first.");
//     }

//     // Check if already completed
//     if (job.lastSavedBatch >= totalBatches) {
//       console.log(`✅ Stage 5 already completed (all batches saved)`);
//       await prisma.sourcingJob.update({
//         where: { id: jobId },
//         data: { status: "SCORING_PROFILES", currentStage: "SCORING_PROFILES" },
//       });
//       return;
//     }

//     // Process batches from where we left off
//     for (let i = job.lastSavedBatch; i < totalBatches; i++) {
//       const batchKey = `batch_${i}`;
//       const profiles = scrapedData[batchKey];

//       if (!profiles || profiles.length === 0) {
//         console.log(`⚠️  Batch ${i + 1} has no scraped data, skipping...`);
//         await prisma.sourcingJob.update({
//           where: { id: jobId },
//           data: { lastSavedBatch: i + 1, lastActivityAt: new Date() },
//         });
//         continue;
//       }

//       console.log(
//         `\n💾 Saving Batch ${i + 1}/${totalBatches} (${
//           profiles.length
//         } profiles)...`
//       );

//       // Update current stage
//       await prisma.sourcingJob.update({
//         where: { id: jobId },
//         data: {
//           currentStage: `SAVING_BATCH_${i + 1}`,
//           lastActivityAt: new Date(),
//         },
//       });

//       let savedCount = 0;
//       let duplicatesCount = 0;

//       // Save each profile
//       for (const profile of profiles) {
//         try {
//           // Validate profile has minimum required fields
//           if (!profile.fullName || !profile.profileUrl) {
//             console.warn(
//               `⚠️  Skipping invalid profile (missing fullName or profileUrl)`
//             );
//             continue;
//           }

//           // Check for duplicates
//           const duplicate = await checkDuplicateCandidate(
//             job.userId,
//             profile.profileUrl
//           );
//           if (duplicate) duplicatesCount++;

//           // Save to database
//           await prisma.linkedInCandidate.create({
//             data: {
//               sourcingJobId: jobId,
//               fullName: profile.fullName,
//               headline: profile.headline || null,
//               location: profile.location || null,
//               profileUrl: profile.profileUrl,
//               photoUrl: profile.photoUrl || null,
//               linkedInId: profile.linkedInId || null,
//               publicIdentifier: profile.publicIdentifier || null,

//               // Current role
//               currentPosition: profile.currentPosition || null,
//               currentCompany: profile.currentCompany || null,
//               currentCompanyLogo: profile.currentCompanyLogo || null,
//               currentJobDuration: profile.currentJobDuration || null,
//               experienceYears: profile.experienceYears || null,

//               // Structured data
//               skills: profile.skills || [],
//               experience: profile.experience || [],
//               education: profile.education || [],
//               certifications: profile.certifications || [],
//               languages: profile.languages || [],

//               // Contact info
//               email: profile.email || null,
//               phone: profile.phone || null,
//               hasContactInfo: !!(profile.email || profile.phone),

//               // Profile stats
//               connections: profile.connections || null,
//               followers: profile.followers || null,
//               isPremium: profile.isPremium || false,
//               isVerified: profile.isVerified || false,
//               isOpenToWork: profile.isOpenToWork || false,

//               // Metadata
//               batchNumber: i + 1,
//               rawData: profile,
//               isDuplicate: !!duplicate,
//               firstSeenJobId: duplicate?.sourcingJobId,
//               isScored: false,
//             },
//           });
//           savedCount++;
//         } catch (error: any) {
//           console.error(
//             `⚠️  Failed to save ${profile.fullName}: ${error.message}`
//           );
//         }
//       }

//       console.log(`✓ Saved: ${savedCount}/${profiles.length} profiles`);
//       if (duplicatesCount > 0) {
//         console.log(`   - Duplicates: ${duplicatesCount}`);
//       }

//       // ✅ CHECKPOINT: Update last saved batch
//       await prisma.sourcingJob.update({
//         where: { id: jobId },
//         data: {
//           lastSavedBatch: i + 1,
//           profilesSaved: { increment: savedCount },
//           lastActivityAt: new Date(),
//         },
//       });

//       console.log(`✅ Batch ${i + 1} checkpoint saved`);
//     }

//     // Move to next stage
//     await prisma.sourcingJob.update({
//       where: { id: jobId },
//       data: {
//         status: "SCORING_PROFILES",
//         currentStage: "SCORING_PROFILES",
//         lastActivityAt: new Date(),
//       },
//     });

//     const duration = ((Date.now() - stageStart) / 1000).toFixed(2);
//     console.log(`\n✅ Stage 5 COMPLETE - All batches saved (${duration}s)\n`);
//   } catch (error: any) {
//     console.error(`❌ Stage 5 failed: ${error.message}`);
//     throw error;
//   }
// }


// // ============================================================================
// // STAGE 6: Score Candidates in Batches
// // ============================================================================

// async function stage6_ScoreBatches(jobId: string) {
//   const stageStart = Date.now();
//   console.log(`\n${"─".repeat(80)}`);
//   console.log(`⭐ STAGE 6: SCORE CANDIDATES (PARALLEL PROCESSING)`);
//   console.log(`${"─".repeat(80)}`);

//   try {
//     const job = await prisma.sourcingJob.findUnique({ where: { id: jobId } });
//     if (!job) throw new Error("Job not found");

//     const totalBatches = job.totalBatches || 0;
//     const jobRequirements = job.jobRequirements as any;

//     // Check if already completed
//     if (job.lastScoredBatch >= totalBatches) {
//       console.log(`✅ Stage 6 already completed (all batches scored)`);
//       return;
//     }

//     // Process batches from where we left off
//     for (let i = job.lastScoredBatch; i < totalBatches; i++) {
//       console.log(`\n⭐ Scoring Batch ${i + 1}/${totalBatches}...`);

//       // Update current stage
//       await prisma.sourcingJob.update({
//         where: { id: jobId },
//         data: {
//           currentStage: `SCORING_BATCH_${i + 1}`,
//           lastActivityAt: new Date(),
//         },
//       });

//       // Get unscored candidates from this batch
//       const candidates = await prisma.linkedInCandidate.findMany({
//         where: {
//           sourcingJobId: jobId,
//           batchNumber: i + 1,
//           isScored: false,
//         },
//       });

//       if (candidates.length === 0) {
//         console.log(
//           `⚠️  Batch ${i + 1} has no candidates to score, skipping...`
//         );
//         await prisma.sourcingJob.update({
//           where: { id: jobId },
//           data: { lastScoredBatch: i + 1, lastActivityAt: new Date() },
//         });
//         continue;
//       }

//       console.log(`✓ Found ${candidates.length} candidates to score`);

//       // ✅ PARALLEL PROCESSING: Score all candidates concurrently
//       const CONCURRENCY_LIMIT = 5; // Process 5 at a time to avoid rate limits
//       const results = await scoreCandidatesInParallel(
//         candidates,
//         job.rawJobDescription,
//         jobRequirements,
//         CONCURRENCY_LIMIT
//       );

//       let scoredCount = 0;
//       let failedCount = 0;

//       // ✅ BATCH UPDATE: Update all scored candidates
//       for (const result of results) {
//         if (result.status === 'success' && result.score) {
//           try {
//             await prisma.linkedInCandidate.update({
//               where: { id: result.candidateId },
//               data: {
//                 matchScore: result.score.totalScore,
//                 skillsScore: result.score.skillsScore,
//                 experienceScore: result.score.experienceScore,
//                 industryScore: result.score.industryScore,
//                 titleScore: result.score.titleScore,
//                 niceToHaveScore: result.score.niceToHaveScore,
//                 matchReason: result.score.reasoning,
//                 isScored: true,
//                 scoredAt: new Date(),
//               },
//             });
//             scoredCount++;
//           } catch (dbError: any) {
//             console.error(`❌ DB update failed for ${result.candidateName}: ${dbError.message}`);
//             failedCount++;
//           }
//         } else {
//           console.error(`❌ Scoring failed for ${result.candidateName}: ${result.error}`);
//           failedCount++;
//         }
//       }

//       console.log(`✓ Scored: ${scoredCount}/${candidates.length} candidates`);
//       if (failedCount > 0) {
//         console.log(`⚠️  Failed: ${failedCount}/${candidates.length} candidates`);
//       }

//       // ✅ CHECKPOINT: Update last scored batch
//       await prisma.sourcingJob.update({
//         where: { id: jobId },
//         data: {
//           lastScoredBatch: i + 1,
//           profilesScored: { increment: scoredCount },
//           lastActivityAt: new Date(),
//         },
//       });

//       console.log(`✅ Batch ${i + 1} checkpoint saved`);
//     }

//     const duration = ((Date.now() - stageStart) / 1000).toFixed(2);
//     console.log(`\n✅ Stage 6 COMPLETE - All batches scored (${duration}s)\n`);
//   } catch (error: any) {
//     console.error(`❌ Stage 6 failed: ${error.message}`);
//     throw error;
//   }
// }

// // ============================================================================
// // HELPER FUNCTIONS
// // ============================================================================

// async function refreshJob(jobId: string) {
//   const job = await prisma.sourcingJob.findUnique({
//     where: { id: jobId },
//     include: { user: true },
//   });
//   if (!job) throw new Error("Job not found");
//   return job;
// }

// async function updateActivity(jobId: string) {
//   await prisma.sourcingJob.update({
//     where: { id: jobId },
//     data: { lastActivityAt: new Date() },
//   });
// }

// function logJobState(job: any) {
//   console.log(`📋 Job State:`);
//   console.log(`   - ID: ${job.id}`);
//   console.log(`   - Status: ${job.status}`);
//   console.log(`   - Current Stage: ${job.currentStage || "N/A"}`);
//   console.log(`   - Progress:`);
//   console.log(`      • Profiles Found: ${job.totalProfilesFound}`);
//   console.log(
//     `      • Scraped: ${job.profilesScraped} (batch ${job.lastScrapedBatch}/${job.totalBatches})`
//   );
//   console.log(
//     `      • Parsed: ${job.profilesParsed} (batch ${job.lastParsedBatch}/${job.totalBatches})`
//   );
//   console.log(
//     `      • Saved: ${job.profilesSaved} (batch ${job.lastSavedBatch}/${job.totalBatches})`
//   );
//   console.log(
//     `      • Scored: ${job.profilesScored} (batch ${job.lastScoredBatch}/${job.totalBatches})`
//   );
//   if (job.errorMessage) {
//     console.log(`   - ⚠️  Last Error: ${job.errorMessage}`);
//   }
//   console.log();
// }

// function determineResumeStatus(job: any): any {
//   // Determine which stage to resume from based on checkpoint data
//   if (!job.searchFilters) return "CREATED";
//   if (!job.discoveredUrls) return "JD_FORMATTED";

//   const totalBatches = job.totalBatches || 0;

//   if (job.lastScrapedBatch < totalBatches) return "SCRAPING_PROFILES";
//   if (job.lastParsedBatch < totalBatches) return "PARSING_PROFILES";
//   if (job.lastSavedBatch < totalBatches) return "SAVING_PROFILES";
//   if (job.lastScoredBatch < totalBatches) return "SCORING_PROFILES";

//   return "COMPLETED";
// }

// async function handleRateLimitError(jobId: string, error: RateLimitError) {
//   await prisma.sourcingJob.update({
//     where: { id: jobId },
//     data: {
//       status: "RATE_LIMITED",
//       rateLimitHitAt: new Date(),
//       rateLimitResetAt: error.resetAt,
//       rateLimitType: error.type,
//       errorMessage: error.message,
//       lastActivityAt: new Date(),
//     },
//   });
// }
