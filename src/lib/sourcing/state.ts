// lib/sourcing/state.ts
import { Annotation } from "@langchain/langgraph";

export const SourcingStateAnnotation = Annotation.Root({
  // === Job Identity ===
  jobId: Annotation<string>(),
  userId: Annotation<string>(),
  
  // === Job Requirements ===
  rawJobDescription: Annotation<string>(),
  jobRequirements: Annotation<any>(),
  maxCandidates: Annotation<number>(),
  
  // === Search Configuration ===
  searchFilters: Annotation<any>({
    reducer: (current, update) => update ?? current,
    default: () => null
  }),
  
  searchQueries: Annotation<any[]>({
    reducer: (current, update) => update ?? current,
    default: () => []
  }),
  
  // === Search Tracking ===
  discoveredUrls: Annotation<Set<string>>({
    reducer: (current, update) => {
      if (!update) return current;
      return new Set([...Array.from(current), ...Array.from(update)]);
    },
    default: () => new Set()
  }),

  enrichedUrls: Annotation<Set<string>>({
    reducer: (current, update) => {
      if (!update) return current;
      return new Set([...Array.from(current), ...Array.from(update)]);
    },
    default: () => new Set()
  }),
  
  currentSearchResults: Annotation<any[]>({
    reducer: (current, update) => update ?? current,
    default: () => []
  }),
  
  searchIterations: Annotation<number>({
    reducer: (current, update) => update ?? current,
    default: () => 0
  }),
  
  // === Candidate Tracking ===
  candidatesWithEmails: Annotation<number>({
    reducer: (current, update) => {
      // Always use the update if provided (it's the latest count)
      if (update !== undefined && update !== null) {
        return update;
      }
      return current;
    },
    default: () => 0
  }),

  // === Scraping & Parsing ===
  scrapedProfiles: Annotation<any[]>({
    reducer: (current, update) => update ?? current,
    default: () => []
  }),
  
  parsedProfiles: Annotation<any[]>({
    reducer: (current, update) => update ?? current,
    default: () => []
  }),
  
  scoredCandidates: Annotation<any[]>({
    reducer: (current, update) => update ?? current,
    default: () => []
  }),
  
  // === Processing ===
  batchSize: Annotation<number>({
    reducer: (current, update) => update ?? current,
    default: () => 20
  }),
  
  // === Metadata ===
  errors: Annotation<any[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => []
  }),
  
  currentStage: Annotation<string>({
    reducer: (current, update) => update ?? current,
    default: () => "CREATED"
  })
});

export type SourcingState = typeof SourcingStateAnnotation.State;
export type SourcingStateUpdate = typeof SourcingStateAnnotation.Update;