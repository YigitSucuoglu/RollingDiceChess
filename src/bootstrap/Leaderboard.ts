import { LeaderboardService } from "../application/leaderboard/LeaderboardService";
import type { LeaderboardPort } from "../application/leaderboard/LeaderboardPort";
import { createSupabaseAuthClient } from "../infrastructure/auth/createSupabaseAuthClient";
import { SupabaseLeaderboardAdapter } from "../infrastructure/leaderboard/SupabaseLeaderboardAdapter";
import { UnavailableLeaderboardAdapter } from "../infrastructure/leaderboard/UnavailableLeaderboardAdapter";
import { E2ELeaderboardAdapter } from "../infrastructure/testing/E2ELeaderboardAdapter";

export function createLeaderboardPort(): LeaderboardPort {
  if (import.meta.env.MODE === "e2e") return new E2ELeaderboardAdapter();
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key || typeof window === "undefined") return new UnavailableLeaderboardAdapter();
  try {
    if (new URL(url).protocol !== "https:") return new UnavailableLeaderboardAdapter();
  } catch {
    return new UnavailableLeaderboardAdapter();
  }
  return new SupabaseLeaderboardAdapter(createSupabaseAuthClient(url, key));
}

export function createLeaderboardService(): LeaderboardService {
  return new LeaderboardService(createLeaderboardPort());
}
