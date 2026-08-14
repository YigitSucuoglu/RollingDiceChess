import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import appSettingsService, {
  type AppSettingsViewModel,
} from "../settings/AppSettingsService";
import type { AppLanguage } from "../settings/AppSettings";
import "../styles/SettingsPage.css";

function SettingsPage() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<AppSettingsViewModel>(() =>
    appSettingsService.getViewModel()
  );
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [resetStatus, setResetStatus] = useState("");
  const cancelResetRef = useRef<HTMLButtonElement>(null);
  const resetDialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = t("settings.browserTitle");
    window.scrollTo({ left: 0, top: 0, behavior: "auto" });

    return () => {
      document.title = previousTitle;
    };
  }, [t]);

  useEffect(() => {
    if (isResetDialogOpen) {
      cancelResetRef.current?.focus();
    }
  }, [isResetDialogOpen]);

  const toggleSound = () => {
    setSettings(
      appSettingsService.setSoundEnabled(!settings.soundEnabled)
    );
  };

  const changeLanguage = (event: ChangeEvent<HTMLSelectElement>) => {
    setSettings(
      appSettingsService.setLanguage(event.target.value as AppLanguage)
    );
  };

  const closeResetDialog = () => setIsResetDialogOpen(false);

  const confirmReset = () => {
    appSettingsService.resetOfflineProfile();
    setResetStatus(t("settings.resetComplete"));
    closeResetDialog();
  };

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeResetDialog();
      return;
    }

    if (event.key === "Tab") {
      const actions = resetDialogRef.current?.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)"
      );
      if (!actions || actions.length === 0) return;

      const firstAction = actions[0];
      const lastAction = actions[actions.length - 1];
      if (event.shiftKey && document.activeElement === firstAction) {
        event.preventDefault();
        lastAction.focus();
      } else if (!event.shiftKey && document.activeElement === lastAction) {
        event.preventDefault();
        firstAction.focus();
      }
    }
  };

  const handleDialogBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      closeResetDialog();
    }
  };

  return (
    <main className="settings-page">
      <div aria-hidden="true" className="settings-ambient settings-ambient-left" />
      <div aria-hidden="true" className="settings-ambient settings-ambient-right" />

      <div
        aria-hidden={isResetDialogOpen || undefined}
        className="settings-shell"
        inert={isResetDialogOpen || undefined}
      >
        <nav aria-label={t("common.navigation.settings")} className="settings-nav">
          <Link className="settings-brand" to="/">RouletteChess</Link>
          <Link className="settings-back-link" to="/">
            <span aria-hidden="true">←</span>
            {t("common.actions.backToHome")}
          </Link>
        </nav>

        <header className="settings-heading">
          <p>{t("settings.eyebrow")}</p>
          <h1>{t("settings.title")}</h1>
          <span>{t("settings.description")}</span>
        </header>

        <div className="settings-sections">
          <section aria-labelledby="audio-settings-title" className="settings-card">
            <header className="settings-card-heading">
              <span aria-hidden="true" className="settings-card-icon">
                <svg viewBox="0 0 24 24">
                  <path d="M4 9v6h4l5 4V5L8 9H4Z" />
                  <path d="M16 8.2a5 5 0 0 1 0 7.6M18.5 5.7a8.5 8.5 0 0 1 0 12.6" />
                </svg>
              </span>
              <div>
                <p>{t("settings.soundControls")}</p>
                <h2 id="audio-settings-title">{t("settings.audio")}</h2>
              </div>
            </header>

            <div className="settings-row">
              <div>
                <h3>{t("settings.soundEffects")}</h3>
                <p>{t("settings.soundDescription")}</p>
              </div>
              <button
                aria-checked={settings.soundEnabled}
                aria-label={t("settings.soundLabel")}
                className="settings-switch"
                onClick={toggleSound}
                role="switch"
                type="button"
              >
                <span aria-hidden="true" />
                <strong>{t(settings.soundEnabled ? "common.status.on" : "common.status.off")}</strong>
              </button>
            </div>
          </section>

          <section aria-labelledby="language-settings-title" className="settings-card">
            <header className="settings-card-heading">
              <span aria-hidden="true" className="settings-card-icon">
                <svg viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="8" />
                  <path d="M4 12h16M12 4c2.2 2.2 3.2 4.9 3.2 8S14.2 17.8 12 20M12 4C9.8 6.2 8.8 8.9 8.8 12S9.8 17.8 12 20" />
                </svg>
              </span>
              <div>
                <p>{t("settings.displayLanguage")}</p>
                <h2 id="language-settings-title">{t("settings.language")}</h2>
              </div>
            </header>

            <div className="settings-row settings-language-row">
              <div>
                <label htmlFor="settings-language">{t("settings.language")}</label>
                <p>{t("settings.languageDescription")}</p>
              </div>
              <div className="settings-select-wrap">
                <select
                  id="settings-language"
                  onChange={changeLanguage}
                  value={settings.language}
                >
                  <option value="en">English</option>
                  <option value="tr">Türkçe</option>
                </select>
                <span aria-hidden="true">⌄</span>
              </div>
            </div>
          </section>

          <section aria-labelledby="data-settings-title" className="settings-card settings-data-card">
            <header className="settings-card-heading">
              <span aria-hidden="true" className="settings-card-icon">
                <svg viewBox="0 0 24 24">
                  <ellipse cx="12" cy="6" rx="7" ry="3" />
                  <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
                </svg>
              </span>
              <div>
                <p>{t("settings.localPlayerData")}</p>
                <h2 id="data-settings-title">{t("settings.data")}</h2>
              </div>
            </header>

            <div className="settings-row settings-reset-row">
              <div>
                <h3>{t("settings.resetOfflineProfile")}</h3>
                <p>{t("settings.resetDescription")}</p>
              </div>
              <button
                className="settings-reset-button"
                disabled={!settings.profileResetAvailable}
                onClick={() => {
                  setResetStatus("");
                  setIsResetDialogOpen(true);
                }}
                type="button"
              >
                {settings.profileResetAvailable
                  ? t("common.actions.resetProfile")
                  : t("settings.cloudResetUnavailable")}
              </button>
            </div>
            <p aria-live="polite" className="settings-reset-status">
              {resetStatus}
            </p>
          </section>
        </div>
      </div>

      {isResetDialogOpen && (
        <div
          className="settings-dialog-overlay"
          onClick={handleDialogBackdropClick}
          onKeyDown={handleDialogKeyDown}
        >
          <div
            aria-describedby="reset-profile-description"
            aria-labelledby="reset-profile-title"
            aria-modal="true"
            className="settings-dialog"
            ref={resetDialogRef}
            role="dialog"
          >
            <p>{t("settings.dialog.eyebrow")}</p>
            <h2 id="reset-profile-title">{t("settings.dialog.title")}</h2>
            <span id="reset-profile-description">
              {t("settings.dialog.description")}
            </span>
            <div className="settings-dialog-actions">
              <button
                className="secondary"
                onClick={closeResetDialog}
                ref={cancelResetRef}
                type="button"
              >
                {t("common.actions.cancel")}
              </button>
              <button className="danger" onClick={confirmReset} type="button">
                {t("common.actions.reset")}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default SettingsPage;
