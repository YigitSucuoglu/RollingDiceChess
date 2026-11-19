import { useState } from "react";
import { useTranslation } from "react-i18next";
import GoldenProgressReveal from "../components/AchievementNotification/GoldenProgressReveal";
import { ACHIEVEMENT_DEFINITIONS } from "../domain/achievements/AchievementCatalog";

import "./AchievementAnimationLab.css";

type Concept = "progress" | "seal";
type Sample = "ranked" | "pawn" | "untouchable";

const samples: Record<Sample, { icon: string; before?: number; target?: number }> = {
  ranked: { icon: "♛", before: 0, target: 1 },
  pawn: { icon: "♟", before: 499, target: 500 },
  untouchable: { icon: "♜" },
};
const sampleIds = { ranked: "ranked_victor", pawn: "pawn_commander", untouchable: "untouchable" } as const;

export default function AchievementAnimationLab() {
  const { t } = useTranslation();
  const [concept, setConcept] = useState<Concept>("progress");
  const [sample, setSample] = useState<Sample>("ranked");
  const [runId, setRunId] = useState(0);
  const [kind, setKind] = useState<"confirmed" | "pending">("confirmed");
  const [multiple, setMultiple] = useState(false);
  const [sequenceIndex, setSequenceIndex] = useState(0);
  const [status, setStatus] = useState<"idle" | "playing" | "complete">("idle");
  const achievement = samples[sample];
  const play = () => {
    setRunId((value) => value + 1);
    setSequenceIndex(0);
    setStatus(window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "complete" : "playing");
  };
  const reset = () => { setStatus("idle"); setSequenceIndex(0); };
  const currentSample = multiple && sequenceIndex === 1 ? "pawn" : sample;

  return (
    <main className="achievement-lab">
      <header className="achievement-lab-header">
        <p className="achievement-lab-eyebrow">RouletteChess · {t("achievementLab.prototype")}</p>
        <h1>{t("achievementLab.title")}</h1>
        <p>{t("achievementLab.intro")}</p>
      </header>

      <div className="achievement-lab-controls">
        <fieldset>
          <legend>{t("achievementLab.concept")}</legend>
          {(["progress", "seal"] as const).map((value) => (
            <button aria-pressed={concept === value} key={value} onClick={() => { setConcept(value); reset(); }} type="button">
              {t(`achievementLab.concepts.${value}`)}
            </button>
          ))}
        </fieldset>
        <label htmlFor="achievement-lab-sample">{t("achievementLab.sample")}</label>
        <select id="achievement-lab-sample" onChange={(event) => { setSample(event.target.value as Sample); reset(); }} value={sample}>
          {(["ranked", "pawn", "untouchable"] as const).map((value) =>
            <option key={value} value={value}>{t(`achievementLab.samples.${value}.title`)}</option>)}
        </select>
        <label htmlFor="achievement-lab-kind">{t("achievementLab.notificationState")}</label>
        <select id="achievement-lab-kind" onChange={(event) => { setKind(event.target.value as "confirmed" | "pending"); reset(); }} value={kind}>
          <option value="confirmed">{t("achievementLab.confirmed")}</option>
          <option value="pending">{t("achievementLab.pending")}</option>
        </select>
        <label className="achievement-lab-multiple" htmlFor="achievement-lab-multiple">
          <input checked={multiple} id="achievement-lab-multiple" onChange={(event) => { setMultiple(event.target.checked); reset(); }} type="checkbox" />
          {t("achievementLab.multiple")}
        </label>
        <div className="achievement-lab-actions">
          <button onClick={play} type="button">{t("achievementLab.play")}</button>
          <button onClick={play} type="button">{t("achievementLab.replay")}</button>
          <button onClick={reset} type="button">{t("achievementLab.reset")}</button>
        </div>
      </div>

      <section aria-label={t("achievementLab.stage")} className="achievement-lab-stage">
        <div aria-hidden="true" className="achievement-lab-board" />
        <div className="achievement-lab-game-over" aria-hidden="true">
          <span>RouletteChess</span><strong>{t("achievementLab.gameOver")}</strong>
        </div>
        {status !== "idle" && (
          <div className={`achievement-lab-animation achievement-lab-${concept}`} data-concept={concept} data-status={status} key={`${concept}-${sample}-${runId}`}
            onAnimationEnd={(event) => {
              if (event.target === event.currentTarget && status === "playing") setStatus("complete");
            }}>
            {concept === "progress" ? (
              <GoldenProgressReveal achievement={ACHIEVEMENT_DEFINITIONS[sampleIds[currentSample]]} embedded
                key={`${currentSample}-${runId}`} kind={kind} manualDismiss
                onFinished={() => { if (multiple && sequenceIndex === 0) setSequenceIndex(1); else reset(); }}
                samplePreviousProgress={samples[currentSample].before} />
            ) : (
              <div className="achievement-lab-seal-panel">
                <div className="achievement-lab-seal-emblem" aria-hidden="true"><span>{achievement.icon}</span></div>
                <div className="achievement-lab-seal-copy">
                  <p>{t("achievementLab.unlocked")}</p>
                  <h2>{t(`achievementLab.samples.${sample}.title`)}</h2>
                  <span>{t(`achievementLab.samples.${sample}.description`)}</span>
                </div>
                {status === "complete" && <button className="achievement-lab-ok" onClick={reset} type="button">{t("achievementLab.ok")}</button>}
              </div>
            )}
          </div>
        )}
      </section>
      <p aria-live="polite" className="achievement-lab-live">
        {status === "playing" ? t("achievementLab.announcement", { name: t(`achievementLab.samples.${sample}.title`) }) : ""}
      </p>
      <p className="achievement-lab-note">{t("achievementLab.mockNotice")}</p>
    </main>
  );
}
