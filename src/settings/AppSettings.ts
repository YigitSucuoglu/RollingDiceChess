export const APP_SETTINGS_SCHEMA_VERSION = 1;
export const APP_SETTINGS_STORAGE_KEY = "roulettechess.settings.v1";

export type AppLanguage = "en" | "tr";

export interface AppSettings {
  readonly schemaVersion: number;
  readonly language: AppLanguage;
}

export function createDefaultAppSettings(): AppSettings {
  return {
    schemaVersion: APP_SETTINGS_SCHEMA_VERSION,
    language: "en",
  };
}

export function normalizeAppLanguage(value: unknown): AppLanguage {
  return value === "tr" ? "tr" : "en";
}
