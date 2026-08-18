import { useEffect, useRef, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

import { resolveMatchExitPolicy, type MatchExitMode } from "../../application/matches/MatchExitPolicy";
import "./MatchExitDialog.css";

interface MatchExitDialogProps {
  readonly mode: MatchExitMode;
  readonly onLeave: () => void;
  readonly onReturn: () => void;
}

export default function MatchExitDialog({ mode, onLeave, onReturn }: MatchExitDialogProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnRef = useRef<HTMLButtonElement>(null);
  const policy = resolveMatchExitPolicy(mode);

  useEffect(() => { returnRef.current?.focus(); }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onReturn();
      return;
    }
    if (event.key !== "Tab") return;
    const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
    if (!buttons?.length) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="match-exit-overlay">
      <div
        aria-describedby="match-exit-description"
        aria-labelledby="match-exit-title"
        aria-modal="true"
        className="match-exit-dialog"
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <p className="match-exit-eyebrow">RouletteChess</p>
        <h2 id="match-exit-title">{t(policy.titleKey)}</h2>
        <p id="match-exit-description">{t(policy.descriptionKey)}</p>
        <div className="match-exit-actions">
          <button className="match-exit-return" onClick={onReturn} ref={returnRef} type="button">
            {t("game.exit.return")}
          </button>
          <button className="match-exit-leave" onClick={onLeave} type="button">
            {t("game.exit.leave")}
          </button>
        </div>
      </div>
    </div>
  );
}
