import type { MultiplayerMatchPort } from "../application/multiplayer/MultiplayerMatchPort";
import { createSupabaseAuthClient } from "../infrastructure/auth/createSupabaseAuthClient";
import { SupabaseMultiplayerMatchAdapter } from "../infrastructure/multiplayer/SupabaseMultiplayerMatchAdapter";
import { E2EMultiplayerMatchAdapter } from "../infrastructure/testing/E2EMultiplayerMatchAdapter";

let matchPort: MultiplayerMatchPort | null = null;

export function getMultiplayerMatchPort(): MultiplayerMatchPort {
  if (matchPort) return matchPort;
  if (import.meta.env.MODE === "e2e") {
    matchPort = new E2EMultiplayerMatchAdapter();
    return matchPort;
  }
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) throw new Error("Multiplayer is not configured.");
  matchPort = new SupabaseMultiplayerMatchAdapter(createSupabaseAuthClient(url, key));
  return matchPort;
}
