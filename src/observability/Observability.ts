import * as Sentry from "@sentry/react";
import type { Breadcrumb, CaptureContext, Event } from "@sentry/react";

export type ObservabilityArea =
  | "app"
  | "routing"
  | "game-ui"
  | "profile"
  | "settings";

export interface ObservabilityContext {
  readonly area?: ObservabilityArea;
  readonly componentStack?: string;
  readonly operation?: string;
  readonly route?: string;
}

export interface ObservabilityRuntimeConfig {
  readonly deploymentEnvironment: string;
  readonly dsn?: string;
  readonly language?: string;
  readonly production: boolean;
  readonly release: string;
}

export interface ObservabilitySdk {
  addBreadcrumb(breadcrumb: Breadcrumb): void;
  captureException(error: unknown, context?: CaptureContext): string;
  captureMessage(message: string, context?: CaptureContext): string;
  flush(timeout?: number): PromiseLike<boolean>;
  init(options: Sentry.BrowserOptions): void;
  setContext(name: string, context: Record<string, unknown> | null): void;
  setTag(key: string, value: string): void;
}

const sdk: ObservabilitySdk = {
  addBreadcrumb: Sentry.addBreadcrumb,
  captureException: Sentry.captureException,
  captureMessage: Sentry.captureMessage,
  flush: Sentry.flush,
  init: Sentry.init,
  setContext: Sentry.setContext,
  setTag: Sentry.setTag,
};

const SAFE_CONTEXT_NAMES = new Set(["app", "react", "route"]);
const SAFE_TAG_NAMES = new Set(["area", "language", "operation", "route"]);

export function sanitizePath(value: string | undefined): string | undefined {
  if (!value) return undefined;

  try {
    return new URL(value, "https://roulettechess.invalid").pathname;
  } catch {
    return value.split(/[?#]/, 1)[0] || "/";
  }
}

function sanitizeLabel(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const sanitized = value.replace(/[^a-zA-Z0-9_.-]/g, "-").slice(0, 64);
  return sanitized || undefined;
}

export function scrubObservabilityEvent<TEvent extends Event>(event: TEvent): TEvent {
  const request = event.request
    ? {
        method: event.request.method,
        url: sanitizePath(event.request.url),
      }
    : undefined;
  const contexts = event.contexts
    ? Object.fromEntries(
        Object.entries(event.contexts).filter(([name]) => SAFE_CONTEXT_NAMES.has(name)),
      )
    : undefined;
  const tags = event.tags
    ? Object.fromEntries(
        Object.entries(event.tags).filter(([name]) => SAFE_TAG_NAMES.has(name)),
      )
    : undefined;

  return {
    ...event,
    breadcrumbs: event.breadcrumbs?.map(sanitizeBreadcrumb).filter((item): item is Breadcrumb => item !== null),
    contexts,
    extra: undefined,
    request,
    tags,
    user: undefined,
  } as TEvent;
}

export function sanitizeBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  const category = breadcrumb.category ?? "";
  if (
    category === "console" ||
    category.startsWith("ui.") ||
    category.includes("fetch") ||
    category.includes("xhr")
  ) {
    return null;
  }

  if (category === "navigation") {
    const from = typeof breadcrumb.data?.from === "string"
      ? sanitizePath(breadcrumb.data.from)
      : undefined;
    const to = typeof breadcrumb.data?.to === "string"
      ? sanitizePath(breadcrumb.data.to)
      : undefined;
    return { ...breadcrumb, data: { from, to }, message: undefined };
  }

  return {
    category: breadcrumb.category,
    level: breadcrumb.level,
    timestamp: breadcrumb.timestamp,
    type: breadcrumb.type,
  };
}

function toCaptureContext(context?: ObservabilityContext): CaptureContext {
  const route = sanitizePath(context?.route);
  const area = context?.area;
  const operation = sanitizeLabel(context?.operation);
  const componentStack = context?.componentStack?.slice(0, 4_000);

  return {
    contexts: {
      ...(route ? { route: { path: route } } : {}),
      ...(componentStack ? { react: { componentStack } } : {}),
    },
    tags: {
      ...(area ? { area } : {}),
      ...(operation ? { operation } : {}),
      ...(route ? { route } : {}),
    },
  };
}

export class ObservabilityClient {
  private readonly clientSdk: ObservabilitySdk;

  private enabled = false;

  private initialized = false;

  public constructor(clientSdk: ObservabilitySdk) {
    this.clientSdk = clientSdk;
  }

  public initialize(config: ObservabilityRuntimeConfig): void {
    if (this.initialized) return;
    this.initialized = true;
    if (!config.production || !config.dsn) return;

    try {
      this.clientSdk.init({
        beforeBreadcrumb: sanitizeBreadcrumb,
        beforeSend: scrubObservabilityEvent,
        dsn: config.dsn,
        environment: config.deploymentEnvironment,
        maxBreadcrumbs: 20,
        release: config.release,
        sendDefaultPii: false,
      });
      this.enabled = true;
      if (config.language) this.clientSdk.setTag("language", sanitizeLabel(config.language) ?? "unknown");
      this.clientSdk.setContext("app", {
        deploymentEnvironment: config.deploymentEnvironment,
        release: config.release,
      });
    } catch (error: unknown) {
      this.enabled = false;
      console.error("Observability initialization failed; the application will continue without remote reporting.", error);
    }
  }

  public captureException(error: unknown, context?: ObservabilityContext): void {
    if (!this.enabled) return;
    try {
      this.clientSdk.captureException(error, toCaptureContext(context));
    } catch {
      // Monitoring must never affect application availability.
    }
  }

  public captureMessage(message: string, context?: ObservabilityContext): void {
    if (!this.enabled) return;
    try {
      this.clientSdk.captureMessage(message.slice(0, 256), toCaptureContext(context));
    } catch {
      // Monitoring must never affect application availability.
    }
  }

  public async flush(timeoutMs = 250): Promise<boolean> {
    if (!this.enabled) return true;
    try {
      return await this.clientSdk.flush(timeoutMs);
    } catch {
      return false;
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setRoute(route: string): void {
    if (!this.enabled) return;
    const pathname = sanitizePath(route);
    if (!pathname) return;
    try {
      this.clientSdk.setTag("route", pathname);
      this.clientSdk.setContext("route", { path: pathname });
      this.clientSdk.addBreadcrumb({ category: "navigation", data: { to: pathname }, type: "navigation" });
    } catch {
      // Monitoring must never affect routing.
    }
  }
}

const observability = new ObservabilityClient(sdk);

export function initializeObservability(): void {
  observability.initialize({
    deploymentEnvironment: __DEPLOY_ENVIRONMENT__,
    dsn: import.meta.env.VITE_SENTRY_DSN,
    language: typeof document === "undefined" ? undefined : document.documentElement.lang,
    production: import.meta.env.PROD,
    release: __APP_RELEASE__,
  });
}

export const captureException = observability.captureException.bind(observability);
export const captureMessage = observability.captureMessage.bind(observability);
export const flushObservability = observability.flush.bind(observability);
export const isObservabilityEnabled = observability.isEnabled.bind(observability);
export const setObservabilityRoute = observability.setRoute.bind(observability);
