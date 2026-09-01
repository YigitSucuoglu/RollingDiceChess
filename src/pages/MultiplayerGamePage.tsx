import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import OnlineMatchSession from "../application/matches/OnlineMatchSession";
import type { OnlineMatchPresentation } from "../application/matches/OnlineMatchSession";
import { getMultiplayerMatchPort } from "../bootstrap/MultiplayerMatch";
import gameManager from "../bootstrap/GameManager";
import Board from "../components/Board/Board";
import { systemScheduler, systemTimeSource } from "../infrastructure/local/LocalPlatformAdapters";
import "./GamePage.css";

export default function MultiplayerGamePage() {
  const { matchId } = useParams();
  const { t } = useTranslation();
  const [session, setSession] = useState<OnlineMatchSession | null>(null);
  const [presentation, setPresentation] = useState<OnlineMatchPresentation | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;
    let retryTimer: number | null = null;
    let createdSession: OnlineMatchSession | null = null;
    let unsubscribePresentation: (() => void) | null = null;
    const port = getMultiplayerMatchPort();
    const load = async () => {
      try {
        const snapshot = await port.request({ action: "snapshot", matchId });
        if (cancelled) return;
        if (snapshot.status === "initializing" || !snapshot.game || !snapshot.ownSide) {
          retryTimer = window.setTimeout(() => void load(), 750);
          return;
        }
        const localAppearance = gameManager.getSession().configuration;
        createdSession = new OnlineMatchSession(snapshot, port, {
          pieceSet: localAppearance.pieceSet,
          boardTheme: localAppearance.boardTheme,
        }, {
          scheduler: systemScheduler,
          timeSource: systemTimeSource,
          isNetworkOnline: () => navigator.onLine,
        });
        setPresentation(createdSession.presentation);
        unsubscribePresentation = createdSession.subscribe(() => {
          if (!cancelled && createdSession) setPresentation(createdSession.presentation);
        });
        setSession(createdSession);
      } catch {
        if (!cancelled) setFailed(true);
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      unsubscribePresentation?.();
      createdSession?.dispose();
    };
  }, [matchId]);

  useEffect(() => { document.title = t("multiplayer.gameBrowserTitle"); }, [t]);

  if (failed || !matchId) return <Navigate replace to="/multiplayer" />;
  if (!session || !presentation) return <main className="game-page"><div className="route-loading" aria-label={t("common.status.loading")} role="status" /></main>;
  return <main className="game-page"><Board onlinePresentation={presentation} sessionOverride={session} /></main>;
}
