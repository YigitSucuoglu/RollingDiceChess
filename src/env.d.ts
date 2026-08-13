/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OBSERVABILITY_TEST_MODE?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_SUPABASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_RELEASE__: string;
declare const __APP_VERSION__: string;
declare const __DEPLOY_ENVIRONMENT__: string;
declare const __OBSERVABILITY_TEST_MODE__: boolean;
