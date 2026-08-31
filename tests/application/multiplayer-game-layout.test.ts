import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("multiplayer game layout invariants", () => {
  it("loads the shared centered game-page layout for the multiplayer route", () => {
    const page = readFileSync("src/pages/MultiplayerGamePage.tsx", "utf8");
    const css = readFileSync("src/pages/GamePage.css", "utf8");
    expect(page).toContain('import "./GamePage.css"');
    expect(css).toContain("justify-content:center");
    expect(css).toContain(".game-page>.multiplayer-game-shell");
    expect(css).toContain("margin-inline:auto");
  });

  it("centers a sole Game Over action while retaining a two-action grid", () => {
    const css = readFileSync("src/components/GameResultModal/GameResultModal.css", "utf8");
    expect(css).toContain("grid-template-columns:1fr 1fr");
    expect(css).toContain(".game-result-actions:has(> :only-child)");
    expect(css).toContain("justify-content:center");
  });
});
