import { useEffect, useMemo, useRef, useState } from "react";
import type { MatchXpProgressionResult } from "../../profile/ProfileProgression";

interface ResultXpProgressProps {
  progression: MatchXpProgressionResult;
}

interface DisplayProgress {
  level: number;
  title: string;
  xp: number;
  requiredXp: number;
  isLevelTransition: boolean;
}

const ANIMATION_START_DELAY_MS = 260;
const MIN_LEVEL_TRANSITION_DELAY_MS = 80;
const MAX_LEVEL_TRANSITION_DELAY_MS = 220;
const MIN_SEGMENT_DURATION_MS = 180;
const MAX_SEGMENT_DURATION_MS = 700;
const TOTAL_FILL_DURATION_MS = 1800;

function createFinalDisplay(
  progression: MatchXpProgressionResult
): DisplayProgress {
  return {
    level: progression.current.level,
    title: progression.current.title,
    xp: progression.current.currentLevelXp,
    requiredXp: progression.current.requiredXp,
    isLevelTransition: progression.leveledUp,
  };
}

function ResultXpProgress({ progression }: ResultXpProgressProps) {
  const firstSegment = progression.segments[0];
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [display, setDisplay] = useState<DisplayProgress>(() => ({
    ...(prefersReducedMotion
      ? createFinalDisplay(progression)
      : {
          level: firstSegment.level,
          title: firstSegment.title,
          xp: firstSegment.fromXp,
          requiredXp: firstSegment.requiredXp,
          isLevelTransition: false,
        }),
  }));
  const animationFrameRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const segmentDuration = useMemo(
    () =>
      Math.min(
        MAX_SEGMENT_DURATION_MS,
        Math.max(
          MIN_SEGMENT_DURATION_MS,
          TOTAL_FILL_DURATION_MS / progression.segments.length
        )
      ),
    [progression.segments.length]
  );
  const levelTransitionDelay = useMemo(
    () =>
      progression.segments.length <= 1
        ? 0
        : Math.min(
            MAX_LEVEL_TRANSITION_DELAY_MS,
            Math.max(
              MIN_LEVEL_TRANSITION_DELAY_MS,
              700 / (progression.segments.length - 1)
            )
          ),
    [progression.segments.length]
  );

  useEffect(() => {
    let isCancelled = false;

    const clearScheduledWork = () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    if (prefersReducedMotion) {
      return clearScheduledWork;
    }

    const animateSegment = (segmentIndex: number) => {
      const segment = progression.segments[segmentIndex];
      const startedAt = performance.now();

      setDisplay({
        level: segment.level,
        title: segment.title,
        xp: segment.fromXp,
        requiredXp: segment.requiredXp,
        isLevelTransition: false,
      });

      const tick = (now: number) => {
        if (isCancelled) return;

        const elapsed = Math.min(1, (now - startedAt) / segmentDuration);
        const eased = 1 - Math.pow(1 - elapsed, 3);
        const xp = Math.round(
          segment.fromXp +
          (segment.toXp - segment.fromXp) * eased
        );

        setDisplay((current) => ({ ...current, xp }));

        if (elapsed < 1) {
          animationFrameRef.current = window.requestAnimationFrame(tick);
          return;
        }

        if (segmentIndex === progression.segments.length - 1) {
          setDisplay(createFinalDisplay(progression));
          return;
        }

        setDisplay((current) => ({
          ...current,
          isLevelTransition: true,
        }));
        timeoutRef.current = window.setTimeout(
          () => animateSegment(segmentIndex + 1),
          levelTransitionDelay
        );
      };

      animationFrameRef.current = window.requestAnimationFrame(tick);
    };

    timeoutRef.current = window.setTimeout(
      () => animateSegment(0),
      ANIMATION_START_DELAY_MS
    );

    return () => {
      isCancelled = true;
      clearScheduledWork();
    };
  }, [
    levelTransitionDelay,
    prefersReducedMotion,
    progression,
    segmentDuration,
  ]);

  const visualPercent = Math.min(
    100,
    Math.max(0, (display.xp / display.requiredXp) * 100)
  );

  return (
    <section aria-label="Experience earned" className="game-result-xp">
      <div aria-live="polite" className="game-result-earned-xp">
        +{progression.earnedXp} XP
      </div>

      <div className="game-result-level-labels">
        <div>
          <span>Level {display.level}</span>
          <strong>{display.title}</strong>
        </div>
        <span aria-hidden="true">→</span>
        <div>
          <span>Level {display.level + 1}</span>
          <strong>Next level</strong>
        </div>
      </div>

      <div
        aria-label={`XP progress toward Level ${progression.current.level + 1}`}
        aria-valuemax={progression.current.requiredXp}
        aria-valuemin={0}
        aria-valuenow={progression.current.currentLevelXp}
        className="game-result-xp-track"
        role="progressbar"
      >
        <span style={{ width: `${visualPercent}%` }} />
      </div>

      <div className="game-result-xp-meta">
        <span>{display.xp} / {display.requiredXp} XP</span>
        <span
          aria-hidden={!progression.leveledUp}
          className={display.isLevelTransition ? "is-visible" : ""}
        >
          Level up
        </span>
      </div>
    </section>
  );
}

export default ResultXpProgress;
