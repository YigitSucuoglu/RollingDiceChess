import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { MultiplayerRatingSettlement } from "../../application/multiplayer/MultiplayerMatchPort";
import { RATING_ANIMATION_DURATION_MS, interpolateRating } from "./ratingAnimation";

interface RatingResultProgressProps {
  readonly settlement: MultiplayerRatingSettlement;
}

export default function RatingResultProgress({ settlement }: RatingResultProgressProps) {
  const { t } = useTranslation();
  const [displayedRating, setDisplayedRating] = useState(settlement.ratingBefore);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion || settlement.ratingBefore === settlement.ratingAfter) {
      const frame = window.requestAnimationFrame(() => setDisplayedRating(settlement.ratingAfter));
      return () => window.cancelAnimationFrame(frame);
    }

    const startedAt = performance.now();
    let frame = 0;
    const animate = (now: number) => {
      const progress = (now - startedAt) / RATING_ANIMATION_DURATION_MS;
      setDisplayedRating(interpolateRating(
        settlement.ratingBefore,
        settlement.ratingAfter,
        progress,
      ));
      if (progress < 1) frame = window.requestAnimationFrame(animate);
    };
    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [settlement.ratingAfter, settlement.ratingBefore]);

  const direction = settlement.ratingDelta >= 0 ? "positive" : "negative";
  const formattedDelta = settlement.ratingDelta > 0
    ? `+${settlement.ratingDelta}`
    : `${settlement.ratingDelta}`;

  return (
    <section
      aria-label={t("result.ratingChangeAria", {
        ratingBefore: settlement.ratingBefore,
        ratingDelta: settlement.ratingDelta,
        ratingAfter: settlement.ratingAfter,
      })}
      className={`game-result-rating is-${direction}`}
    >
      <p>{t("result.rating")}</p>
      <div className="game-result-rating-transition">
        <span>{settlement.ratingBefore}</span>
        <span aria-hidden="true">→</span>
        <strong>{displayedRating}</strong>
      </div>
      <output aria-live="polite">{formattedDelta}</output>
    </section>
  );
}
