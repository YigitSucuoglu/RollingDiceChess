import type { MultiplayerMatchIntent, MultiplayerMatchPort, MultiplayerServerSnapshot } from "../../application/multiplayer/MultiplayerMatchPort";
import { applyAuthoritativeMove, createAuthoritativeInitialState } from "../../application/multiplayer/AuthoritativeMatchEngine";

const MATCH_ID = "33333333-3333-4333-8333-333333333333";
const white = { displayName: "Yigit", publicDiscriminator: "19F1P", multiplayerRating: 1248 };
const black = { displayName: "Guest4921", publicDiscriminator: "7K2M9", multiplayerRating: 1032 };

export class E2EMultiplayerMatchAdapter implements MultiplayerMatchPort {
  private game = createAuthoritativeInitialState(() => 0);
  private revision = 1;
  private status: MultiplayerServerSnapshot["status"] = "active";
  private winner: MultiplayerServerSnapshot["winner"] = null;
  private terminationReason: MultiplayerServerSnapshot["terminationReason"] = null;

  public async request(intent: MultiplayerMatchIntent): Promise<MultiplayerServerSnapshot> {
    if (intent.matchId !== MATCH_ID) throw new Error("match-unavailable");
    if (intent.action === "move") {
      if (intent.expectedRevision !== this.revision) throw new Error("stale-revision");
      const result = applyAuthoritativeMove(this.game, intent.from, intent.to, () => 0);
      this.game = result.state;
      this.revision++;
    } else if (intent.action === "forfeit") {
      this.status = "terminal";
      this.winner = "black";
      this.terminationReason = "forfeit";
      this.revision++;
    }
    return this.snapshot();
  }

  public subscribe(): () => void { return () => undefined; }

  private snapshot(): MultiplayerServerSnapshot {
    const now = new Date();
    const ownSide = window.localStorage.getItem("roulettechess.e2e-multiplayer-side") === "black" ? "black" : "white";
    return {
      schemaVersion: 1,
      matchId: MATCH_ID,
      revision: this.revision,
      status: this.status,
      mode: "ranked",
      ownSide,
      white,
      black,
      timeControl: { id: "blitz-5-1", initialMs: 300_000, incrementMs: 1_000 },
      game: this.game,
      clock: {
        whiteRemainingMs: 300_000,
        blackRemainingMs: 300_000,
        activeTurnStartedAt: now.toISOString(),
        serverNow: now.toISOString(),
      },
      connections: { whiteReconnectDeadline: null, blackReconnectDeadline: null },
      winner: this.winner,
      terminationReason: this.terminationReason,
    };
  }
}
