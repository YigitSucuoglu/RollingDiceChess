# RouletteChess v1.0.0 — Singleplayer Release

RouletteChess v1.0.0 is the first official singleplayer release. It combines chess-piece movement with a roulette-driven turn system: each roll determines the three piece types available for that turn.

## Highlights

- Singleplayer matches against Easy, Medium, or Hard bot opponents.
- Configurable player side, piece set, board theme, and chess-clock time control.
- Roulette reveal, remaining-move rights, legal move guidance, captures, promotion, castling, and en passant.
- Perspective-aware board coordinates and a scrollable two-column move history.
- Local profile, statistics, XP progression, and persistent settings.
- Responsive desktop and mobile web interface with English and Turkish support.
- Privacy-safe production error reporting and optimized production image delivery.

## Rules and known limitations

- A match ends when a king is captured or a player's clock expires.
- Classical check, checkmate, stalemate, and standard draw rules are intentionally not implemented.
- The release is singleplayer only; multiplayer, accounts, authentication, and cloud sync are not included. Profile and settings data remain browser-local.
- Production audio assets are not yet available; the sound system safely remains silent.
- Physical iPhone/Safari and physical Android qualification are accepted untested gaps; Android Chromium emulation passed.
- Enforcing Content Security Policy and the existing P2/P3 performance and visual-polish backlog remain future hardening work.

## Release qualification

The qualified v0.11.7 release-candidate line was promoted to v1.0.0 through version and release-documentation changes only. Qualification is **GO**, with no known P0 or P1 issue.
