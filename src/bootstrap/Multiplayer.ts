import type { MultiplayerLobbyPort } from "../application/multiplayer/MultiplayerLobbyPort";
import { UnavailableMultiplayerLobbyAdapter } from "../infrastructure/multiplayer/UnavailableMultiplayerLobbyAdapter";
import { E2EMultiplayerLobbyAdapter } from "../infrastructure/testing/E2EMultiplayerLobbyAdapter";
import { createSupabaseAuthClient } from "../infrastructure/auth/createSupabaseAuthClient";
import { SupabaseMultiplayerLobbyAdapter } from "../infrastructure/multiplayer/SupabaseMultiplayerLobbyAdapter";

export function createMultiplayerLobby(): MultiplayerLobbyPort {
  if (import.meta.env.MODE === "e2e") return new E2EMultiplayerLobbyAdapter();
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key || typeof window === "undefined") return new UnavailableMultiplayerLobbyAdapter();
  try {
    if (new URL(url).protocol !== "https:") return new UnavailableMultiplayerLobbyAdapter();
  } catch {
    return new UnavailableMultiplayerLobbyAdapter();
  }
  return new SupabaseMultiplayerLobbyAdapter(createSupabaseAuthClient(url, key));
}

const multiplayerLobby = createMultiplayerLobby();
export default multiplayerLobby;
