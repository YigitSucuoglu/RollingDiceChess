import type { AuthenticationPort } from "../application/auth/AuthenticationPort";
import { GuestAuthenticationAdapter } from "../infrastructure/auth/GuestAuthenticationAdapter";
import ConfiguredAuthentication from "./ConfiguredAuthentication";

export function createAuthentication(): AuthenticationPort {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  const validUrl = (() => {
    try {
      return Boolean(url && new URL(url).protocol === "https:");
    } catch {
      return false;
    }
  })();
  if (validUrl && url && publishableKey && typeof window !== "undefined") {
    let storage: Storage | undefined;
    try {
      storage = window.localStorage;
    } catch {
      storage = undefined;
    }
    return new ConfiguredAuthentication({
      origin: window.location.origin,
      publishableKey,
      storage,
      url,
    });
  }
  return new GuestAuthenticationAdapter();
}

const authentication = createAuthentication();

export default authentication;
