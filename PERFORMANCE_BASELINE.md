# RouletteChess Production Performance Baseline

## Test environment

- Measurement date: 2026-08-03
- OS: corporate Windows workstation
- Node: v24.18.0
- Browser: system Google Chrome 151.0.7922.71
- Browser override: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`
- Build: Vite production build, no source maps, localhost Vite preview

These values describe this machine and a single Lighthouse run per profile. They are comparison baselines, not universal user timings. CI hardware and Lighthouse throttling can vary.

## Production bundle

After the low-risk registry cleanup, `dist` contains 20 files: 12.93 MiB raw, 12.52 MiB gzip and 12.49 MiB Brotli. Images account for 12.48 MiB raw / 12.39 MiB gzip. The single JavaScript chunk is 396.2 KiB raw / 118.8 KiB gzip; CSS is 54.3 KiB raw / 11.4 KiB gzip. There is one 9.3 KiB SVG favicon output and no source maps.

The largest output files are:

1. Home machine: 2.12 MiB.
2. Home lever: 1.89 MiB.
3. Game machine: 1.81 MiB.
4. Gold black knight: 751 KiB.
5. Gold white knight: 688 KiB.

The source sheets (4.27 MiB and 3.19 MiB) and `src/design` references do not enter `dist`. Playwright, Vitest, Lighthouse, test helpers and sound assets do not enter production. Classic/Retro SVGs are inlined into JS/CSS rather than emitted separately.

All routes are eager imports and the build has one JS chunk. Home therefore downloads Game, How to Play, Profile and Settings code, both locale resources and every Piece Set registry import. Route lazy loading is a measured P2 opportunity; it was not introduced here because reliable per-route before/after profiling deserves a focused task.

## Before / after cleanup

`SLOT_MACHINE_ASSETS.generated` and `.symbols` had no runtime/test consumers, but their eight static imports emitted obsolete frame, lever and symbol PNGs.

| Metric | Before | After | Difference |
|---|---:|---:|---:|
| Files | 28 | 20 | -8 (-28.6%) |
| Raw dist | 16.49 MiB | 12.93 MiB | -3.56 MiB (-21.6%) |
| Gzip dist | 16.07 MiB | 12.52 MiB | -3.55 MiB (-22.1%) |
| Brotli dist | 16.02 MiB | 12.49 MiB | -3.53 MiB (-22.0%) |
| Main JS gzip | 119.0 KiB | 118.8 KiB | -0.2 KiB |

The legacy source files remain in the repository; only unused production imports/registry branches were removed. Home Lighthouse transfer stayed 5.94 MiB because those obsolete files were emitted but were not requested by Home.

## Lighthouse Home

| Profile | Score | FCP | LCP | TBT | CLS | Speed Index | Transfer |
|---|---:|---:|---:|---:|---:|---:|---:|
| Desktop | 68 | 1.55 s | 33.37 s | 23 ms | 0.000 | 1.55 s | 5.94 MiB |
| Mobile | 75 | 1.54 s | 33.36 s | 26 ms | 0.000 | 1.54 s | 5.94 MiB |

The extreme LCP contrasts with fast FCP/TBT and points to the large Home hero image being the LCP candidate and completing late. It is the highest-priority measured web-loading issue. Only Home is automated in this baseline; other routes and Game Lighthouse remain open.

## Engine and bot benchmarks

Method: deterministic IDs/boards/rights, five warm-up runs followed by 30 measured runs with `performance.now()`. Correctness and no-live-mutation assertions run outside timed samples. JIT, workstation load and antivirus can affect results.

| Resolver scenario | p50 | p95 | Max |
|---|---:|---:|---:|
| Opening pawns | 33.4 ms | 48.7 ms | 53.5 ms |
| Opening mixed | 4.7 ms | 5.3 ms | 5.4 ms |
| Duplicate knights | 1.7 ms | 2.0 ms | 2.1 ms |
| Open sliders | 44.2 ms | 50.6 ms | 54.6 ms |
| Duplicate queens | 30.7 ms | 31.5 ms | 31.7 ms |

| Planner | Sequence | p50 | p95 | Max |
|---|---:|---:|---:|---:|
| Easy | 1 | 30.8 ms | 32.1 ms | 32.9 ms |
| Medium | 1 | 31.3 ms | 32.2 ms | 32.3 ms |
| Hard | 3 | 223.7 ms | 613.7 ms | 664.9 ms |

The resolver benchmark covers representative opening, mixed, duplicate and open sliding positions. Promotion, castling, en-passant and locked-right correctness remain in QA tests; dedicated performance fixtures for every special continuation remain follow-up scope.

## Browser runtime

| Flow | Measured time |
|---|---:|
| Home navigation to meaningful heading | 131.6 ms |
| Start Game to board ready | 244.2 ms |
| ROLL to spinning state | 119.4 ms |
| ROLL to resolved state | 1430.9 ms |
| Square selection to move hints | 75.6 ms |
| Move commit UI | 38.1 ms |

Roll resolution includes intentional product timing. Browser measurements fail on console/page errors and use deterministic page-only RNG.

## React, animation and memory findings

Source review shows `Board` owns clock refresh state, so every 250 ms tick (75 ms under 15 seconds) re-renders the Board component and reconstructs 64 square elements. This is a P2 measurement target; memoization was not added without a profiler comparison. Every route is eager, but inactive route components do not render.

Lever and reel motion use transform-oriented CSS and preserve reduced motion. Result/Profile XP and notification animations have cleanup effects. No forced-layout loop was found in source review. Browser CDP frame/paint tracing was not added, so frame smoothness claims are intentionally avoided.

Game replacement disposes the old clock and aborts bot work; Board effects clear timeouts, animation frames, sound and subscriptions. No repeatable leak was observed in the short E2E flow, but heap trend/detached-node collection is not yet automated.

## Informational budgets

Budgets in `performance-baseline.json` include measured-environment tolerance and do not break the quality workflow: main JS gzip 140 KiB, total dist gzip 14.5 MB, largest image 2.4 MB, Home mobile LCP 38 s, CLS 0.02, complex resolver p95 70 ms and Hard bot p95 800 ms. LCP is deliberately a regression ceiling, not an acceptable long-term target.

## Prioritized backlog

- P1 — Home hero LCP/transfer: 33.34 s LCP and 5.94 MiB transfer. Measure responsive WebP/AVIF and preload/decode strategies without visual quality loss. Proposed task: `PERF-02 — Optimize Home hero delivery`.
- P1 — Gold/Home PNG delivery: images dominate 12.39 MiB gzip and the largest file is 2.12 MiB. Measure dimensions, alpha padding and lossless/modern formats. Proposed task: `ASSET-PERF-01`.
- P1 — Hard planner latency: opening pawn fixture p95 614 ms before artificial pacing. Profile sequence generation/evaluation without changing semantics. Proposed task: `AI-PERF-01`.
- P2 — Route code splitting: one 118.8 KiB gzip chunk contains all routes/locales. Measure React lazy route split and layout stability. Proposed task: `PERF-03`.
- P2 — Clock-driven Board renders: source structure implies up to ~13 full Board renders/sec at low time. Capture React Profiler commits, then isolate clock state if warranted. Proposed task: `RENDER-PERF-01`.
- P2 — Expand deterministic benchmark fixtures and three-run Lighthouse medians. Proposed task: `PERF-04`.
- P3 — Remove or archive obsolete source assets in a separately reviewed cleanup batch; they no longer enter the bundle.

No P0 crash, freeze or reproducible leak was found.

## Reproduce

```text
npm run perf:bundle
npm run perf:engine
npm run perf:lighthouse
npm run perf:browser
npm run perf
```

When bundled Chromium is unavailable, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to a valid Chrome/Chromium executable. Generated JSON/Markdown and raw Lighthouse JSON are written to ignored `.performance/` subfolders.

## PERF-02 Home image delivery (2026-08-04)

Home previously requested the 1536×1024 machine (2.12 MiB), 1024×1536 lever (1.89 MiB) and three 1024×1280 Gold pieces even though the maximum machine render box is 624×416. Machine was the Lighthouse LCP element. Alpha-bound analysis showed padding was part of the established coordinate system, especially for the lever, so assets were resized without cropping.

Deterministic `sharp` tooling now produces alpha-preserving WebP quality 90/alpha 100 plus optimized PNG fallbacks. Desktop machine candidates are 624×416 and 1248×832; mobile receives a 768×512 candidate. Lever candidates are 112×168/224×336 and Home-only pieces are 160×200/320×400. Master and Game assets remain unchanged.

At 1440×900/DPR1 Chrome selected the 63.1 KiB 624w machine rendered at 528×352. At 390×844/DPR2 it selected the 91.1 KiB mobile candidate rendered at 358×239. Desktop pieces total 27.3 KiB and lever WebP is inlined at 1.8 KiB. No master Home machine request or duplicate machine request occurred.

| Metric | PERF-01 before | PERF-02 after | Change |
|---|---:|---:|---:|
| Home desktop transfer | 5.94 MiB | 230 KiB | -96.2% |
| Home mobile transfer | 5.94 MiB | 314 KiB | -94.8% |
| Dist raw | 12.93 MiB | 9.85 MiB | -23.8% |
| Dist gzip | 12.52 MiB | 9.44 MiB | -24.6% |
| Largest emitted image | 2.12 MiB | 1.81 MiB (Game machine) | -14.5% |
| Desktop score / LCP | 69 / 33.34 s | 80 / 2.58 s | LCP -92.3% |
| Mobile score / LCP | 75 / 33.34 s | 95 / 2.90 s | LCP -91.3% |
| Desktop FCP / TBT / CLS | 1.53 s / 0 ms / 0 | 1.52 s / 0 ms / 0 | no regression |
| Mobile FCP / TBT / CLS | 1.53 s / 0 ms / 0 | 1.53 s / 0 ms / 0 | no regression |

Machine uses eager loading, synchronous decode, intrinsic dimensions and `fetchPriority="high"`; no preload was added, avoiding duplicate requests. Lever and pieces use asynchronous decode without lazy loading so composition remains atomic. Fixed-viewport visual inspection preserved machine, reels, lever pivot and caption alignment on desktop/mobile with no visible halo.

The baseline budgets are now 11 MB dist gzip, 150 KB main JS gzip, 2.1 MB largest emitted image, 400 KB Home initial transfer, 3.5 s Home mobile LCP and 0.02 CLS. These remain informational.

## RELEASE-01C Game asset delivery (2026-08-10)

The retained pre-change build was 10,186.4 KiB raw / 9,696.6 KiB gzip / 9,659.6 KiB Brotli. Images accounted for 9,615.4 KiB raw; the 1,813.0 KiB Game machine and twelve 400.8–750.7 KiB Gold PNGs dominated output. The single main JS file was 504.2 KiB raw / 157.7 KiB gzip.

`npm run assets:game` deterministically resizes untouched source canvases with Lanczos3 and emits WebP quality 92 / alpha quality 100. Gold runtime files are 256×320 (covering the measured maximum ~110 CSS px at 2× DPR); the Game machine is 704×394 and lever 47×256. No crop is applied, so transparent padding, alignment, reel positions, machine geometry and lever pivot remain unchanged. Source PNGs remain in `src/assets` but no longer enter `dist`.

Objective comparisons are generated in `.performance/game-assets/asset-report.json`. Across 14 derivatives, SSIM is 0.99907–0.99961 and PSNR is 29.61–34.33 dB at delivery resolution. Alpha comparison is included per asset. Representative screenshots are written to ignored `.performance/release-01c/`.

| Metric | Before | After | Delta |
|---|---:|---:|---:|
| Total dist raw | 10,186.4 KiB | 1,713.6 KiB | -83.2% |
| Total dist gzip | 9,696.6 KiB | 1,319.9 KiB | -86.4% |
| Total dist Brotli | 9,659.6 KiB | 1,296.7 KiB | -86.6% |
| Image output | 9,615.4 KiB | 1,140.7 KiB | -88.1% |
| Gold set | 6,708.3 KiB | 188.3 KiB | -97.2% |
| Game machine | 1,813.0 KiB | 101.2 KiB | -94.4% |
| Game lever | 247.9 KiB | 5.1 KiB | -97.9% |
| Largest emitted file | 1,813.0 KiB image | 400.5 KiB initial JS | -77.9% |
| Initial JS gzip | 157.7 KiB | 132.9 KiB | -15.7% |

Route-level lazy loading was applied because it removed 24.8 KiB gzip from Home's initial JS and eliminated the >500 KiB initial-chunk warning. Game/domain code remains grouped for gameplay startup. `npm run perf:cold` runs three fresh contexts for normal and Fast-4G-like profiles and records medians/min/max. The network profile is an approximation, not a carrier claim. Vite-hashed assets retain the immutable one-year Vercel asset cache; HTML remains outside that rule.

With browser cache explicitly disabled and Start Game activated immediately after Setup became usable, the three-run normal median transferred 301,678 bytes in 14 critical requests, showed Setup in 49.5 ms, showed the loading state in 35.3 ms, reached Board 122.0 ms after Start Game, and reached Board 289.5 ms after the Home Play action. The Fast-4G-like median used the same bytes/request count, showed the loading state in 35.7 ms, reached Board 1,870.6 ms after Start Game, and completed Home Play → Board in 2,792.2 ms.

The legacy single-run `perf:browser` Setup → Board probe intentionally clicks Start Game without waiting for route/background prefetch and measured 464.4 ms versus the pre-change 225.8 ms. This synthetic immediate-click metric regressed due to route chunk loading; the cold-flow tool captures the actual loading screen and concurrent preload path. The tradeoff is retained and visible here rather than hidden. Roll resolved (1,389.8 ms), selection hints (72.7 ms), and move commit (43.0 ms) remain within ordinary run variance and preserve intentional timing.

## RELEASE-01D release-candidate gate (2026-08-10)

No production feature or asset change was made. The 0.4 KiB raw / 0.2 KiB gzip bundle difference is normal minifier/metadata output from the same source inputs; image and initial chunk sizes are stable.

| Metric | RELEASE-01C | RELEASE-01D RC | Delta |
|---|---:|---:|---:|
| Total dist raw | 1,713.6 KiB | 1,714.0 KiB | +0.4 KiB |
| Total dist gzip | 1,319.9 KiB | 1,320.1 KiB | +0.2 KiB |
| Image output | 1,140.7 KiB | 1,140.7 KiB | 0 |
| Gold Piece Set | 188.3 KiB | 188.3 KiB | 0 |
| Game machine | 101.2 KiB | 101.2 KiB | 0 |
| Game lever | 5.1 KiB | 5.1 KiB | 0 |
| Initial JS gzip | 132.9 KiB | 132.9 KiB | 0 |
| Home meaningful UI | 230.7 ms | 174.5 ms | -56.2 ms |
| Setup → Board | 464.4 ms | 464.0 ms | -0.4 ms |
| Roll → spinning | 56.3 ms | 50.5 ms | -5.8 ms |
| Roll → resolved | 1,389.8 ms | 1,390.2 ms | +0.4 ms |
| Selection → hints | 72.7 ms | 64.0 ms | -8.7 ms |
| Move commit | 43.0 ms | 41.0 ms | -2.0 ms |
| Hard bot p50 / p95 | 387.6 / 435.9 ms | 480.4 / 648.0 ms | workstation variance; under 800 ms ceiling |

The browser values are single local runs and are not treated as carrier/user percentiles. Engine p95 variance was also visible in untargeted fixtures; no engine, planner or gameplay source changed between these measurements. The deterministic first-game reference remains 301,678 bytes / 14 critical requests with a 289.5 ms normal Home Play → Board median and 2,792.2 ms Fast-4G-like median.
