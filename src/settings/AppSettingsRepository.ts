import type { AppSettings } from "./AppSettings";

export interface AppSettingsRepository {
  getSettings(): AppSettings;
  saveSettings(settings: AppSettings): void;
}
