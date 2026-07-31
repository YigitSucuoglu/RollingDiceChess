import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { LocalStorageAppSettingsRepository } from "../settings/LocalStorageAppSettingsRepository";
import type { AppLanguage } from "../settings/AppSettings";
import en from "./resources/en.json";
import tr from "./resources/tr.json";

export const APP_LOCALES: Readonly<Record<AppLanguage, string>> = {
  en: "en-US",
  tr: "tr-TR",
};

const initialLanguage =
  new LocalStorageAppSettingsRepository().getSettings().language;

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    tr: { translation: tr },
  },
  lng: initialLanguage,
  fallbackLng: "en",
  supportedLngs: ["en", "tr"],
  interpolation: { escapeValue: false },
  returnNull: false,
  initAsync: false,
});

if (typeof document !== "undefined") {
  document.documentElement.lang = initialLanguage;
}

export async function applyAppLanguage(language: AppLanguage): Promise<void> {
  await i18n.changeLanguage(language);
  if (typeof document !== "undefined") {
    document.documentElement.lang = language;
  }
}

export default i18n;
