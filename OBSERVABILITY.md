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

## OBS-01B checklist

1. Create the project and least-privilege build token outside the repository.
2. Configure preview/production DSN and build secrets in the deployment platform.
3. verify the release identifier and uploaded artifacts in Sentry;
4. send one deliberate test-only error and confirm scrubbed payload fields;
5. verify normal navigation remains free of duplicate events and unexpected breadcrumbs.
