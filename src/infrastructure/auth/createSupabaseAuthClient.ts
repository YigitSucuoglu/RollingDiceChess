import { createClient } from "@supabase/supabase-js";

import type { SupabaseClient } from "@supabase/supabase-js";

interface SafeBrowserStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

let cachedClient: { readonly key: string; readonly client: SupabaseClient } | undefined;

function createSafeBrowserStorage(): SafeBrowserStorage {
  const memory = new Map<string, string>();
  return {
    getItem(key) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return memory.get(key) ?? null;
      }
    },
    removeItem(key) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        memory.delete(key);
      }
    },
    setItem(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        memory.set(key, value);
      }
    },
  };
}

export function createSupabaseAuthClient(
  url: string,
  publishableKey: string,
): SupabaseClient {
  const key = `${url}\u0000${publishableKey}`;
  if (cachedClient?.key === key) return cachedClient.client;
  const client = createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
      storage: createSafeBrowserStorage(),
    },
  });
  cachedClient = { key, client };
  return client;
}
