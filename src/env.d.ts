/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SENTRY_DSN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_RELEASE__: string;
declare const __APP_VERSION__: string;
declare const __DEPLOY_ENVIRONMENT__: string;
