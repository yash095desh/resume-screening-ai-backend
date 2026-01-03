// lib/sourcing/nodes/enrich-and-create.ts
import { RateLimitError } from "../../errors/rate-limit-error";
import { prisma } from "../../prisma";
import type { SourcingState } from "../state";
import { any } from "zod";

interface SalesQLEmail {
  email: string;
  type: string;
  status: "Valid" | "Unverifiable" | string;
}

interface SalesQLPhone {
  phone: string;
  type: string;
  country_code?: string;
  is_valid?: boolean;
}

interface SalesQLLocation {
  city?: string;
  state?: string;
  country_code?: string;
  country?: string;
}

interface SalesQLResponse {
  uuid?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  linkedin_url?: string;
  headline?: string;
  emails?: SalesQLEmail[];
  phones?: SalesQLPhone[];
  location?: SalesQLLocation;
  industry?: string;
  image?: string;
}

interface SalesQLResult {
  hasEmail: boolean;
  email?: string;
  phone?: string;
  emailType?: string;
  emailStatus?: string;
  fullData?: SalesQLResponse;
}

async function enrichWithSalesQL(
  linkedinUrl: string,
  apiKey: string
): Promise<SalesQLResult> {
  try {
    const response = await fetch(
      `https://api-public.salesql.com/v1/persons/enrich/?linkedin_url=${encodeURIComponent(
        linkedinUrl
      )}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.status === 429) {
      console.error(`⚠️ SalesQL rate limit hit`);

      // Try to get reset time from headers (if available)
      const resetHeader =
        response.headers.get("X-RateLimit-Reset") ||
        response.headers.get("Retry-After");

      const resetAt = resetHeader
        ? new Date(parseInt(resetHeader) * 1000)
        : new Date(Date.now() + 24 * 60 * 60 * 1000); // Default: 24 hours

      throw new RateLimitError("SalesQL rate limit exceeded", {
        type: "salesql",
        resetAt,
        message:
          "Email enrichment service limit reached. Will retry automatically.",
      });
    }

    if (!response.ok) {
      return { hasEmail: false };
    }

    const data: SalesQLResponse = await response.json() as SalesQLResponse;

    if (data.emails && data.emails.length > 0) {
      const validDirect = data.emails.find(
        (e: SalesQLEmail) => e.status === "Valid" && e.type === "Direct"
      );
      const validAny = data.emails.find(
        (e: SalesQLEmail) => e.status === "Valid"
      );
      const bestEmail = validDirect || validAny || data.emails[0];

      const result: SalesQLResult = {
        hasEmail: true,
        email: bestEmail.email,
        emailType: bestEmail.type,
        emailStatus: bestEmail.status,
        fullData: data,
      };

      if (data.phones && data.phones.length > 0) {
        const validPhone = data.phones.find(
          (p: SalesQLPhone) => p.is_valid === true
        );
        const selectedPhone = validPhone || data.phones[0];
        result.phone = selectedPhone.phone;
      }

      return result;
    }

    return { hasEmail: false };
  } catch (error: any) {
    console.error(`❌ SalesQL error:`, error.message);
    return { hasEmail: false };
  }
}

export async function enrichAndCreateCandidates(state: SourcingState) {
  console.log(
    `\n📧 ENRICHMENT STARTED: Target ${state.maxCandidates}, Processing ${state.currentSearchResults.length} profiles`
  );

  // ✅ STEP 1: Get current count from state OR database
  let foundWithEmail = state.candidatesWithEmails || 0;

  if (foundWithEmail === 0) {
    console.log("📂 Checking database for existing candidates...");
    const existingCount = await prisma.linkedInCandidate.count({
      where: {
        sourcingJobId: state.jobId,
        hasContactInfo: true,
      },
    });

    if (existingCount > 0) {
      foundWithEmail = existingCount;
      console.log(`♻️ Found ${existingCount} existing candidates in database`);
    }
  } else {
    console.log(`♻️ Using ${foundWithEmail} candidates from state`);
  }

  // ✅ STEP 2: Check if target already reached
  if (foundWithEmail >= state.maxCandidates) {
    console.log(
      `✅ Target already reached (${foundWithEmail}/${state.maxCandidates}), skipping enrichment`
    );

    await prisma.sourcingJob.update({
      where: { id: state.jobId },
      data: {
        totalProfilesFound: foundWithEmail,
        status: "PROFILES_FOUND",
        currentStage: "ENRICHMENT_COMPLETE",
        lastCompletedStage: "enrich_and_create",
        lastActivityAt: new Date(),
      },
    });

    return {
      candidatesWithEmails: foundWithEmail,
      currentSearchResults: [],
      currentStage: "ENRICHMENT_COMPLETE",
    };
  }

  // ✅ STEP 3: Check API key
  const apiKey = process.env.SALESQL_API_KEY;
  if (!apiKey) {
    console.error(`❌ SALESQL_API_KEY not configured`);

    await prisma.sourcingJob.update({
      where: { id: state.jobId },
      data: {
        status: "FAILED",
        errorMessage: "SalesQL API key not configured",
        failedAt: new Date(),
      },
    });

    return {
      errors: [
        {
          stage: "enrich_and_create",
          message: "SalesQL API key not configured",
          timestamp: new Date(),
          retryable: false,
        },
      ],
      currentStage: "ENRICHMENT_FAILED",
    };
  }

  // ✅ STEP 4: Get enrichedUrls from state (already loaded by buildResumeState or previous iterations)
  const enrichedUrls = state.enrichedUrls || new Set<string>();
  console.log(`♻️ Previously enriched: ${enrichedUrls.size} URLs (from state)`);

  let created = 0;
  let skipped = 0;
  let discarded = 0;

  // Track all URLs we process in this run
  const newlyEnrichedUrls = new Set<string>();

  try {
    // ✅ STEP 5: Process current search results
    for (let i = 0; i < state.currentSearchResults.length; i++) {
      const profile = state.currentSearchResults[i];

      if (foundWithEmail >= state.maxCandidates) {
        console.log(
          `🎯 Target reached (${foundWithEmail}/${
            state.maxCandidates
          }) at profile ${i + 1}/${state.currentSearchResults.length}`
        );
        break;
      }

      // ✅ Skip if already enriched (check state!)
      if (enrichedUrls.has(profile.profileUrl)) {
        skipped++;
        console.log(`   ⏭️  Already enriched: ${profile.profileUrl}`);
        continue;
      }

      // ✅ Check DB for existing candidate (safety check)
      const exists = await prisma.linkedInCandidate.findUnique({
        where: {
          sourcingJobId_profileUrl: {
            sourcingJobId: state.jobId,
            profileUrl: profile.profileUrl,
          },
        },
      });

      if (exists) {
        skipped++;
        if (exists.hasContactInfo) {
          foundWithEmail++;
        }
        newlyEnrichedUrls.add(profile.profileUrl);
        continue;
      }

      // ✅ Try enrichment
      const enrichment = await enrichWithSalesQL(profile.profileUrl, apiKey);

      // ✅ Mark as enriched regardless of outcome
      newlyEnrichedUrls.add(profile.profileUrl);

      if (enrichment.hasEmail) {
        try {
          const salesqlData = enrichment.fullData;

          await prisma.linkedInCandidate.create({
            data: {
              sourcingJobId: state.jobId,
              profileUrl: profile.profileUrl,
              fullName: salesqlData?.full_name || profile.fullName || "Unknown",
              headline: salesqlData?.headline || profile.headline,
              location: salesqlData?.location?.city
                ? `${salesqlData.location.city}, ${
                    salesqlData.location.state || salesqlData.location.country
                  }`
                : profile.location,
              currentPosition: profile.currentPosition,
              currentCompany: profile.currentCompany,
              photoUrl: salesqlData?.image || profile.photoUrl,
              email: enrichment.email,
              phone: enrichment.phone,
              hasContactInfo: true,
              emailSource: "salesql",
              enrichmentStatus: "ENRICHED",
              enrichedAt: new Date(),
              scrapingStatus: "PENDING",
              rawData: {
                searchData: profile,
                salesqlData: enrichment.fullData as any,
              } as any,
            },
          });

          created++;
          foundWithEmail++;
          console.log(
            `   ✓ Enriched: ${salesqlData?.full_name || profile.fullName}`
          );
        } catch (error: any) {
          console.error(`   ❌ DB error:`, error.message);
        }
      } else {
        discarded++;
        console.log(`   ✗ No email: ${profile.profileUrl}`);
      }

      if (i < state.currentSearchResults.length - 1) {
        await new Promise((r) => setTimeout(r, 334));
      }
    }
  } catch (error: any) {
    if (error instanceof RateLimitError) {
      console.error(`🛑 Rate limited by ${error.metadata.type}`);

      // Merge what we enriched so far
      const allEnrichedUrls = new Set([...enrichedUrls, ...newlyEnrichedUrls]);

      // Save rate limit info + checkpoint
      await prisma.sourcingJob.update({
        where: { id: state.jobId },
        data: {
          enrichedUrls: Array.from(allEnrichedUrls) as any,
          status: "RATE_LIMITED",
          rateLimitHitAt: new Date(),
          rateLimitResetAt: error.metadata.resetAt,
          rateLimitService: error.metadata.type,
          errorMessage: error.metadata.message || error.message,
          currentStage: `ENRICHING_${foundWithEmail}_OF_${state.maxCandidates}`,
          lastActivityAt: new Date(),
        },
      });

      return {
        candidatesWithEmails: foundWithEmail,
        enrichedUrls: allEnrichedUrls,
        currentSearchResults: [],
        currentStage: "RATE_LIMITED",
      };
    }

    // ✅ OTHER ERRORS - rethrow
    throw error;
  }

  // ✅ STEP 6: Merge enriched URLs (state + newly enriched)
  const allEnrichedUrls = new Set([...enrichedUrls, ...newlyEnrichedUrls]);

  console.log(
    `✅ ENRICHMENT COMPLETE: Created ${created}, Skipped ${skipped}, Discarded ${discarded}, Total ${foundWithEmail}/${state.maxCandidates}`
  );
  console.log(`📊 Total enriched URLs: ${allEnrichedUrls.size}\n`);

  const reachedTarget = foundWithEmail >= state.maxCandidates;

  // ✅ STEP 7: Save to DB
  await prisma.sourcingJob.update({
    where: { id: state.jobId },
    data: {
      enrichedUrls: Array.from(allEnrichedUrls) as any,
      totalProfilesFound: reachedTarget ? foundWithEmail : 0,
      status: reachedTarget ? "PROFILES_FOUND" : "SEARCHING_PROFILES",
      currentStage: reachedTarget
        ? "ENRICHMENT_COMPLETE"
        : `ENRICHING_${foundWithEmail}_OF_${state.maxCandidates}`,
      lastCompletedStage: reachedTarget ? "enrich_and_create" : undefined,
      lastActivityAt: new Date(),
    },
  });

  return {
    candidatesWithEmails: foundWithEmail,
    enrichedUrls: allEnrichedUrls, // ✅ Return updated set to state
    currentSearchResults: [],
    currentStage: reachedTarget
      ? "ENRICHMENT_COMPLETE"
      : "NEED_MORE_CANDIDATES",
  };
}
