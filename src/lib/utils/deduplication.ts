import { prisma } from "../prisma";

/**
 * Check if this profile URL exists in user's other sourcing jobs
 */
export async function checkDuplicateCandidate(
  userId: string,
  profileUrl: string
): Promise<{ sourcingJobId: string } | null> {
  const existing = await prisma.linkedInCandidate.findFirst({
    where: {
      profileUrl: profileUrl,
      sourcingJob: {
        userId: userId,
      },
    },
    select: {
      sourcingJobId: true,
    },
    orderBy: {
      scrapedAt: "asc", // Get the first time they saw this candidate
    },
  });

  return existing;
}