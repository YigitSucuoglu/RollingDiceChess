import soundManager from "../services/SoundManager";
import type { SoundManager } from "../services/SoundManager";
import type { PlayerProfileViewModel } from "../profile/PlayerProfileService";
import playerProfileService from "../profile/PlayerProfileService";
import type { PlayerProfileService } from "../profile/PlayerProfileService";
import {
  APP_SETTINGS_SCHEMA_VERSION,
  normalizeAppLanguage,
  type AppLanguage,
  type AppSettings,
} from "./AppSettings";
import type { AppSettingsRepository } from "./AppSettingsRepository";
import { LocalStorageAppSettingsRepository } from "./LocalStorageAppSettingsRepository";
import { applyAppLanguage } from "../i18n";

export interface AppSettingsViewModel {
  readonly soundEnabled: boolean;
  readonly language: AppLanguage;
}

export class AppSettingsService {
  private readonly repository: AppSettingsRepository;
  private readonly sounds: Pick<SoundManager, "isEnabled" | "setEnabled">;
  private readonly profiles: Pick<PlayerProfileService, "resetProfile">;

  constructor(
    repository: AppSettingsRepository =
      new LocalStorageAppSettingsRepository(),
    sounds: Pick<SoundManager, "isEnabled" | "setEnabled"> = soundManager,
    profiles: Pick<PlayerProfileService, "resetProfile"> =
      playerProfileService
  ) {
    this.repository = repository;
    this.sounds = sounds;
    this.profiles = profiles;
  }

  public getViewModel(): AppSettingsViewModel {
    return {
      soundEnabled: this.sounds.isEnabled(),
      language: this.repository.getSettings().language,
    };
  }

  public setSoundEnabled(enabled: boolean): AppSettingsViewModel {
    this.sounds.setEnabled(enabled);
    return this.getViewModel();
  }

  public setLanguage(language: AppLanguage): AppSettingsViewModel {
    const settings: AppSettings = {
      schemaVersion: APP_SETTINGS_SCHEMA_VERSION,
      language: normalizeAppLanguage(language),
    };
    this.repository.saveSettings(settings);
    void applyAppLanguage(settings.language);
    return this.getViewModel();
  }

  public resetOfflineProfile(): PlayerProfileViewModel {
    return this.profiles.resetProfile();
  }
}

const appSettingsService = new AppSettingsService();

export default appSettingsService;
