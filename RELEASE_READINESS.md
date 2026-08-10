# RouletteChess Public Beta Readiness

Audit date: 2026-08-10
Application version: v0.11.7  
Scope: existing single-player web experience

## Executive assessment

No P0 blocker was reproduced. RELEASE-01A storage and keyboard fixes remain healthy. RELEASE-01B added a small release-critical browser matrix without duplicating the full Chromium suite. Real installed Chrome and Edge passed; Android Chromium device-profile emulation passed. Firefox, WebKit/iPhone emulation, and physical devices are not marked PASS because their engines/devices were not available locally. Limited Chromium-family beta remains reasonable; broader beta still has a manual/browser-engine qualification gate.

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
| P1 — fixed | Home exposed stale hard-coded version `v0.8.8`, making the public build look unfinished and disagree with release metadata. | Open Home and inspect the footer. | Footer now renders build-derived `__APP_VERSION__`. |
| P2 | Firefox and WebKit binaries could not be downloaded locally because the corporate TLS chain rejected Playwright CDN certificates. | `npx playwright install firefox webkit` → `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`. | Keep official CI installation; do not disable TLS validation. CI and physical results remain pending until actually executed. |
| P2 | Result modal uses a `100vh`-based maximum height. It is scrollable, but dynamic iOS address-bar behavior is not physically qualified. | Open a completed game on iPhone Safari and expand/collapse browser chrome. | Verify on physical iPhone before broader beta; only add `100dvh` fallback after reproduction. |

## Qualification matrix

### RELEASE-01C disposition (supersedes the performance/dependency rows above)

- **Fixed:** Runtime Gold pieces and the Game machine/lever now use deterministic alpha-preserving WebP derivatives. Master PNGs remain source-only; production gzip output fell from 9,696.6 KiB to 1,319.9 KiB.
- **Fixed:** Router-native lazy routes reduce Home initial JS from 157.7 KiB to 132.9 KiB gzip and remove the >500 KiB initial chunk warning.
- **Fixed:** `react-router-dom`/`react-router` 7.18.2 closes the previously tracked RSC advisory; `npm audit --omit=dev` reports zero vulnerabilities.
- **Hardened:** Result modal now has a progressive `100dvh` maximum-height override after its `100vh` fallback. Physical iPhone Safari verification remains open.
- **CSP decision:** Existing restrictive security headers remain. Enforcement was not added without a credentialed Sentry preview test; the future policy must permit the configured Sentry ingestion host and current inline style attributes. An unverified report-only header without a reporting endpoint would add noise without evidence.
- **Observability:** Normal local production builds still exclude public source maps and the verification route. Credentialed Vercel builds retain hidden source-map upload/deletion behavior. No live verification event was sent.

`GAME-ASSET-PERF-01` and `PERF-03` are subsumed by RELEASE-01C. `AI-PERF-01`, `RENDER-PERF-01`, production audio, Firefox/WebKit CI observation, and physical iPhone/Safari qualification remain open.

| Environment | Automated | Physical | Status | Notes |
|---|---|---|---|---|
| Google Chrome 151 / Windows | Real installed browser | No | PASS | Release-critical journey, routes, refresh, storage fallback, console/network guards. |
| Microsoft Edge / Windows | Real installed browser | No | PASS | Same qualification run with explicit installed Edge executable. |
| Playwright Chromium CI | Configured | No | AUTOMATED ONLY | Existing full suite remains in CI. |
| Firefox | Configured | No | NOT TESTED | Local browser absent; Playwright download blocked by corporate TLS. Official CI job is prepared but not yet observed. |
| WebKit desktop profile | Configured | No | NOT TESTED | Playwright engine unavailable locally; not equivalent to macOS Safari. |
| Pixel 5 / Android Chromium profile | Device-profile emulation | No | PASS (AUTOMATED ONLY) | Touch activation, game journey, routing, storage fallback, overflow. Not a physical Android result. |
| iPhone 13 / WebKit profile | Device-profile emulation configured | No | NOT TESTED | Requires Playwright WebKit binary; not a physical iPhone result. |
| Physical Android + Chrome | No | Not run | NOT TESTED | Manual gate. |
| Physical iPhone + Safari | No | Not run | NOT TESTED | Manual gate. |
| Physical macOS + Safari | No | Not run | NOT TESTED | Manual gate. |

## Coverage levels

- **Automated real engine:** installed Chrome and Edge were actually launched locally.
- **Viewport emulation:** existing 360×800, 390×844, 412×915, 768×1024, and 844×390 tests resize Chromium only.
- **Device-profile emulation:** Pixel 5 passed with touch/mobile context; iPhone 13 is configured but was not executable locally.
- **Physical device:** no phone, tablet, or macOS device was tested in this task.

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
- [ ] Observe a green official CI run for Firefox and WebKit qualification.
- [ ] Run physical-device qualification on Safari/iOS Safari and Android Chrome.
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

### Physical phone procedure

For each Android Chrome and iPhone Safari target, record browser/OS/device and mark every line PASS or FAIL:

1. Clear site data, cold-open the deployed HTTPS URL, and confirm Home assets/text/version render.
2. Open Play, scroll from the top to Start Game, and confirm no horizontal page movement.
3. Start Game on a normal network, then repeat once with network throttling; confirm loading/recovery UI.
4. Tap Roll, verify lever/reels resolve, clock starts, and no double activation occurs.
5. Select and move three deterministic legal Pawn moves; verify dots, board fit, bot turn, and human return.
6. Rotate portrait → landscape → portrait during Setup and Game; confirm controls remain reachable and state survives.
7. Collapse/expand the mobile address bar; inspect board, loading overlay, result dialog, and bottom actions.
8. Open/close Move History, Settings reset dialog, and result dialog; confirm scroll and touch targets.
9. Switch English ↔ Turkish and revisit Setup, loading/error, Game, result, Settings, Profile, and How to Play.
10. Refresh `/game`, use Back/Forward, open a direct public route, and verify unknown routes recover to Home.
11. Complete a timeout or king capture, then test Play Again and Main Menu.
12. Record console/network observations through remote debugging if available; do not mark PASS if critical requests fail.

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
| Home meaningful UI | 230.8 ms |
| Setup → board | 223.7 ms |
| Roll → spinning | 86.3 ms |
| Roll → resolved | 1412.9 ms |
| Selection → hints | 66.4 ms |
| Move commit | 46.7 ms |
| JavaScript | 504.2 KiB raw / 157.7 KiB gzip |
| CSS | 56.9 KiB raw / 11.9 KiB gzip |

Known debt remains `GAME-ASSET-PERF-01`, `PERF-03`, `AI-PERF-01`, and `RENDER-PERF-01`.

## Recommended next task

`RELEASE-01C — Complete browser-engine and physical-device qualification`
