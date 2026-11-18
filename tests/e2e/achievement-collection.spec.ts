import { expect, test } from "./fixtures";

const fixtureKey = "roulettechess.e2e-achievement-fixture.v1";
async function installAchievementFixture(page: import("@playwright/test").Page, value: string) {
  await page.addInitScript(({ key, selection }) => {
    localStorage.setItem("roulettechess.e2e-auth-fixture.v1", "account");
    localStorage.setItem(key, selection);
  }, { key: fixtureKey, selection: value });
}

test("desktop collection pages by four and filters to 7/6/6/3/8", async ({ page, assertNoErrors }) => {
  await installAchievementFixture(page, "empty");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/profile");
  const section = page.getByRole("region", { name: "Achievement cards" });
  await expect(section).toHaveCSS("scrollbar-width", "none");
  expect(await section.evaluate((element) => getComputedStyle(element, "::-webkit-scrollbar").display)).toBe("none");
  await expect(section.locator(".achievement-collection-card")).toHaveCount(30);
  await expect(page.getByText("1–4 / 30")).toBeVisible();
  expect(await section.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return [...element.querySelectorAll(".achievement-collection-card")].filter((card) => {
      const rect = card.getBoundingClientRect();
      return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
    }).length;
  })).toBe(4);
  await expect(page.getByRole("button", { name: "Previous achievements" })).toBeDisabled();
  await page.getByRole("button", { name: "Next achievements" }).click();
  await expect(page.getByText("5–8 / 30")).toBeVisible();
  await expect.poll(() => section.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await section.focus();
  await section.press("ArrowLeft");
  await expect(page.getByText("1–4 / 30")).toBeVisible();
  for (const [label, count] of [["Singleplayer", 7], ["Ranked", 6], ["Roulette", 6], ["Piece Mastery", 3], ["Challenges", 8]] as const) {
    await page.getByRole("button", { name: new RegExp(`^${label} ${count}$`) }).click();
    await expect(section.locator(".achievement-collection-card")).toHaveCount(count);
    await expect(page.getByText(`1–${Math.min(4, count)} / ${count}`)).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Next achievements" })).toBeEnabled();
  await page.getByRole("button", { name: /^Piece Mastery 3$/ }).click();
  await expect(page.getByRole("button", { name: "Next achievements" })).toBeDisabled();
  await page.getByRole("button", { name: /^Singleplayer 7$/ }).click();
  await page.getByRole("button", { name: "Next achievements" }).click();
  await expect(page.getByText("5–7 / 7")).toBeVisible();
  await expect(page.getByRole("button", { name: "Next achievements" })).toBeDisabled();
  await page.getByRole("button", { name: /^Ranked 6$/ }).click();
  await page.getByRole("button", { name: "Next achievements" }).click();
  await expect(page.getByText("5–6 / 6")).toBeVisible();
  await page.getByRole("button", { name: /^Challenges 8$/ }).click();
  await page.getByRole("button", { name: "Next achievements" }).click();
  await expect(page.getByText("5–8 / 8")).toBeVisible();
  await page.getByRole("button", { name: /^All 30$/ }).click();
  for (let index = 0; index < 7; index += 1) await page.getByRole("button", { name: "Next achievements" }).click();
  await expect(page.getByText("29–30 / 30")).toBeVisible();
  await expect(page.getByRole("button", { name: "Next achievements" })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  assertNoErrors();
});

test("unlocks use server dates and locked challenge does not disclose its condition", async ({ page, assertNoErrors }) => {
  await installAchievementFixture(page, "unlocked");
  await page.goto("/profile");
  await expect(page.locator('[data-achievement-id="rookie_campaign"]')).toHaveAttribute("data-unlocked", "true");
  await expect(page.locator('[data-achievement-id="rookie_campaign"] time')).toHaveAttribute("dateTime", "2026-11-17T12:00:00+00:00");
  await page.getByRole("button", { name: /^Challenges 8$/ }).click();
  await expect(page.locator('[data-achievement-id="untouchable"]')).toHaveAttribute("data-unlocked", "true");
  await expect(page.locator('[data-achievement-id="against_all_odds"]')).not.toContainText(/no more than three|three of your pieces/i);
  await expect(page.locator('[data-achievement-id="against_all_odds"]')).toContainText("Secret Challenge");
  assertNoErrors();
});

test("completed cards cap progress while keeping canonical lifetime totals separate", async ({ page, assertNoErrors }) => {
  await installAchievementFixture(page, "completed");
  await page.goto("/profile");
  const ranked = page.locator('[data-achievement-id="ranked_victor"]');
  const pawn = page.locator('[data-achievement-id="pawn_commander"]');
  await expect(ranked).toHaveAttribute("data-unlocked", "true");
  await expect(ranked).toContainText("1/1");
  await expect(ranked).toContainText("Total ranked wins");
  await expect(ranked.locator(".achievement-collection-total strong")).toHaveText("4");
  await expect(ranked.locator("time")).toHaveAttribute("dateTime", "2026-11-17T12:00:00+00:00");
  await expect(ranked.locator(".achievement-collection-state")).toHaveCount(0);
  await expect(pawn).toContainText("500/500");
  await expect(pawn).toContainText("Recorded pawn moves");
  await expect(pawn.locator(".achievement-collection-total strong")).toHaveText("84");
  await expect(page.locator('[data-achievement-id="untouchable"] .achievement-collection-progress')).toHaveCount(0);
  await expect(page.locator('[data-achievement-id="rookie_campaign"]')).toHaveAttribute("data-unlocked", "false");
  assertNoErrors();
});

test("mobile arrows animate real horizontal scroll and share one SVG geometry", async ({ page, assertNoErrors }) => {
  await installAchievementFixture(page, "empty");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/profile");
  const carousel = page.getByRole("region", { name: "Achievement cards" });
  const previous = page.getByRole("button", { name: "Previous achievements" });
  const next = page.getByRole("button", { name: "Next achievements" });
  await expect(previous).toBeDisabled();
  const paths = await page.locator(".achievement-collection-controls svg").evaluateAll((icons) => icons.map((icon) => ({
    viewBox: icon.getAttribute("viewBox"), width: icon.getBoundingClientRect().width,
    height: icon.getBoundingClientRect().height, stroke: icon.querySelector("path")?.getAttribute("stroke-width"),
  })));
  expect(paths[0]).toEqual(paths[1]);
  await carousel.evaluate((element) => {
    const target = element as HTMLElement & { motion?: { calls: ScrollBehavior[]; samples: number[] } };
    target.motion = { calls: [], samples: [] };
    const scrollTo = element.scrollTo.bind(element);
    element.scrollTo = (options: ScrollToOptions) => {
      target.motion!.calls.push(options.behavior ?? "auto");
      scrollTo(options);
    };
    const interval = window.setInterval(() => target.motion!.samples.push(element.scrollLeft), 8);
    window.setTimeout(() => window.clearInterval(interval), 650);
  });
  await next.click();
  await expect(page.getByText("2–2 / 30")).toBeVisible();
  const right = await carousel.evaluate((element) => (element as HTMLElement & {
    motion: { calls: ScrollBehavior[]; samples: number[] };
  }).motion);
  const target = await carousel.evaluate((element) => element.querySelector<HTMLElement>(".achievement-collection-card")!.offsetWidth +
    Number.parseFloat(getComputedStyle(element.querySelector(".achievement-collection-track")!).columnGap));
  expect(right.calls).toContain("smooth");
  expect(right.samples.some((value) => value > 1 && value < target - 1)).toBe(true);
  await previous.click();
  await expect(page.getByText("1–1 / 30")).toBeVisible();
  await next.click();
  await next.click();
  await next.click();
  await expect(page.getByText("4–4 / 30")).toBeVisible();
  await page.getByRole("button", { name: /^Ranked 6$/ }).click();
  await expect(page.getByText("1–1 / 6")).toBeVisible();
  expect(await carousel.evaluate((element) => element.scrollLeft)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  assertNoErrors();
});

test("reduced motion uses an immediate accessible carousel transition", async ({ page, assertNoErrors }) => {
  await installAchievementFixture(page, "empty");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/profile");
  const carousel = page.getByRole("region", { name: "Achievement cards" });
  await carousel.evaluate((element) => {
    const target = element as HTMLElement & { lastMotion?: ScrollBehavior };
    const scrollTo = element.scrollTo.bind(element);
    element.scrollTo = (options: ScrollToOptions) => { target.lastMotion = options.behavior; scrollTo(options); };
  });
  await page.getByRole("button", { name: "Next achievements" }).click();
  await expect(page.getByText("2–2 / 30")).toBeVisible();
  expect(await carousel.evaluate((element) => (element as HTMLElement & { lastMotion?: ScrollBehavior }).lastMotion)).toBe("instant");
  assertNoErrors();
});

test("canonical account shows only selected progress with recorded telemetry label", async ({ page, assertNoErrors }) => {
  await installAchievementFixture(page, "empty");
  await page.goto("/profile");
  await expect(page.locator(".achievement-collection-progress")).toHaveCount(15);
  await expect(page.locator('[data-achievement-id="rookie_campaign"]')).toContainText("1/10");
  await expect(page.locator('[data-achievement-id="ranked_regular"]')).toContainText("7/25");
  await expect(page.locator('[data-achievement-id="wheel_spinner"]')).toContainText("19/100");
  await expect(page.locator('[data-achievement-id="wheel_spinner"]')).toContainText("Recorded progress");
  await expect(page.locator('[data-achievement-id="knight_specialist"]')).toContainText("42/500");
  await expect(page.locator('[data-achievement-id="untouchable"] .achievement-collection-progress')).toHaveCount(0);
  assertNoErrors();
});

test("read errors retry, catalog mismatch stays safe, and local guest does not read", async ({ page, assertNoErrors }) => {
  await installAchievementFixture(page, "retry");
  await page.goto("/profile");
  await expect(page.getByRole("alert")).toContainText("Achievements could not be loaded");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("region", { name: "Achievement cards" }).locator(".achievement-collection-card")).toHaveCount(30);
  assertNoErrors();
});

test("catalog mismatch hides unlocks", async ({ page, assertNoErrors }) => {
  await installAchievementFixture(page, "mismatch");
  await page.goto("/profile");
  await expect(page.getByRole("alert")).toContainText("temporarily unavailable");
  await expect(page.locator(".achievement-collection-card")).toHaveCount(0);
  assertNoErrors();
});

test("local-only Guest makes no achievement request", async ({ page, assertNoErrors }) => {
  await page.addInitScript(() => localStorage.setItem("roulettechess.e2e-auth-fixture.v1", "local"));
  await page.goto("/profile");
  await expect(page.getByText("Cloud achievements are unavailable in local-only Guest mode.")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("roulettechess.e2e-achievement-request-count.v1"))).toBeNull();
  assertNoErrors();
});

test("mobile and tablet collection stay horizontally contained", async ({ page, assertNoErrors }) => {
  await installAchievementFixture(page, "empty");
  for (const [width, height, end] of [[390, 844, 1], [768, 1024, 2], [1024, 768, 3]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/profile");
    await expect(page.getByRole("region", { name: "Achievement cards" })).toHaveCSS("scrollbar-width", "none");
    await expect(page.getByText(`1–${end} / 30`)).toBeVisible();
    if (width === 390) {
      const carousel = page.getByRole("region", { name: "Achievement cards" });
      await carousel.dispatchEvent("pointerdown");
      await carousel.evaluate((element) => element.scrollTo({ left: element.clientWidth, behavior: "instant" }));
      await expect(page.getByText("2–2 / 30")).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  assertNoErrors();
});
