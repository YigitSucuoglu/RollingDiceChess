# Observability

RouletteChess uses a privacy-safe observability boundary that is ready for Sentry but remains fully disabled unless both conditions are true: the app is a production build and `VITE_SENTRY_DSN` is configured. Monitoring failures never block rendering, navigation, or gameplay.

## Runtime architecture

- `src/observability/Observability.ts` is the only runtime gateway for initialization, capture, route context, and flushing.
- `AppErrorBoundary` catches unrecoverable React render errors and offers localized **Try Again** and **Back to Home** actions. It does not clear local storage or profile state.
- Sentry's default global handlers own uncaught errors and unhandled promise rejections. The app does not register duplicate window listeners.
- Only the final, user-blocking critical game asset preload failure is reported. Background warming failures remain silent.

## Environment variables

Runtime (public build-time value):

- `VITE_SENTRY_DSN`: optional public DSN. Empty means no-op.
- `VITE_DEPLOY_ENV`: optional environment label such as `preview` or `production`.

Build only (secret values; never use the `VITE_` prefix):

- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`

Copy `.env.example` for local development. Never commit populated `.env` files or expose the auth token to client code.

## Releases and source maps

The release name is derived from `PROJECT_STATUS.md` and, when available, `VERCEL_GIT_COMMIT_SHA` or `GITHUB_SHA`. Hidden source maps are generated only when all three build credentials exist. The Sentry Vite plugin uploads them and deletes `dist/**/*.map` afterward. Without complete credentials, sourcemaps and the upload plugin are both disabled, so ordinary local/CI output contains no public maps.

## Privacy policy

Events are allowlisted and scrubbed before transport:

- query strings and URL fragments are removed;
- user, arbitrary `extra`, request headers, cookies, and request bodies are removed;
- profile/localStorage data, player names, email addresses, and game-state payloads are never attached;
- console, click, fetch, and XHR breadcrumbs are dropped;
- navigation breadcrumbs retain pathname-only transitions;
- only release, deployment environment, language, route, area, operation, and React component stack metadata are allowed.

Before public beta, add a user-facing privacy notice documenting production error monitoring and the categories above (`PRIVACY-01`).
That notice should identify the provider, technical-data categories, purpose, retention approach, and user contact/rights, without implying that gameplay or profile telemetry is collected.

During OBS-01B, review Sentry's dashboard privacy controls: keep default data scrubbing enabled, disable or scrub IP storage where available, add future authentication/profile field names to the sensitive-field list, and keep public issue sharing disabled unless it is intentionally required. These account settings have not yet been applied or verified.

## Verification and troubleshooting

- Unit tests exercise DSN no-op behavior, scrubbing, SDK-failure isolation, localization, retry, and home navigation without sending network traffic.
- Browser navigation tests assert that a normal build without a DSN makes no Sentry/ingest request.
- `npm run test:release-smoke` rejects public `.map` files.
- To test a live event, wait for OBS-01B and use a dedicated non-production Sentry project. Do not add a crash route to production.
- If authenticated sourcemap upload fails, confirm all three build credentials, release permissions, and the Sentry CLI installation before deploying. A failed upload must not be worked around by publishing map files.

## OBS-01B live verification

The source contains a controlled diagnostic page at `/__observability-test`. It is added to the route tree only when the build-time value `VITE_OBSERVABILITY_TEST_MODE` is exactly `true`; an absent value, `false`, `TRUE`, or `1` leaves the route unavailable. It has no navigation link, reads no user input or storage, and uses the centralized observability API.

Vite embeds this value during the build. Changing it in Vercel does nothing to an existing deployment, so every enable/disable action requires a new deployment.

### Temporary Vercel lifecycle

1. Add `VITE_OBSERVABILITY_TEST_MODE=true` to **Production only** for one controlled deployment.
2. Redeploy and record the deployment commit SHA and release shown in the build log.
3. Open `https://roulettechess.vercel.app/__observability-test` directly. Do not publish this URL.
4. Select **Send handled test exception** once. The local confirmation means capture was requested; it does not query Sentry or prove delivery.
5. Select **Trigger Error Boundary**. Confirm the localized RouletteChess fatal fallback replaces the page.
6. Verify **Back to Home** returns to `/` without erasing profile, settings, XP, or language. **Try Again** may immediately show the fallback again because the intentionally failing component remains mounted.
7. Complete the Sentry inspection below.
8. Remove `VITE_OBSERVABILITY_TEST_MODE` from Vercel Production and redeploy.
9. Confirm `/__observability-test` no longer shows the verification page.

### Sentry issue and source-map inspection

1. Open Sentry → `javascript-react` → **Issues**.
2. Find `RouletteChess OBS-01B handled verification error`, refreshing if required.
3. Confirm its timestamp matches the click, environment is `production`, route is `/__observability-test`, operation is `obs-01b-handled-verification`, and release matches the deployed `roulettechess@0.11.5+<commit-sha>` value.
4. Find the distinct `RouletteChess OBS-01B boundary verification error` issue.
5. Confirm the stack resolves to `src/observability/ObservabilityVerificationPage.tsx`, the named `BoundaryVerificationFailure` component, and the original throw line or nearby source—not only `index-<hash>.js` line 1.
6. Confirm the boundary event contains a React component stack and uses the same release/environment.

### Event privacy inspection

Must be present:

- exception type and deterministic message;
- pathname-only route;
- release and environment;
- safe area/operation tags;
- React component stack for the boundary event;
- ordinary browser/platform metadata supplied by the SDK.

Must not be present:

- display name, email, Sentry user object, XP, or profile statistics;
- LocalStorage/sessionStorage values;
- board/game state, move history, roulette results, or match identifiers;
- cookies, authorization headers, request bodies, or form contents;
- query parameters or URL fragments.

In Sentry project settings, manually confirm default data scrubbing is enabled, IP storage is disabled or scrubbed where supported, public issue sharing is disabled, and Replay, Tracing, Logs, and profiling remain disabled. Any SDK/platform-generated IP or geo value is a dashboard privacy setting to correct; it is not application-provided context. These checks cannot be completed from the repository and must not be considered verified until inspected in Sentry.

### Public source-map check

After both the enabled verification deployment and final disabled deployment, request a guessed map URL corresponding to the deployed `index-<hash>.js.map` and confirm it returns 404. The build log should show artifact-bundle upload followed by map deletion, and must never print `SENTRY_AUTH_TOKEN`.

### Rollback and cleanup

If the verification deployment behaves unexpectedly, immediately remove the temporary flag and redeploy the last known-good commit. The diagnostic component is intentionally retained behind the exact build flag for future controlled checks; when disabled, its conditional lazy-import branch and route are removed from the normal production bundle. A later cleanup may delete `ObservabilityVerificationPage.tsx/.css`, its conditional route block, `VITE_OBSERVABILITY_TEST_MODE` declarations, and the dedicated tests without touching the core observability architecture.
