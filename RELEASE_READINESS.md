# RouletteChess Public Beta Readiness

Audit date: 2026-08-07  
Application version: v0.11.7  
Scope: existing single-player web experience

## Executive assessment

No P0 blocker was reproduced. One P1 resilience issue and one P1 keyboard-access issue were fixed with regression coverage: blocked browser storage could break profile persistence, and board squares could not be activated from the keyboard. The automated Chromium release path is healthy. Public beta deployment is reasonable after the normal preview deployment check, but real Safari, Firefox, iOS Safari, and Android Chrome qualification remains the next release task.

## Findings

| Priority | Problem and user impact | Reproduction / affected area | Action |
|---|---|---|---|
| P1 — fixed | Profile storage reads/writes could throw `SecurityError` or quota errors, potentially breaking Profile, match completion, or reset. | Block `window.localStorage`, then open Profile/Game or save/reset progress. | Repository now falls back on storage access and treats persistence failure as non-fatal; script and browser regressions added. |
| P1 — fixed | Board squares were pointer-only, preventing keyboard users from selecting or moving pieces. | Complete Roll, focus a square, attempt Enter/Space. | Squares now expose a localized accessible name, keyboard activation, semantic button role, and visible focus. |
| P2 | Gold pieces and the game machine dominate transfer size; cold-start failure recovery works, but slow connections remain expensive. | Clear cache and start the first game on a throttled connection. | Keep `GAME-ASSET-PERF-01`; do not convert assets in this audit. |
| P2 | Production JS is slightly above the configured 500 KiB warning threshold. | Production build. | Measure route-level lazy loading under `PERF-03`; avoid speculative splitting here. |
| P2 | `npm audit` reports the React Router RSC action CSRF advisory. RouletteChess is a client-side SPA and does not enable RSC/server actions, so the vulnerable path is not reachable in the current deployment. The suggested forced resolution is not an acceptable safe fix. | `npm audit --omit=dev`; dependency chain is `react-router-dom` → `react-router`. | Track upstream and upgrade when a supported non-breaking release resolves the advisory; do not downgrade/force. |
| P2 | Production sound assets remain intentionally absent, so sound controls currently use the preserved no-op architecture. | Enable Sound Effects and play representative flows. | Keep `SOUND-01B` as planned production-content work. |
| P3 | Direct `/game` navigation creates the established default local match rather than returning to Setup. It is recoverable and functional, but bypasses explicit setup selection. | Open or refresh `/game` in a fresh tab. | Retain for beta; reconsider only if product policy requires mandatory setup. |

## Public beta checklist

- [x] Home, Setup, loading, retry, Game, Roll, move, bot, clock, history, result infrastructure, and navigation are covered by automated checks.
- [x] Unknown paths and disabled observability route return Home.
- [x] Direct public routes render and refresh through the Vercel SPA rewrite.
- [x] Critical asset failure exposes Retry and Back to Setup.
- [x] Malformed, missing, obsolete, and unavailable storage paths degrade to targeted defaults.
- [x] Error Boundary provides Try Again and Home without exposing stack traces.
- [x] EN/TR resource parity is checked automatically.
- [x] Normal production output excludes source maps and the observability verification chunk.
- [x] Console errors, page errors, unhandled failed requests, and accidental monitoring traffic are guarded in E2E.
- [x] No committed credential value or private-key marker was found by the repository scan.
- [ ] Run real-device/cross-browser qualification on Safari, Firefox, iOS Safari, and Android Chrome.
- [ ] Reconfirm deployed Sentry ingestion after release without enabling the verification route in production.

## Manual checks before deployment

1. Use a fresh browser profile and complete Home → Play → Start Game → Roll → multi-move turn → bot turn.
2. Throttle the network before Start Game; verify the loading status is announced and controls remain unavailable until assets finish.
3. Block one critical machine asset; verify Retry and Back to Setup, then restore the request and retry.
4. Test 360×800, 390×844, 412×915, 768×1024, 844×390, and 1440×900 for horizontal overflow and reachable controls.
5. Complete a timeout and king capture; verify result focus starts on Play Again and remains trapped in the dialog.
6. Use only keyboard input for Roll, square selection, move execution, history, result, and navigation.
7. Toggle reduced motion at OS/browser level and verify roulette/lever/XP behavior remains functional.
8. Switch EN/TR and inspect Setup, loading/error, Game, skip, result, Settings, Profile, and How to Play.

## Deployment and rollback

- Deploy from a clean, validated revision with Vercel production environment values reviewed.
- Sentry upload credentials remain build-only; only `VITE_SENTRY_DSN` is intentionally public client configuration.
- Confirm build logs show source-map upload and deletion when credentials are configured; guessed `*.js.map` URLs must return 404.
- Keep `VITE_OBSERVABILITY_TEST_MODE` absent or not exactly `true` in production.
- Run deployed smoke tests against the preview URL before promotion.
- If critical navigation, asset loading, or gameplay errors rise after promotion, roll back to the previous known-good Vercel deployment and inspect privacy-scrubbed Sentry events.

## Performance baseline

System Chrome 151 baseline from this audit:

| Measurement | Result |
|---|---:|
| Home meaningful UI | 251.0 ms |
| Setup → board | 235.6 ms |
| Roll → spinning | 65.5 ms |
| Roll → resolved | 1378.8 ms |
| Selection → hints | 58.9 ms |
| Move commit | 43.0 ms |
| JavaScript | 504.2 KiB raw / 157.7 KiB gzip |
| CSS | 56.9 KiB raw / 11.9 KiB gzip |

Known debt remains `GAME-ASSET-PERF-01`, `PERF-03`, `AI-PERF-01`, and `RENDER-PERF-01`.

## Recommended next task

`RELEASE-01B — Cross-browser and real-device beta qualification`
