import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { PROGRESS_ACHIEVEMENT_IDS } from "../../application/achievements/AchievementProgress";
import type { AchievementDefinition } from "../../domain/achievements/AchievementContracts";
import "./GoldenProgressReveal.css";

interface GoldenProgressRevealProps {
  readonly achievement: AchievementDefinition;
  readonly onFinished: () => void;
  readonly kind?: "confirmed" | "pending";
  readonly embedded?: boolean;
  readonly manualDismiss?: boolean;
  readonly samplePreviousProgress?: number;
}

const ICONS: Readonly<Record<string, string>> = {
  "ranked-multiplayer": "♛", "global-piece-mastery": "♟", "single-match": "♜",
};

export default function GoldenProgressReveal({
  achievement, onFinished, kind = "confirmed", embedded = false, manualDismiss = false,
  samplePreviousProgress,
}: GoldenProgressRevealProps) {
  const { t, i18n } = useTranslation();
  const [complete, setComplete] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const language = i18n.resolvedLanguage === "tr" ? "tr" : "en";
  const showsProgress = PROGRESS_ACHIEVEMENT_IDS.includes(achievement.id as typeof PROGRESS_ACHIEVEMENT_IDS[number]);

  useEffect(() => {
    if (!complete || !window.matchMedia("(prefers-reduced-motion: reduce)").matches || manualDismiss) return;
    const timer = window.setTimeout(onFinished, 3100);
    return () => window.clearTimeout(timer);
  }, [complete, manualDismiss, onFinished]);

  const finishAnimation = () => {
    if (manualDismiss) setComplete(true);
    else onFinished();
  };

  return (
    <div className={`golden-reveal${embedded ? " golden-reveal-embedded" : ""}${manualDismiss ? " golden-reveal-manual" : ""}${manualDismiss && !embedded ? " golden-reveal-modal" : ""}`}
      aria-label={manualDismiss && !embedded ? t("achievementNotification.unlocked") : undefined}
      aria-modal={manualDismiss && !embedded ? true : undefined} data-complete={complete} data-kind={kind}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) finishAnimation();
      }} role={manualDismiss && !embedded ? "dialog" : "status"}>
      <div className="golden-reveal-card">
        <p className="golden-reveal-category">{t(`achievementNotification.categories.${achievement.category}`)}</p>
        <span aria-hidden="true" className="golden-reveal-icon">{ICONS[achievement.category] ?? "✦"}</span>
        <h2>{achievement.title[language]}</h2>
        <p className="golden-reveal-description">{achievement.description[language]}</p>
        {showsProgress && (
          <div className="golden-reveal-progress">
            <div><span>{t("achievementNotification.progress")}</span><strong>
              {samplePreviousProgress !== undefined && !complete
                ? `${samplePreviousProgress}/${achievement.target}`
                : `${achievement.target}/${achievement.target}`}
            </strong></div>
            <div className="golden-reveal-track"><span /></div>
          </div>
        )}
        <p className="golden-reveal-unlocked">{t(kind === "pending" ? "achievementNotification.pending" : "achievementNotification.unlocked")}</p>
        {manualDismiss && complete && (
          <button autoFocus className="golden-reveal-ok" onClick={onFinished} type="button">{t("achievementNotification.ok")}</button>
        )}
      </div>
    </div>
  );
}
