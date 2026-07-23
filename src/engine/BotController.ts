import type Game from "./Game";
import type { Move, PieceColor } from "../types/Chess";
import { createSimulationState } from "./Simulation";
import HeuristicSequenceSelector from "./HeuristicSequenceSelector";
import TurnSequenceGenerator from "./TurnSequenceGenerator";
import type { TurnSequenceSelector } from "./TurnSequenceSelector";

export interface Bot {
  readonly color: PieceColor;

  playTurn(
    game: Game,
    onMove?: () => void,
    signal?: AbortSignal
  ): Promise<void>;
}

const BOT_MOVE_DELAY_MIN_MS = 1000;
const BOT_MOVE_DELAY_MAX_MS = 1500;

export default class BotController implements Bot {
  public readonly color: PieceColor;

  private readonly random: () => number;

  private readonly sequenceGenerator: TurnSequenceGenerator;

  private readonly sequenceSelector: TurnSequenceSelector;

  constructor(
    color: PieceColor,
    random: () => number = Math.random,
    sequenceGenerator: TurnSequenceGenerator = new TurnSequenceGenerator(),
    sequenceSelector: TurnSequenceSelector = new HeuristicSequenceSelector()
  ) {
    this.color = color;
    this.random = random;
    this.sequenceGenerator = sequenceGenerator;
    this.sequenceSelector = sequenceSelector;
  }

  public async playTurn(
    game: Game,
    onMove?: () => void,
    signal?: AbortSignal
  ): Promise<void> {
    const turnRoll = game.currentRoll;

    while (this.canContinueTurn(game, turnRoll, signal)) {
      const generation = this.sequenceGenerator.generate(
        createSimulationState(game)
      );

      if (generation.sequences.length === 0) {
        return;
      }

      const sequence = this.sequenceSelector.selectSequence(
        generation.sequences,
        this.color,
        this.random
      );
      let shouldReplan = false;

      for (const plannedMove of sequence.moves) {
        await this.wait(this.getRandomMoveDelay(), signal);

        if (!this.canContinueTurn(game, turnRoll, signal)) {
          return;
        }

        const currentMove = game
          .getSelectableMoves()
          .find((move) => this.movesMatch(move, plannedMove));

        if (!currentMove) {
          shouldReplan = true;
          break;
        }

        game.makeMove(currentMove);
        onMove?.();

        if (!this.canContinueTurn(game, turnRoll, signal)) {
          return;
        }
      }

      if (!shouldReplan) {
        return;
      }
    }
  }

  private canContinueTurn(
    game: Game,
    turnRoll: readonly unknown[],
    signal?: AbortSignal
  ): boolean {
    return (
      !game.isDisposed() &&
      game.isBotTurn() &&
      !game.winner &&
      game.currentRoll === turnRoll &&
      !signal?.aborted
    );
  }

  private movesMatch(first: Move, second: Move): boolean {
    return (
      first.pieceId === second.pieceId &&
      first.from.row === second.from.row &&
      first.from.col === second.from.col &&
      first.to.row === second.to.row &&
      first.to.col === second.to.col &&
      first.isCapture === second.isCapture &&
      first.isCastle === second.isCastle &&
      first.isPromotion === second.isPromotion &&
      first.isEnPassant === second.isEnPassant
    );
  }

  private getRandomMoveDelay(): number {
    const value = this.random();

    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new RangeError("Bot random source must return a value in [0, 1).");
    }

    const delayRange = BOT_MOVE_DELAY_MAX_MS - BOT_MOVE_DELAY_MIN_MS + 1;

    return BOT_MOVE_DELAY_MIN_MS + Math.floor(value * delayRange);
  }

  private wait(delayMs: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal?.aborted) {
        resolve();
        return;
      }

      const timeoutId = globalThis.setTimeout(finish, delayMs);

      function finish() {
        globalThis.clearTimeout(timeoutId);
        signal?.removeEventListener("abort", finish);
        resolve();
      }

      signal?.addEventListener("abort", finish, { once: true });
    });
  }
}
