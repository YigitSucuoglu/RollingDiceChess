import machine1x from "./machine-1x.webp";
import machine2x from "./machine-2x.webp";
import machineFallback from "./machine-fallback.png";
import machineMobile from "./machine-mobile.webp";
import lever1x from "./lever-1x.webp";
import lever2x from "./lever-2x.webp";
import leverFallback from "./lever-fallback.png";
import whiteQueen1x from "./white-queen-1x.webp";
import whiteQueen2x from "./white-queen-2x.webp";
import whiteQueenFallback from "./white-queen-fallback.png";
import blackKnight1x from "./black-knight-1x.webp";
import blackKnight2x from "./black-knight-2x.webp";
import blackKnightFallback from "./black-knight-fallback.png";
import whiteKing1x from "./white-king-1x.webp";
import whiteKing2x from "./white-king-2x.webp";
import whiteKingFallback from "./white-king-fallback.png";

export const HOME_ASSETS = {
  machine: { fallback: machineFallback, mobile: machineMobile, oneX: machine1x, twoX: machine2x, width: 624, height: 416 },
  lever: { fallback: leverFallback, oneX: lever1x, twoX: lever2x, width: 112, height: 168 },
  pieces: {
    whiteQueen: { fallback: whiteQueenFallback, oneX: whiteQueen1x, twoX: whiteQueen2x, width: 160, height: 200 },
    blackKnight: { fallback: blackKnightFallback, oneX: blackKnight1x, twoX: blackKnight2x, width: 160, height: 200 },
    whiteKing: { fallback: whiteKingFallback, oneX: whiteKing1x, twoX: whiteKing2x, width: 160, height: 200 },
  },
} as const;
