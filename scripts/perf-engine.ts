import { performance } from "node:perf_hooks";
import TurnResolver from "../src/engine/TurnResolver";
import ChessBoard from "../src/engine/ChessBoard";
import TurnRights from "../src/engine/TurnRights";
import type { Piece, PieceType } from "../src/types/Chess";
import type { SimulationState } from "../src/engine/Simulation";
import { writeReports, summarize } from "./perf-utils.mjs";
import type Game from "../src/engine/Game";
import EasyTurnPlanner from "../src/engine/EasyTurnPlanner";
import MediumTurnPlanner from "../src/engine/MediumTurnPlanner";
import HardTurnPlanner from "../src/engine/HardTurnPlanner";

let id = 0;
function fixture(types: PieceType[], open = false): SimulationState {
  const board = new ChessBoard();
  if (open) board.squares = Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null));
  const rights = new TurnRights(); for (const type of types) rights.set(type, rights.get(type) + 1);
  if (open) {
    const add = (type: PieceType, row: number, col: number) => { board.squares[row][col] = { id: `perf-${++id}`, type, color: "white", hasMoved: true, initialPosition: { row, col } }; };
    add("queen", 4, 4); add("rook", 2, 2); add("bishop", 6, 6); add("knight", 3, 1); add("king", 7, 4);
  }
  return { board, rights, currentTurn: "white", lastMove: null, winner: null };
}

const scenarios = [
  { name: "opening-pawns", state: fixture(["pawn", "pawn", "pawn"]) },
  { name: "opening-mixed", state: fixture(["pawn", "knight", "bishop"]) },
  { name: "duplicate-knights", state: fixture(["knight", "knight", "knight"]) },
  { name: "open-sliders", state: fixture(["rook", "bishop", "queen"], true) },
  { name: "duplicate-queens", state: fixture(["queen", "queen", "queen"], true) },
];
const resolver = new TurnResolver();
const warmup = 5; const iterations = 30;
const results = [];
for (const scenario of scenarios) {
  const before = JSON.stringify(scenario.state.board.squares);
  const correctness = resolver.resolve(scenario.state);
  if (correctness.maxConsumableRights < 1) throw new Error(`${scenario.name}: no continuation`);
  for (let index = 0; index < warmup; index++) resolver.resolve(scenario.state);
  const samples = [];
  for (let index = 0; index < iterations; index++) { const start = performance.now(); resolver.resolve(scenario.state); samples.push(performance.now() - start); }
  if (JSON.stringify(scenario.state.board.squares) !== before) throw new Error(`${scenario.name}: live board mutated`);
  results.push({ name: scenario.name, maxConsumableRights: correctness.maxConsumableRights, selectableMoves: correctness.selectableMoves.length, ...summarize(samples) });
}
const planners = [{ name: "easy", planner: new EasyTurnPlanner() }, { name: "medium", planner: new MediumTurnPlanner() }, { name: "hard", planner: new HardTurnPlanner() }];
const botResults = [];
for (const item of planners) {
  const benchmarkState = fixture(["pawn", "pawn", "pawn"]);
  const game = {
    board: benchmarkState.board,
    currentTurn: benchmarkState.currentTurn,
    lastMove: benchmarkState.lastMove,
    turnRights: benchmarkState.rights,
    winner: benchmarkState.winner,
    getSelectableMoves: () => resolver.resolve(benchmarkState).selectableMoves,
  } as Game;
  const before = JSON.stringify(game.board.squares);
  const initialPlan = item.planner.planTurn(game, () => 0);
  if (!initialPlan?.moves.length) throw new Error(`${item.name}: no plan`);
  for (let index = 0; index < warmup; index++) item.planner.planTurn(game, () => 0);
  const samples = [];
  for (let index = 0; index < iterations; index++) { const start = performance.now(); item.planner.planTurn(game, () => 0); samples.push(performance.now() - start); }
  if (JSON.stringify(game.board.squares) !== before) throw new Error(`${item.name}: live game mutated`);
  botResults.push({ name: item.name, selectedSequenceLength: initialPlan.moves.length, ...summarize(samples) });
}
const report = { generatedAt: new Date().toISOString(), node: process.version, warmup, iterations, unit: "ms", turnResolver: results, bots: botResults };
const markdown = `# Engine performance report\n\nNode ${process.version}; ${warmup} warm-up + ${iterations} measured iterations.\n\n| Scenario | Rights | Moves | p50 | p95 | Average | Max |\n|---|---:|---:|---:|---:|---:|---:|\n${results.map((r) => `| ${r.name} | ${r.maxConsumableRights} | ${r.selectableMoves} | ${r.p50.toFixed(3)} | ${r.p95.toFixed(3)} | ${r.average.toFixed(3)} | ${r.max.toFixed(3)} |`).join("\n")}\n\n## Bot planners\n\n| Difficulty | Sequence | p50 | p95 | Average | Max |\n|---|---:|---:|---:|---:|---:|\n${botResults.map((r) => `| ${r.name} | ${r.selectedSequenceLength} | ${r.p50.toFixed(3)} | ${r.p95.toFixed(3)} | ${r.average.toFixed(3)} | ${r.max.toFixed(3)} |`).join("\n")}\n`;
await writeReports("engine", "engine-report", report, markdown);
console.log(markdown);
