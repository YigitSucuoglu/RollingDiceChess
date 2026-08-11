# RouletteChess v1.0.0 Release Checklist

Version: **v1.0.0**

Release type: **First official singleplayer release**

Qualification: **GO**

P0: **none**

P1: **none**

Qualified predecessor RC: `main` at `2cc7a3936b7a99c31f4cc6f7f89a2b8390a4ea69` (`v0.11.7: chore - finalize release candidate launch readiness`). The v1.0.0 release commit will contain metadata and documentation changes only and must be tagged only after its CI, deployment and production smoke pass.

Release decision: **GO** for the first official RouletteChess singleplayer release. The developer manually confirmed the GitHub release workflows, successful Vercel production deployment and production smoke for the qualified RC with no observed issue. Local Chromium, Edge and Android-emulated qualification remains healthy. Physical iPhone/Safari and Android remain accepted, explicitly untested gaps.

## Evidence status

- **PASS:** supported by local automated evidence or developer production smoke.
- **MANUALLY CONFIRMED:** external dashboard/workflow state reported by the developer; not independently queried by Codex.
- **NOT TESTED — ACCEPTED GAP:** explicitly outside available physical-device evidence for this limited beta.

## Release gate closeout

- [x] RELEASE-01D changes committed on `main` — **PASS**.
- [x] `main` pushed; RC SHA recorded above — **PASS**.
- [x] GitHub **Validate release quality** reviewed — **MANUALLY CONFIRMED** by developer.
- [x] GitHub **Chromium browser regression** reviewed — **MANUALLY CONFIRMED** by developer.
- [x] GitHub **Cross-browser beta qualification** reviewed for the configured Chromium, Firefox and WebKit matrix — **MANUALLY CONFIRMED** by developer.
- [x] Vercel production deployment completed successfully — **MANUALLY CONFIRMED** by developer.
- [x] Production smoke completed with no visible issue observed — **PASS — developer verified**.
- [x] Canonical version metadata is `v1.0.0` — **PASS** via release smoke/build metadata.
- [x] Rollback procedure and last-known-good deployment selection method are available below — **PASS**.
- [x] Known limitations and accepted physical-device gaps reviewed — **ACCEPTED**.
- [ ] Physical iPhone/Safari — **NOT TESTED — ACCEPTED GAP**.
- [ ] Physical Android — **NOT TESTED — ACCEPTED GAP**; Android Chromium emulation is PASS.
- [ ] Commit and push the v1.0.0 metadata, wait for CI and Vercel Ready, then verify production shows v1.0.0.
- [ ] Create annotated tag `v1.0.0` on that exact release commit and publish the GitHub Release.

All qualification gates required for the GO decision are closed. The tag must point to the final v1.0.0 release commit, not the older v0.11.7 RC commit.

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
- Physical iPhone/Safari and physical Android are **NOT TESTED — ACCEPTED GAP**; emulation is not physical qualification.
- Production audio assets are intentionally absent; sound architecture remains a safe no-op.
- Enforcing Content Security Policy is pending credentialed Sentry/OAuth/WebSocket-compatible validation.
- RouletteChess intentionally does not implement classical check, checkmate, stalemate or draw rules; king capture/timeout are the supported terminal rules.
- Direct `/game` navigation creates the established default local match.
