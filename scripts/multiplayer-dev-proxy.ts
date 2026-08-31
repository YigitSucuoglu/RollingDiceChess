const DEFAULT_MULTIPLAYER_API_ORIGIN = "https://roulettechess.vercel.app";

export function resolveMultiplayerDevProxyTarget(configuredTarget?: string): string {
  const candidate = configuredTarget?.trim() || DEFAULT_MULTIPLAYER_API_ORIGIN;
  const target = new URL(candidate);
  const localHttp = target.protocol === "http:"
    && (target.hostname === "localhost" || target.hostname === "127.0.0.1");

  if (target.protocol !== "https:" && !localHttp) {
    throw new Error("MULTIPLAYER_API_PROXY_TARGET must use HTTPS, except for a localhost target.");
  }
  if (target.username || target.password || target.search || target.hash || target.pathname !== "/") {
    throw new Error("MULTIPLAYER_API_PROXY_TARGET must be an origin without credentials, path, query, or hash.");
  }

  return target.origin;
}
