import type Game from "./Game";
import type { PieceColor } from "../types/Chess";
import type { BotMoveSelector } from "./BotMoveSelector";
import HeuristicMoveSelector from "./HeuristicMoveSelector";

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

  private readonly moveSelector: BotMoveSelector;

  constructor(
    color: PieceColor,
    random: () => number = Math.random,
    moveSelector: BotMoveSelector = new HeuristicMoveSelector()
  ) {
    this.color = color;
    this.random = random;
    this.moveSelector = moveSelector;
  }

  public async playTurn(
    game: Game,
    onMove?: () => void,
    signal?: AbortSignal
  ): Promise<void> {
    const turnRoll = game.currentRoll;

    while (
      game.isBotTurn() &&
      !game.winner &&
      game.currentRoll === turnRoll &&
      !signal?.aborted
    ) {
      await this.wait(this.getRandomMoveDelay(), signal);

      if (
        !game.isBotTurn() ||
        game.winner ||
        game.currentRoll !== turnRoll ||
        signal?.aborted
      ) {
        return;
      }

      const selectableMoves = game.getSelectableMoves();

      if (selectableMoves.length === 0) {
        return;
      }

      const selectedMove = this.moveSelector.selectMove(
        selectableMoves,
        game.board,
        this.random
      );

      game.makeMove(selectedMove);
      onMove?.();
    }
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
