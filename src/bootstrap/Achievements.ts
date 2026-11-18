import { AchievementReadError, AchievementReadService, type AchievementReadPort } from "../application/achievements/AchievementRead";
import { createSupabaseAuthClient } from "../infrastructure/auth/createSupabaseAuthClient";
import { SupabaseAchievementReadAdapter } from "../infrastructure/achievements/SupabaseAchievementReadAdapter";
import { E2EAchievementReadAdapter } from "../infrastructure/testing/E2EAchievementReadAdapter";

export function createAchievementReadService(): AchievementReadService {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  let port: AchievementReadPort = { fetchCurrent: () => Promise.reject(new AchievementReadError("unavailable")) };
  if (import.meta.env.MODE === "e2e") {
    port = new E2EAchievementReadAdapter();
  }
  if (import.meta.env.MODE !== "e2e" && url && key && typeof window !== "undefined") {
    try {
      if (new URL(url).protocol === "https:") {
        port = new SupabaseAchievementReadAdapter(createSupabaseAuthClient(url, key));
      }
    } catch { /* Invalid configuration remains unavailable. */ }
  }
  return new AchievementReadService(port);
}
