import {
  APP_SETTINGS_SCHEMA_VERSION,
  APP_SETTINGS_STORAGE_KEY,
  createDefaultAppSettings,
  normalizeAppLanguage,
  type AppSettings,
} from "./AppSettings";
import type { AppSettingsRepository } from "./AppSettingsRepository";

export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const fallbackValues = new Map<string, string>();
const FALLBACK_STORAGE: SettingsStorage = {
  getItem: (key) => fallbackValues.get(key) ?? null,
  setItem: (key, value) => fallbackValues.set(key, value),
};

function getDefaultStorage(): SettingsStorage {
  try {
    return typeof window === "undefined"
      ? FALLBACK_STORAGE
      : window.localStorage;
  } catch {
    return FALLBACK_STORAGE;
  }
}

export class LocalStorageAppSettingsRepository
  implements AppSettingsRepository
{
  private readonly storage: SettingsStorage;

  constructor(storage: SettingsStorage = getDefaultStorage()) {
    this.storage = storage;
  }

  public getSettings(): AppSettings {
    const defaults = createDefaultAppSettings();

    try {
      const serialized = this.storage.getItem(APP_SETTINGS_STORAGE_KEY);
      if (!serialized) {
        this.saveSettings(defaults);
        return defaults;
      }

      const parsed: unknown = JSON.parse(serialized);
      if (typeof parsed !== "object" || parsed === null) {
        return defaults;
      }

      const source = parsed as Record<string, unknown>;
      const schemaVersion =
        typeof source.schemaVersion === "number"
          ? source.schemaVersion
          : 0;

      if (schemaVersion > APP_SETTINGS_SCHEMA_VERSION) {
        return defaults;
      }

      const settings: AppSettings = {
        schemaVersion: APP_SETTINGS_SCHEMA_VERSION,
        language: normalizeAppLanguage(source.language),
      };
      this.saveSettings(settings);
      return settings;
    } catch {
      return defaults;
    }
  }

  public saveSettings(settings: AppSettings): void {
    try {
      this.storage.setItem(
        APP_SETTINGS_STORAGE_KEY,
        JSON.stringify(settings)
      );
    } catch {
      // Settings controls must remain usable when storage is unavailable.
    }
  }
}
