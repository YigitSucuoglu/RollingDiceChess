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
