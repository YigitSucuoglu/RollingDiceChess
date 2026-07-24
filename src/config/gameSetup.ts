import type {
  GameSetup,
  GameSetupInput,
  TimeControlCategory,
  TimeControlOption,
} from "../types/GameSetup";
import {
  DEFAULT_PIECE_THEME,
  normalizePieceTheme,
} from "./pieceThemes";
import {
  DEFAULT_BOARD_THEME,
  normalizeBoardTheme,
} from "./boardThemes";

export const TIME_CONTROL_CATEGORIES: readonly TimeControlCategory[] = [
  "bullet",
  "blitz",
  "rapid",
  "classical",
];

export const TIME_CONTROL_OPTIONS: readonly TimeControlOption[] = [
  { id: "bullet-1-0", label: "1+0", category: "bullet", initialMinutes: 1, incrementSeconds: 0 },
  { id: "bullet-1-1", label: "1+1", category: "bullet", initialMinutes: 1, incrementSeconds: 1 },
  { id: "bullet-2-1", label: "2+1", category: "bullet", initialMinutes: 2, incrementSeconds: 1 },
  { id: "blitz-3-0", label: "3+0", category: "blitz", initialMinutes: 3, incrementSeconds: 0 },
  { id: "blitz-3-2", label: "3+2", category: "blitz", initialMinutes: 3, incrementSeconds: 2 },
  { id: "blitz-5-0", label: "5+0", category: "blitz", initialMinutes: 5, incrementSeconds: 0 },
  { id: "blitz-5-3", label: "5+3", category: "blitz", initialMinutes: 5, incrementSeconds: 3 },
  { id: "rapid-10-0", label: "10+0", category: "rapid", initialMinutes: 10, incrementSeconds: 0 },
  { id: "rapid-10-5", label: "10+5", category: "rapid", initialMinutes: 10, incrementSeconds: 5 },
  { id: "rapid-15-0", label: "15+0", category: "rapid", initialMinutes: 15, incrementSeconds: 0 },
  { id: "rapid-15-10", label: "15+10", category: "rapid", initialMinutes: 15, incrementSeconds: 10 },
  { id: "classical-25-0", label: "25+0", category: "classical", initialMinutes: 25, incrementSeconds: 0 },
  { id: "classical-30-0", label: "30+0", category: "classical", initialMinutes: 30, incrementSeconds: 0 },
];

export const DEFAULT_TIME_CONTROL = TIME_CONTROL_OPTIONS.find(
  (option) => option.id === "blitz-5-0"
) as TimeControlOption;

export function createDefaultGameSetup(): GameSetup {
  return {
    timeControl: DEFAULT_TIME_CONTROL,
    playerColor: "white",
    botColor: "black",
    opponentType: "bot",
    pieceTheme: DEFAULT_PIECE_THEME,
    boardTheme: DEFAULT_BOARD_THEME,
    botDifficulty: "medium",
  };
}

export function normalizeGameSetup(setup: GameSetupInput): GameSetup {
  return {
    ...setup,
    boardTheme: normalizeBoardTheme(setup.boardTheme),
    botDifficulty: setup.botDifficulty ?? "medium",
    pieceTheme: normalizePieceTheme(setup.pieceTheme),
  };
}
