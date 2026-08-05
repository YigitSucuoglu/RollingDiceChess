import { readFileSync } from 'node:fs'

import { sentryVitePlugin } from '@sentry/vite-plugin'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const status = readFileSync(new URL('./PROJECT_STATUS.md', import.meta.url), 'utf8')
const appVersion = status.match(/## Current Version\s+v([^\s]+)/)?.[1]

if (!appVersion) throw new Error('Unable to derive application version from PROJECT_STATUS.md')

const commitSha = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA
const appRelease = `roulettechess@${appVersion}${commitSha ? `+${commitSha.slice(0, 12)}` : ''}`

export default defineConfig(({ command, mode }) => {
  const uploadCredentials = {
    authToken: process.env.SENTRY_AUTH_TOKEN,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
  }
  const uploadEnabled = command === 'build' && Object.values(uploadCredentials).every(Boolean)

  if (command === 'build' && !uploadEnabled) {
    console.info('[observability] Sentry source-map upload skipped: build credentials are not fully configured.')
  }

  return {
    build: { sourcemap: uploadEnabled ? 'hidden' : false },
    define: {
      __APP_RELEASE__: JSON.stringify(appRelease),
      __APP_VERSION__: JSON.stringify(appVersion),
      __DEPLOY_ENVIRONMENT__: JSON.stringify(
        process.env.VITE_DEPLOY_ENV ?? process.env.VERCEL_ENV ?? mode,
      ),
    },
    plugins: [
      react(),
      ...(uploadEnabled
        ? [sentryVitePlugin({
            authToken: uploadCredentials.authToken,
            org: uploadCredentials.org,
            project: uploadCredentials.project,
            release: { name: appRelease },
            sourcemaps: {
              assets: './dist/assets/**',
              filesToDeleteAfterUpload: './dist/**/*.map',
            },
            telemetry: false,
          })]
        : []),
    ],
  }
})
