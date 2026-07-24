import captureUrl from "../assets/sounds/capture.wav";
import defeatUrl from "../assets/sounds/defeat.wav";
import leverPullUrl from "../assets/sounds/lever-pull.wav";
import moveUrl from "../assets/sounds/move.wav";
import reelSpinUrl from "../assets/sounds/reel-spin.wav";
import reelStopUrl from "../assets/sounds/reel-stop.wav";
import rollButtonUrl from "../assets/sounds/roll-button.wav";
import timeoutUrl from "../assets/sounds/timeout.wav";
import turnSkippedUrl from "../assets/sounds/turn-skipped.wav";
import victoryUrl from "../assets/sounds/victory.wav";
import type { GameSoundId } from "../types/GameSound";

export interface GameSoundDefinition {
  readonly durationMs?: number;
  readonly id: GameSoundId;
  readonly loop: boolean;
  readonly src: string;
  readonly volume: number;
}

export const SOUND_PREFERENCE_STORAGE_KEY =
  "rolling-dice-chess:sound-enabled";

export const SOUND_CATALOG: Readonly<
  Record<GameSoundId, GameSoundDefinition>
> = {
  "roll-button": {
    id: "roll-button",
    loop: false,
    src: rollButtonUrl,
    volume: 0.34,
  },
  "lever-pull": {
    durationMs: 240,
    id: "lever-pull",
    loop: false,
    src: leverPullUrl,
    volume: 0.42,
  },
  "reel-spin": {
    id: "reel-spin",
    loop: true,
    src: reelSpinUrl,
    volume: 0.22,
  },
  "reel-stop": {
    id: "reel-stop",
    loop: false,
    src: reelStopUrl,
    volume: 0.4,
  },
  move: {
    id: "move",
    loop: false,
    src: moveUrl,
    volume: 0.38,
  },
  capture: {
    id: "capture",
    loop: false,
    src: captureUrl,
    volume: 0.46,
  },
  "turn-skipped": {
    id: "turn-skipped",
    loop: false,
    src: turnSkippedUrl,
    volume: 0.34,
  },
  victory: {
    id: "victory",
    loop: false,
    src: victoryUrl,
    volume: 0.44,
  },
  defeat: {
    id: "defeat",
    loop: false,
    src: defeatUrl,
    volume: 0.4,
  },
  timeout: {
    id: "timeout",
    loop: false,
    src: timeoutUrl,
    volume: 0.44,
  },
};
