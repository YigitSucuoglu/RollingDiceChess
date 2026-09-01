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
    const boardCss = readFileSync("src/components/Board/Board.css", "utf8");
    expect(boardCss).toContain("--multiplayer-meta-space:20px");
    expect(boardCss).toContain("+ var(--multiplayer-meta-space)");
  });

  it("keeps the live authoritative presentation connected to Board updates", () => {
    const page = readFileSync("src/pages/MultiplayerGamePage.tsx", "utf8");
    expect(page).toContain("setPresentation(createdSession.presentation)");
    expect(page).toContain("createdSession.subscribe");
    expect(page).toContain("onlinePresentation={presentation}");
  });

  it("centers a sole Game Over action while retaining a two-action grid", () => {
    const css = readFileSync("src/components/GameResultModal/GameResultModal.css", "utf8");
    expect(css).toContain("grid-template-columns:1fr 1fr");
    expect(css).toContain(".game-result-actions:has(> :only-child)");
    expect(css).toContain("justify-content:center");
  });
});
