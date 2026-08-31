import { describe, expect, it } from "vitest";

import { resolveMultiplayerDevProxyTarget } from "../../scripts/multiplayer-dev-proxy";

describe("multiplayer development API proxy", () => {
  it("defaults Vite development to the deployed trusted authority origin", () => {
    expect(resolveMultiplayerDevProxyTarget()).toBe("https://roulettechess.vercel.app");
  });

  it("accepts an explicit secure authority origin without leaking a path into routing", () => {
    expect(resolveMultiplayerDevProxyTarget(" https://example.vercel.app "))
      .toBe("https://example.vercel.app");
  });

  it("allows a local trusted runtime but rejects insecure remote and path targets", () => {
    expect(resolveMultiplayerDevProxyTarget("http://127.0.0.1:3000"))
      .toBe("http://127.0.0.1:3000");
    expect(() => resolveMultiplayerDevProxyTarget("http://example.com")).toThrow(/HTTPS/u);
    expect(() => resolveMultiplayerDevProxyTarget("https://example.com/api")).toThrow(/origin/u);
  });
});
