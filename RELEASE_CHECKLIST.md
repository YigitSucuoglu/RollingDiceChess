# RouletteChess v0.11.7 Release Candidate Checklist

Qualified baseline: `main` at `6f97b43ff1c16ac44ef84bfb7ab6ff577a12a073`, plus the uncommitted RELEASE-01D checklist and E2E worker-cap changes listed by `git diff`.

Release recommendation: **CONDITIONAL GO**. Local Chromium, Edge and Android-emulated qualification is healthy. Public exposure still requires a green GitHub Quality workflow, including Firefox/WebKit, and successful production deployment smoke. Physical iPhone/Safari and Android remain accepted, explicitly untested beta gaps.

## Post-commit and push gates

- [ ] Review `git diff` and commit only RELEASE-01D changes.
- [ ] Push `main`; record the resulting full Git SHA as the RC identifier.
- [ ] Confirm GitHub **Validate release quality** is green.
- [ ] Confirm GitHub **Chromium browser regression** is green.
- [ ] Confirm GitHub **Cross-browser beta qualification** is green for Chromium, Firefox, WebKit, Android Chromium emulation and iPhone/WebKit emulation.
- [ ] Confirm Vercel production deployment is `Ready` and its Git SHA equals the RC SHA.
- [ ] Cold-open Home; verify branding, `v0.11.7`, images and navigation.
- [ ] Open Setup; change color, difficulty, Piece Set and board theme; start a game.
- [ ] Verify loading/recovery, Roll, lever/reels, clock, legal moves, rights, bot return and Move History.
- [ ] Smoke Profile, Settings, How to Play, direct route refresh, Back/Forward and unknown-route recovery.
- [ ] Check 390×844 or a real mobile browser for overflow and reachable Start Game/Game controls.
- [ ] Check production console/network for page errors, unhandled rejection, chunk/asset 404/403 and unexpected Sentry failures.
- [ ] Confirm Sentry release/environment match the deployment and no new release-wide issue is rising.
- [ ] Confirm guessed source-map URLs and `/__observability-test` do not expose production content.
- [ ] Identify and record the last known-good Vercel deployment before exposure.
- [ ] Accept the known limitations below and record the final public-beta decision.

Do not mark the public beta launched until every non-physical gate above is complete.

## Rollback procedure

1. Record the affected Vercel deployment URL, release SHA, time window, route/browser and Sentry issue links without copying private event data.
2. Identify the last known-good Git SHA and its successful Vercel deployment.
3. For a release-wide P0/P1, use Vercel's rollback/promote capability to restore that known-good deployment first; do not rebuild an unknown working tree.
4. Prefer a Git revert when the bad change must be removed from branch history and a corrected deployment produced. Prefer patch-forward only for an isolated, understood, low-risk defect.
5. After rollback, repeat Home → Setup → Game smoke and confirm Sentry error rate returns to baseline for the restored release.
6. RouletteChess is currently client-only and stores profile/settings locally, so deployment rollback has no database migration rollback and should not erase client data. This assumption becomes invalid once authentication, multiplayer or persistent backend data exists.

## Beta incident quick check

1. Confirm Vercel deployment status and the serving release SHA.
2. Check privacy-scrubbed Sentry Issues for release/environment correlation.
3. Reproduce the reported route, browser and viewport; distinguish asset/chunk/network failure from application failure.
4. Check production console and failed requests without requesting user secrets or localStorage contents.
5. Roll back immediately for a reproducible release-wide crash, blank page, data loss or security exposure.
6. Patch forward only when impact is isolated, root cause is known and the focused plus full release gates pass.
7. Record resolution, affected release, verification evidence and follow-up owner.

## Public beta known limitations

- Single-player bot experience only; no multiplayer, lobby or matchmaking.
- No account, authentication or cloud sync; profile/settings are browser-local.
- Physical iPhone/Safari and physical Android are **NOT TESTED**; emulation is not physical qualification.
- Production audio assets are intentionally absent; sound architecture remains a safe no-op.
- Enforcing Content Security Policy is pending credentialed Sentry/OAuth/WebSocket-compatible validation.
- RouletteChess intentionally does not implement classical check, checkmate, stalemate or draw rules; king capture/timeout are the supported terminal rules.
- Direct `/game` navigation creates the established default local match.
