# RollingDiceChess

## Project Vision

RollingDiceChess is **not** a classical chess game.

Chess is only the foundation.

The goal of this project is to build a completely new strategy game where randomness, planning and multi-move turn management coexist.

Every architectural decision should prioritize the custom game rules over traditional chess behavior.

---

# Core Design Principles

## 1. Rule correctness comes first.

If performance, convenience or code simplicity conflicts with the official RollingDiceChess rules, the rules always win.

---

## 2. Classical chess is not the authority.

Unless explicitly implemented, the following concepts DO NOT EXIST:

- Check
- Checkmate
- Stalemate
- King safety
- Pins caused by king exposure
- Draw by repetition
- Fifty-move rule
- Insufficient material

The game ends only when a king is captured.

---

## 3. Engine before UI.

The engine must never depend on React.

All game rules must be executable and testable without any UI.

React only displays the engine state.

---

## 4. Simulation is the source of truth.

Move legality must be determined by simulation.

Never hardcode gameplay exceptions if they can be solved by simulation.

---

## 5. Never invent gameplay rules.

If a rule is ambiguous:

STOP.

Do not guess.

Ask the project owner before implementing.

---

# RollingDiceChess Rules

## Turn Rights

Each turn grants movement rights instead of mandatory piece order.

Rights belong to piece TYPES, not physical pieces.

The same physical piece may consume multiple rights during the same turn.

---

## Dice

Every piece type has equal probability.

Duplicate results are allowed.

Example:

Pawn
Pawn
Knight

means

- Pawn ×2
- Knight ×1

---

## Move Order

Dice order never determines play order.

The player may use remaining rights in any order.

---

## Continuation Rule

The engine must always preserve the continuation that consumes the greatest possible number of remaining rights.

A move is illegal if it destroys a continuation that would consume more remaining rights.

If multiple continuations consume the same maximum number of rights, all of them are legal.

---

## Locked Rights

A currently unavailable right is still considered usable if another legal continuation unlocks it.

---

## Skipped Rights

If no continuation can consume a remaining right, that right is skipped automatically.

Skipped rights never prevent the turn from ending.

---

## Promotion

Promotion changes the piece type immediately.

The promotion move consumes a Pawn right.

After promotion the piece is no longer a Pawn.

It cannot consume another Pawn right.

---

## Castling

Castling consumes only one King right.

The rook movement performed during castling does not consume a Rook right.

The rook may still consume a Rook right later during the same turn.

---

## En Passant

En passant expires after the next individual move.

Not after the entire turn.

---

## King Capture

King capture immediately ends the game.

Remaining rights are abandoned.

King capture is always legal.

King capture is NOT mandatory.

---

# Architecture Principles

The project should remain modular.

Preferred responsibilities:

- ChessBoard
- MoveGenerator
- TurnRights
- Simulation
- TurnResolver
- DiceEngine
- Game

Each class should have one clear responsibility.

---

# Coding Guidelines

- Keep commits small.
- Do not modify unrelated files.
- Prefer composition over duplication.
- Prefer readability over cleverness.
- Explain architectural decisions.
- Run build before considering a task complete.
- Never commit automatically.
- Never push automatically.

---

# Development Roadmap

## Completed

- Board rendering
- Piece rendering
- Piece movement
- Sliding pieces
- Knight movement
- Castling
- Promotion
- En Passant
- Turn system
- Turn Rights
- King Capture

---

## Current Phase

Simulation Engine

---

## Next Phases

- Turn Resolver
- Dice Engine
- Dice UI
- Game Setup
- AI
- Multiplayer
- Mobile Port

---

# Long-Term Goal

The final engine should be deterministic, testable, UI-independent and capable of validating every legal RollingDiceChess turn through simulation.