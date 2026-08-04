# RouletteChess Vercel Deployment

## Deployment model

The GitHub repository remains `RollingDiceChess`; the product and Vercel project are named `RouletteChess`. Use `roulettechess` as the Vercel project name. If unavailable, try `roulette-chess`, `roulettechess-web`, then `play-roulettechess`.

The first `main` deployment should be treated as an internet-accessible staging/test deployment until a public beta and custom domain are approved. It is not a private environment. The application currently has no account system, backend or server-side secrets; profile and preferences remain in each browser's LocalStorage.

Recommended later workflow:

```text
feature branch -> push -> Vercel preview -> GitHub Actions -> manual review -> main -> production
```

Vercel gives `main` the production domain and other branches/pull requests unique preview URLs. A separate staging branch can be introduced later, but is unnecessary for the first import.

## Manual Vercel import

1. Open the Vercel dashboard and choose **Add New -> Project**.
2. Select the GitHub repository `RollingDiceChess` and choose **Import**.
3. Set **Project Name** to `roulettechess` (or the alternatives above).
4. Use **Framework Preset: Vite** and **Root Directory: repository root**.
5. Confirm **Install Command: `npm ci`**.
6. Confirm **Build Command: `npm run build`**.
7. Confirm **Output Directory: `dist`**.
8. Select Node 24. `package.json` enforces `>=24 <25`.
9. Add no environment variables; none are currently required.
10. Choose **Deploy**, record the generated URL, then check **Settings -> Domains** and the deployment status on the GitHub commit.

The repository contains `vercel.json`, so these build values are explicit in source. Do not rename the GitHub repository as part of deployment.

## SPA, cache and security behavior

Vercel serves existing `/assets/*` and `favicon.svg` files directly. Other paths are rewritten to `index.html`, allowing `/game`, `/play`, `/profile`, `/settings` and `/how-to-play` to load or refresh without a platform 404. React Router remains responsible for application routing and its existing unknown-route behavior.

Vite content-hashed `/assets/*` responses receive `public, max-age=31536000, immutable`. The HTML shell is not assigned a long-lived custom cache header, avoiding stale HTML pointing to an old bundle. Basic compatible response headers enable MIME sniffing protection, strict-origin referrers, frame denial, and disable unused camera, microphone and geolocation permissions. A CSP is deliberately omitted until future OAuth/backend/WebSocket requirements are known.

## Environment variables and secrets

No environment variable or secret is required today. Future browser-visible Vite configuration must use the `VITE_` prefix, but every `VITE_*` value is compiled into the client bundle and is public. Never store OAuth client secrets, database service keys, signing keys or other credentials in `VITE_*` variables. Server-side secrets require a server/function boundary and a separately reviewed architecture.

Do not hard-code the provisional Vercel domain into runtime code, canonical metadata or tests. Supply the real deployment URL only when running deployed smoke tests.

## Test a deployed URL

The deployed suite uses a separate Playwright configuration and does not start a local Vite server. It runs in a fresh browser context, so profile/settings changes are isolated from a person's normal browser storage.

PowerShell:

```powershell
$env:PLAYWRIGHT_BASE_URL='https://your-project.vercel.app'
npm.cmd run test:e2e:deployed
Remove-Item Env:PLAYWRIGHT_BASE_URL
```

Windows CMD:

```bat
set PLAYWRIGHT_BASE_URL=https://your-project.vercel.app
npm.cmd run test:e2e:deployed
```

Linux/CI:

```sh
PLAYWRIGHT_BASE_URL=https://your-project.vercel.app npm run test:e2e:deployed
```

The command requires HTTPS and checks direct route loads and refreshes, title/language, optimized Home machine delivery, missing requests/HTTP errors, console/page errors, persisted language, sound toggle, Play Setup, game start, roll resolution and lever animation.

## First-deployment checklist

- Home, machine, lever, reels and mobile layout look correct with no horizontal overflow.
- Play Setup opens and starts a game.
- Roll, lever/reels and bot turns work.
- Profile, Settings and How to Play open directly and after refresh.
- English/TÃ¼rkÃ§e selection persists after refresh.
- Browser console contains no errors and Network contains no 404 responses.
- HTTPS is active and there is no mixed-content warning.
- GitHub Quality/E2E checks and the Vercel deployment check are green.
- `npm run test:e2e:deployed` passes against the recorded URL.

## Rollback

In Vercel **Deployments**, open a previous successful deployment and use the available **Promote** or **Redeploy** action to restore it to the production domain. For a durable source-level rollback, revert the responsible Git commit and push the revert; Git integration will create a new deployment. Do not promote a failed or unverified preview.

## Common failures

- **Refresh returns 404:** confirm `vercel.json` is at the repository root and the latest commit was deployed.
- **Blank/missing build:** output directory must be `dist`, not the repository root.
- **Node or install failure:** select Node 24 and use `npm ci` with the committed lock file.
- **Missing asset:** inspect exact casing and the Vite build/release-smoke output; Linux paths are case-sensitive.
- **Project name unavailable:** use `roulette-chess`, `roulettechess-web`, or `play-roulettechess`.
- **Old content appears:** verify the active deployment/domain and hard refresh; do not add a long cache lifetime to HTML.
- **GitHub deployment check failed:** open both the Vercel build log and GitHub Quality/E2E logs before redeploying.

Vercel Analytics, Speed Insights, CLI tokens and deployment GitHub Actions are intentionally not included. Dashboard Git integration provides preview/production deployments without repository secrets.
