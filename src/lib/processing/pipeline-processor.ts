// import { prisma } from "../prisma";
// import { scoreCandidateWithRubric } from "../ai/linkedin-scorer";
// import { checkDuplicateCandidate } from "../utils/deduplication";
// import { formatJobDescriptionForLinkedIn } from "../ai/job-description-formator";
// import { scrapeLinkedInProfiles, searchLinkedInProfiles } from "../scrapping/apify-client";
// import { cleanProfileData, hasContactInfo, isValidProfile } from "../scrapping/profile-cleaner";
// import { parseProfileWithAI } from "../ai/profile-parser";

// const BATCH_SIZE = 20; // Optimized for dev_fusion actor (was 25)
// const MAX_PARALLEL_BATCHES = 2;

// /**
//  * Main pipeline processor with checkpoint recovery
//  */
// export async function processSourcingJobWithCheckpoints(jobId: string) {
//   const startTime = Date.now();
  
//   try {
//     console.log(`\n${'='.repeat(80)}`);
//     console.log(`🚀 Starting job processing: ${jobId}`);
//     console.log(`   Timestamp: ${new Date().toISOString()}`);
//     console.log(`${'='.repeat(80)}\n`);

//     // Fetch job
//     let job = await prisma.sourcingJob.findUnique({
//       where: { id: jobId },
//       include: { user: true },
//     });

//     if (!job) {
//       console.error(`❌ Job not found: ${jobId}`);
//       throw new Error("Job not found");
//     }

//     console.log(`📋 Job Details:`);
//     console.log(`   - ID: ${job.id}`);
//     console.log(`   - User: ${job.user.email}`);
//     console.log(`   - Status: ${job.status}`);
//     console.log(`   - Max Candidates: ${job.maxCandidates}`);
//     console.log(`   - Created: ${job.createdAt.toISOString()}`);
//     console.log(`   - Last Activity: ${job.lastActivityAt?.toISOString() || 'N/A'}`);
    
    
    
//     if (job.totalProfilesFound) {
//       console.log(`   - Profiles found: ${job.totalProfilesFound}`);
//       console.log(`   - Profiles scraped: ${job.profilesScraped || 0}`);
//       console.log(`   - Profiles scored: ${job.profilesScored || 0}`);
//       const progress = job.totalProfilesFound > 0 
//         ? ((job.profilesScored || 0) / job.totalProfilesFound * 100).toFixed(1)
//         : 0;
//       console.log(`   - Progress: ${progress}%`);
//     }
    
//     if (job.errorMessage) {
//       console.log(`   - ⚠️  Previous error: ${job.errorMessage}`);
//     }
//     console.log();

//     // Update activity timestamp
//     await updateActivity(jobId);

//     // === STAGE 1: FORMAT JD (Checkpoint) ===
//     if (job.status === "CREATED") {
//       console.log(`\n${'─'.repeat(80)}`);
//       console.log(`📝 STAGE 1: FORMAT JOB DESCRIPTION`);
//       console.log(`${'─'.repeat(80)}`);
//       await formatJobDescription(job);

//       // Reload job to get updated status
//       job = await prisma.sourcingJob.findUnique({
//         where: { id: jobId },
//         include: { user: true },
//       });
//       if (!job) throw new Error("Job not found after Stage 1");
//     }

//     // === STAGE 2: SEARCH PROFILES (Checkpoint) ===
//     if (job.status === "SEARCHING_PROFILES") {
//       console.log(`\n${'─'.repeat(80)}`);
//       console.log(`🔍 STAGE 2: SEARCH LINKEDIN PROFILES`);
//       console.log(`${'─'.repeat(80)}`);
//       await searchProfiles(job);

//       // Reload job to get updated status
//       job = await prisma.sourcingJob.findUnique({
//         where: { id: jobId },
//         include: { user: true },
//       });
//       if (!job) throw new Error("Job not found after Stage 2");
//     }

//     // === STAGE 3: PIPELINE BATCH PROCESSING (Checkpointed per batch) ===
//     if (job.status === "SCRAPING_PROFILES" && job.discoveredUrls) {
//       console.log(`\n${'─'.repeat(80)}`);
//       console.log(`⚡ STAGE 3: PIPELINE BATCH PROCESSING`);
//       console.log(`${'─'.repeat(80)}`);
//       await processBatchesPipelined(job);
//     }

//     // === STAGE 4: MARK COMPLETE ===
//     await prisma.sourcingJob.update({
//       where: { id: jobId },
//       data: {
//         status: "COMPLETED",
//         completedAt: new Date(),
//         lastActivityAt: new Date(),
//       },
//     });

//     const duration = ((Date.now() - startTime) / 1000).toFixed(2);
//     console.log(`\n${'='.repeat(80)}`);
//     console.log(`✅ Job ${jobId} completed successfully!`);
//     console.log(`   Total duration: ${duration}s`);
//     console.log(`   Timestamp: ${new Date().toISOString()}`);
//     console.log(`${'='.repeat(80)}\n`);
//   } catch (error: any) {
//     const duration = ((Date.now() - startTime) / 1000).toFixed(2);
//     console.error(`\n${'='.repeat(80)}`);
//     console.error(`❌ Job ${jobId} FAILED after ${duration}s`);
//     console.error(`   Error: ${error.message}`);
//     console.error(`   Stack: ${error.stack}`);
//     console.error(`   Timestamp: ${new Date().toISOString()}`);
//     console.error(`${'='.repeat(80)}\n`);

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


// // STAGE 1: Format job description (with checkpoint)

// async function formatJobDescription(job: any) {
//   const stageStart = Date.now();
//   console.log("📝 Stage 1: Formatting job description...");
//   console.log(`   Job ID: ${job.id}`);
//   console.log(`   JD Length: ${job.rawJobDescription?.length || 0} characters`);

//   try {
//     await prisma.sourcingJob.update({
//       where: { id: job.id },
//       data: {
//         status: "FORMATTING_JD",
//         processingStartedAt: job.processingStartedAt || new Date(),
//         lastActivityAt: new Date(),
//       },
//     });
//     console.log(`   ✓ Status updated to FORMATTING_JD`);

//     console.log(`   🤖 Calling AI to format job description...`);
//     const searchFilters = await formatJobDescriptionForLinkedIn(job.rawJobDescription);
    

//     // CHECKPOINT: Save filters
//     await prisma.sourcingJob.update({
//       where: { id: job.id },
//       data: {
//         searchFilters: searchFilters as any,
//         status: "SEARCHING_PROFILES",
//         lastActivityAt: new Date(),
//       },
//     });

//     const duration = ((Date.now() - stageStart) / 1000).toFixed(2);
//     console.log(`✅ Stage 1 complete - Checkpoint saved (${duration}s)\n`);
//   } catch (error: any) {
//     console.error(`❌ Stage 1 failed: ${error.message}`);
//     throw error;
//   }
// }



// /**
//  * STAGE 2: Search LinkedIn profiles (with checkpoint)
//  */

// async function searchProfiles(job: any) {
//   const stageStart = Date.now();
//   console.log("🔍 Stage 2: Searching LinkedIn profiles...");
//   console.log(`   Job ID: ${job.id}`);

//   try {
//     // Extract search filters from job
//     const searchFilters = job.searchFilters as {
//       keywords?: string[];
//       titles?: string[];
//       experienceYears?: string;
//       location?: string;
//       companies?: string[];
//     };

//     console.log(`   📋 Search parameters:`);
//     console.log(`      - Keywords: ${searchFilters.keywords?.join(', ') || 'None'}`);
//     console.log(`      - Titles: ${searchFilters.titles?.join(', ') || 'None'}`);
//     console.log(`      - Experience: ${searchFilters.experienceYears || 'Any'}`);
//     console.log(`      - Location: ${searchFilters.location || 'Any'}`);
//     console.log(`      - Max results: ${job.maxCandidates}`);

//     console.log(`   🌐 Calling LinkedIn search API...`);
//     const searchStart = Date.now();
//     const results = await searchLinkedInProfiles({
//       keywords: searchFilters.keywords || [],
//       titles: searchFilters.titles || [],
//       experienceYears: searchFilters.experienceYears,
//       location: searchFilters.location,
//       maxResults: job.maxCandidates,
//     });
//     const searchDuration = ((Date.now() - searchStart) / 1000).toFixed(2);
    
//     console.log(`   ✓ Search API complete (${searchDuration}s)`);
//     console.log(`   📊 Found ${results.length} profile URLs`);

//     const profileUrls = results.map((r) => r.profileUrl);

//     // Log sample URLs
//     if (profileUrls.length > 0) {
//       console.log(`   📎 Sample URLs:`);
//       profileUrls.slice(0, 3).forEach((url, i) => {
//         console.log(`      ${i + 1}. ${url}`);
//       });
//       if (profileUrls.length > 3) {
//         console.log(`      ... and ${profileUrls.length - 3} more`);
//       }
//     }

//     // CHECKPOINT: Save discovered URLs
//     const totalBatches = Math.ceil(profileUrls.length / BATCH_SIZE);
//     console.log(`   💾 Saving checkpoint...`);
//     console.log(`      - Total URLs: ${profileUrls.length}`);
//     console.log(`      - Batch size: ${BATCH_SIZE}`);
//     console.log(`      - Total batches: ${totalBatches}`);
    
//     await prisma.sourcingJob.update({
//       where: { id: job.id },
//       data: {
//         discoveredUrls: profileUrls as any,
//         totalProfilesFound: profileUrls.length,
//         status: "SCRAPING_PROFILES",
//         totalBatches: totalBatches,
//         lastActivityAt: new Date(),
//       },
//     });

//     const duration = ((Date.now() - stageStart) / 1000).toFixed(2);
//     console.log(`✅ Stage 2 complete - Found ${profileUrls.length} profiles - Checkpoint saved (${duration}s)\n`);
//   } catch (error: any) {
//     console.error(`❌ Stage 2 failed: ${error.message}`);
//     console.error(`   Stack: ${error.stack}`);
    
//     // Update job with error but allow retry
//     await prisma.sourcingJob.update({
//       where: { id: job.id },
//       data: {
//         errorMessage: `Search failed: ${error.message}`,
//         lastActivityAt: new Date(),
//       },
//     });
    
//     throw error;
//   }
// }



// /**
//  * STAGE 3: Pipeline batch processing (scrape + parse + score per batch)
//  */

// async function processBatchesPipelined(job: any) {
//   const stageStart = Date.now();
//   console.log("⚡ Stage 3: Pipeline batch processing...");

//   const profileUrls: string[] = job.discoveredUrls;
//   const startBatch = job.lastCompletedBatch || 0; // Resume from checkpoint

//   // Split into batches
//   const batches: string[][] = [];
//   for (let i = 0; i < profileUrls.length; i += BATCH_SIZE) {
//     batches.push(profileUrls.slice(i, i + BATCH_SIZE));
//   }

//   const totalBatchGroups = Math.ceil(batches.length / MAX_PARALLEL_BATCHES);
//   const remainingBatches = batches.length - startBatch;
  
//   console.log(`   📦 Batch configuration:`);
//   console.log(`      - Total profiles: ${profileUrls.length}`);
//   console.log(`      - Batch size: ${BATCH_SIZE}`);
//   console.log(`      - Total batches: ${batches.length}`);
//   console.log(`      - Parallel batches: ${MAX_PARALLEL_BATCHES}`);
//   console.log(`      - Total batch groups: ${totalBatchGroups}`);
//   console.log(`      - Starting from batch: ${startBatch + 1}`);
//   console.log(`      - Remaining batches: ${remainingBatches}`);
//   console.log();

//   // Process remaining batches in parallel groups
//   for (let i = startBatch; i < batches.length; i += MAX_PARALLEL_BATCHES) {
//     const groupStart = Date.now();
//     const batchGroup = batches.slice(i, i + MAX_PARALLEL_BATCHES);
//     const currentGroupNum = Math.floor(i / MAX_PARALLEL_BATCHES) + 1;

//     console.log(`${'─'.repeat(60)}`);
//     console.log(`⚡ Processing batch group ${currentGroupNum}/${totalBatchGroups}`);
//     console.log(`   Batches in group: ${batchGroup.length}`);
//     console.log(`   Profiles in group: ${batchGroup.reduce((sum, b) => sum + b.length, 0)}`);
//     console.log(`${'─'.repeat(60)}\n`);

//     // Process batches in parallel
//     const batchPromises = batchGroup.map((batch, groupIndex) => 
//       processSingleBatch(job, batch, i + groupIndex)
//     );
    
//     await Promise.all(batchPromises);

//     // CHECKPOINT: Update last completed batch after each group
//     const lastBatchInGroup = Math.min(i + MAX_PARALLEL_BATCHES, batches.length);
//     const completionPercentage = ((lastBatchInGroup / batches.length) * 100).toFixed(1);
    
//     console.log(`\n   💾 Saving checkpoint...`);
//     await prisma.sourcingJob.update({
//       where: { id: job.id },
//       data: {
//         lastCompletedBatch: lastBatchInGroup,
//         lastActivityAt: new Date(),
//       },
//     });

//     const groupDuration = ((Date.now() - groupStart) / 1000).toFixed(2);
//     console.log(`   ✅ Checkpoint: Batches 1-${lastBatchInGroup} complete (${completionPercentage}%) - Group took ${groupDuration}s\n`);

//     // Small delay between batch groups to be respectful
//     if (i + MAX_PARALLEL_BATCHES < batches.length) {
//       const delaySeconds = 2;
//       console.log(`   ⏱️  Waiting ${delaySeconds}s before next group...\n`);
//       await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
//     }
//   }

//   // All batches done, move to scoring stage
//   console.log(`   🎯 All batches complete, updating status to SCORING...`);
//   await prisma.sourcingJob.update({
//     where: { id: job.id },
//     data: {
//       status: "SCORING",
//       lastActivityAt: new Date(),
//     },
//   });

//   const duration = ((Date.now() - stageStart) / 1000).toFixed(2);
//   console.log(`✅ Stage 3 complete (${duration}s)\n`);
// }



// /**
//  * Process a single batch: scrape → clean → parse → score → save
//  */

// // Improved processSingleBatch with better error handling and debugging

// async function processSingleBatch(job: any, profileUrls: string[], batchNumber: number) {
//   const batchStart = Date.now();
//   const batchId = `Batch ${batchNumber + 1}`;
  
//   try {
//     console.log(`\n┌${'─'.repeat(58)}┐`);
//     console.log(`│ 🔄 ${batchId.padEnd(55)}│`);
//     console.log(`└${'─'.repeat(58)}┘`);
//     console.log(`   Time: ${new Date().toISOString()}`);
//     console.log(`   Profiles: ${profileUrls.length}`);
//     console.log();

//     // 1. SCRAPE
//     console.log(`   1️⃣  SCRAPING (dev_fusion actor)...`);
//     const scrapeStart = Date.now();
//     const rawProfiles = await scrapeLinkedInProfiles(profileUrls);
//     const scrapeDuration = ((Date.now() - scrapeStart) / 1000).toFixed(2);

//     // Log enrichment stats
//     const succeeded = rawProfiles.filter((p: any) => p.succeeded).length;
//     const failed = rawProfiles.length - succeeded;
//     const withEmail = rawProfiles.filter((p: any) => p.email).length;
//     const withPhone = rawProfiles.filter((p: any) => p.mobileNumber || p.phone || p.phoneNumbers?.length > 0).length;
    
//     console.log(`   ✓ Scraping complete (${scrapeDuration}s)`);
//     console.log(`   📊 Results:`);
//     console.log(`      - Succeeded: ${succeeded}/${rawProfiles.length} (${((succeeded/rawProfiles.length)*100).toFixed(1)}%)`);
//     if (failed > 0) {
//       console.log(`      - Failed: ${failed}`);
//     }
//     console.log(`      - With email: ${withEmail} (${((withEmail/rawProfiles.length)*100).toFixed(1)}%)`);
//     console.log(`      - With phone: ${withPhone} (${((withPhone/rawProfiles.length)*100).toFixed(1)}%)`);
//     console.log();

//     // 2. CLEAN
//     console.log(`   2️⃣  CLEANING profiles...`);
//     const cleanStart = Date.now();
//     const cleanedProfiles = rawProfiles
//       .map(cleanProfileData)
//       .filter(isValidProfile);
//     const cleanDuration = ((Date.now() - cleanStart) / 1000).toFixed(2);
    
//     const cleaned = cleanedProfiles.length;
//     const removed = rawProfiles.length - cleaned;
//     console.log(`   ✓ Cleaning complete (${cleanDuration}s)`);
//     console.log(`      - Valid: ${cleaned}`);
//     if (removed > 0) {
//       console.log(`      - Removed: ${removed} (invalid/incomplete)`);
//     }
//     console.log();

//     // 3. PARSE with AI
//     console.log(`   3️⃣  PARSING with AI (${cleanedProfiles.length} profiles)...`);
//     const parseStart = Date.now();
    
//     // Track parsing results separately
//     const parseResults = await Promise.allSettled(
//       cleanedProfiles.map((p) => parseProfileWithAI(p))
//     );
    
//     // Separate successful and failed parses
//     const parsedProfiles: any[] = [];
//     const parseErrors: string[] = [];
    
//     parseResults.forEach((result, idx) => {
//       if (result.status === 'fulfilled') {
//         parsedProfiles.push(result.value);
//       } else {
//         const profileName = cleanedProfiles[idx]?.fullName || cleanedProfiles[idx]?.name || `Profile ${idx + 1}`;
//         parseErrors.push(`${profileName}: ${result.reason?.message || 'Unknown error'}`);
//         console.error(`      ⚠️  Parse failed: ${profileName} - ${result.reason?.message}`);
//       }
//     });
    
//     const parseDuration = ((Date.now() - parseStart) / 1000).toFixed(2);
    
//     console.log(`   ✓ Parsing complete (${parseDuration}s)`);
//     console.log(`      - Successful: ${parsedProfiles.length}/${cleanedProfiles.length}`);
//     if (parseErrors.length > 0) {
//       console.log(`      - Failed: ${parseErrors.length}`);
//     }
//     console.log(`      - Avg: ${(parseStart !== Date.now() && parsedProfiles.length > 0 ? (parseFloat(parseDuration) / parsedProfiles.length).toFixed(2) : 0)}s per profile`);
//     console.log();

//     // If ALL parses failed, this is a critical error
//     if (parsedProfiles.length === 0) {
//       throw new Error(`All ${cleanedProfiles.length} profiles failed to parse. Sample errors: ${parseErrors.slice(0, 3).join('; ')}`);
//     }

//     // 4. SAVE TO DB (before scoring so they appear in UI)
//     console.log(`   4️⃣  SAVING to database (${parsedProfiles.length} profiles)...`);
//     const saveStart = Date.now();
//     let duplicatesFound = 0;
//     const saveErrors: string[] = [];
    
//     const savedCandidates = await Promise.allSettled(
//       parsedProfiles.map(async (profile) => {
//         try {
//           // Validate profile has required fields before saving
//           if (!profile.fullName) {
//             throw new Error('Missing fullName');
//           }
//           if (!profile.profileUrl) {
//             throw new Error('Missing profileUrl');
//           }

//           // Check for duplicates
//           const duplicate = await checkDuplicateCandidate(job.userId, profile.profileUrl);
//           if (duplicate) duplicatesFound++;

//           return await prisma.linkedInCandidate.create({
//             data: {
//               sourcingJobId: job.id,
//               fullName: profile.fullName,
//               headline: profile.headline || null,
//               location: profile.location || null,
//               profileUrl: profile.profileUrl,
//               photoUrl: profile.photoUrl || null,
//               currentPosition: profile.currentPosition || null,
//               currentCompany: profile.currentCompany || null,
//               experienceYears: profile.experienceYears || null,
//               skills: profile.skills || [],
//               experience: profile.experience || [],
//               education: profile.education || [],
//               email: profile.email || null,
//               phone: profile.phone || null,
//               hasContactInfo: hasContactInfo(profile),
//               batchNumber: batchNumber + 1,
//               rawData: profile,
//               isDuplicate: !!duplicate,
//               firstSeenJobId: duplicate?.sourcingJobId,
//               isScored: false,
//             },
//           });
//         } catch (error) {
//           const errorMsg = `${profile.fullName || 'Unknown'}: ${error instanceof Error ? error.message : 'Unknown error'}`;
//           saveErrors.push(errorMsg);
//           throw new Error(errorMsg);
//         }
//       })
//     );

//     // Extract successful saves
//     const successfulSaves: any[] = [];
//     savedCandidates.forEach((result) => {
//       if (result.status === 'fulfilled') {
//         successfulSaves.push(result.value);
//       } else {
//         console.error(`      ⚠️  Save failed: ${result.reason?.message}`);
//       }
//     });

//     const saveDuration = ((Date.now() - saveStart) / 1000).toFixed(2);

//     console.log(`   ✓ Saving complete (${saveDuration}s)`);
//     console.log(`      - Saved: ${successfulSaves.length}/${parsedProfiles.length} candidates`);
//     if (saveErrors.length > 0) {
//       console.log(`      - Failed: ${saveErrors.length}`);
//     }
//     if (duplicatesFound > 0) {
//       console.log(`      - Duplicates: ${duplicatesFound}`);
//     }
//     console.log();

//     // If ALL saves failed, this is a critical error
//     if (successfulSaves.length === 0) {
//       throw new Error(`Failed to save any candidates. Sample errors: ${saveErrors.slice(0, 3).join('; ')}`);
//     }

//     // 5. SCORE each candidate immediately
//     console.log(`   5️⃣  SCORING candidates (${successfulSaves.length})...`);
//     const scoreStart = Date.now();
//     let scoredCount = 0;
//     let scoreFailures = 0;
    
//     for (const candidate of successfulSaves) {
//       try {
//         const score = await scoreCandidateWithRubric(candidate, job.rawJobDescription);

//         await prisma.linkedInCandidate.update({
//           where: { id: candidate.id },
//           data: {
//             matchScore: score.totalScore,
//             skillsScore: score.skillsScore,
//             experienceScore: score.experienceScore,
//             industryScore: score.industryScore,
//             titleScore: score.titleScore,
//             matchReason: score.reasoning,
//             isScored: true,
//             scoredAt: new Date(),
//           },
//         });
//         scoredCount++;
//       } catch (error) {
//         scoreFailures++;
//         console.error(`      ⚠️  Failed to score ${candidate.fullName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
//         // Don't fail the entire batch if one candidate scoring fails
//       }
//     }
//     const scoreDuration = ((Date.now() - scoreStart) / 1000).toFixed(2);

//     console.log(`   ✓ Scoring complete (${scoreDuration}s)`);
//     console.log(`      - Scored: ${scoredCount}/${successfulSaves.length}`);
//     if (scoreFailures > 0) {
//       console.log(`      - Failed: ${scoreFailures}`);
//     }
//     if (successfulSaves.length > 0) {
//       console.log(`      - Avg: ${(parseFloat(scoreDuration) / successfulSaves.length).toFixed(2)}s per candidate`);
//     }
//     console.log();

//     // Update job progress
//     console.log(`   📈 Updating job progress...`);
//     await prisma.sourcingJob.update({
//       where: { id: job.id },
//       data: {
//         profilesScraped: { increment: cleanedProfiles.length },
//         profilesScored: { increment: successfulSaves.length },
//         lastActivityAt: new Date(),
//       },
//     });

//     const batchDuration = ((Date.now() - batchStart) / 1000).toFixed(2);
//     console.log(`\n   ✅ ${batchId} COMPLETE!`);
//     console.log(`      Total time: ${batchDuration}s`);
//     console.log(`      Results: ${successfulSaves.length} candidates saved & scored`);
//     console.log(`      Pipeline: scrape(${scrapeDuration}s) → clean(${cleanDuration}s) → parse(${parseDuration}s) → save(${saveDuration}s) → score(${scoreDuration}s)`);
    
//     // Summary of issues if any
//     if (parseErrors.length > 0 || saveErrors.length > 0 || scoreFailures > 0) {
//       console.log(`      Issues: ${parseErrors.length} parse, ${saveErrors.length} save, ${scoreFailures} score failures`);
//     }
//     console.log();

//     // Return summary for monitoring
//     return {
//       success: true,
//       batchNumber: batchNumber + 1,
//       profiles: {
//         scraped: rawProfiles.length,
//         cleaned: cleanedProfiles.length,
//         parsed: parsedProfiles.length,
//         saved: successfulSaves.length,
//         scored: scoredCount
//       },
//       errors: {
//         parse: parseErrors.length,
//         save: saveErrors.length,
//         score: scoreFailures
//       }
//     };

//   } catch (error) {
//     const batchDuration = ((Date.now() - batchStart) / 1000).toFixed(2);
//     console.error(`\n   ❌ ${batchId} FAILED after ${batchDuration}s`);
//     console.error(`      Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
//     if (error instanceof Error && error.stack) {
//       console.error(`      Stack: ${error.stack.split('\n').slice(0, 5).join('\n')}`);
//     }
//     console.error();
    
//     // Log the failure to database
//     await prisma.sourcingJob.update({
//       where: { id: job.id },
//       data: {
//         errorMessage: `Batch ${batchNumber + 1} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
//         lastActivityAt: new Date(),
//       },
//     }).catch(dbError => {
//       console.error(`      ⚠️  Failed to log error to DB: ${dbError}`);
//     });

//     // Return failure summary
//     return {
//       success: false,
//       batchNumber: batchNumber + 1,
//       error: error instanceof Error ? error.message : 'Unknown error',
//       profiles: {
//         scraped: 0,
//         cleaned: 0,
//         parsed: 0,
//         saved: 0,
//         scored: 0
//       }
//     };
//   }
// }

// /**
//  * Update activity timestamp (for crash detection)
//  */
// async function updateActivity(jobId: string) {
//   await prisma.sourcingJob.update({
//     where: { id: jobId },
//     data: { lastActivityAt: new Date() },
//   });
// }