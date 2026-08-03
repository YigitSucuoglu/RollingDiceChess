# RouletteChess Sound Assets

The temporary procedural WAV effects were removed in CLEANUP-01B.

The sound IDs, `SOUND_CATALOG`, `SoundManager`, master toggle, preference
persistence, and gameplay call sites remain active. Catalog entries use a
`null` source until production assets are added; playback is intentionally a
silent no-op and performs no browser audio or network request.

Future production sound assets should be added here and connected through
`src/config/sounds.ts` without changing gameplay event call sites.
