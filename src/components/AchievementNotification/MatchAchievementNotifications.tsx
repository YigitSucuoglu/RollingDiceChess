import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { AchievementNotificationQueue } from "../../application/achievements/AchievementNotificationQueue";
import type { AchievementCollection } from "../../application/achievements/AchievementRead";
import LocalBotMatchSession from "../../application/matches/LocalBotMatchSession";
import { useAuthentication } from "../../auth/authentication-context";
import { createAchievementReadService } from "../../bootstrap/Achievements";
import { ACHIEVEMENT_DEFINITIONS } from "../../domain/achievements/AchievementCatalog";
import type { AchievementId } from "../../domain/achievements/AchievementContracts";
import type { MatchConfiguration, MatchSession, MatchSnapshot } from "../../domain/contracts/MatchContracts";
import playerProfileService from "../../profile/PlayerProfileService";
import GoldenProgressReveal from "./GoldenProgressReveal";

interface Props {
  readonly session: MatchSession & { readonly configuration: MatchConfiguration };
  readonly snapshot: MatchSnapshot;
  readonly children: ReactNode;
}

const EMPTY_COLLECTION: AchievementCollection = { catalogVersion: 1, unlockedCount: 0, unlocks: [] };
const BASELINE_TIMEOUT_MS = 5000;
const TERMINAL_CHECK_TIMEOUT_MS = 8000;

export default function MatchAchievementNotifications({ session, snapshot, children }: Props) {
  const { session: authenticationSession } = useAuthentication();
  const authScope = authenticationSession.state.status === "authenticated"
    ? `account:${authenticationSession.state.account.accountId}`
    : authenticationSession.state.status === "guest" && authenticationSession.state.persistence === "cloud"
      ? `guest:${authenticationSession.state.guestSessionId}` : null;
  const owner = authScope && playerProfileService.getCanonicalProfileStatus() === "ready"
    ? `${authScope}:${playerProfileService.getProfile().playerId}` : null;
  const sessionKey = session.configuration.mode === "online" ? session.configuration.authoritativeMatchId : "local";
  return <NotificationSession key={`${session.configuration.mode}:${sessionKey}:${owner ?? "none"}`}
    session={session} snapshot={snapshot} owner={owner}>{children}</NotificationSession>;
}

function NotificationSession({ session, snapshot, owner, children }: Props & { readonly owner: string | null }) {
  const reader = useMemo(() => createAchievementReadService(), []);
  const controller = useMemo(() => new AchievementNotificationQueue({
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
  }), []);
  const [baselineReady, setBaselineReady] = useState(false);
  const [baselineFinished, setBaselineFinished] = useState(false);
  const [resolved, setResolved] = useState(false);
  const [startedActive] = useState(() => snapshot.lifecycle === "active");
  const [notifications, setNotifications] = useState<readonly AchievementId[]>([]);
  const observedActive = useRef(false);
  const terminalRequested = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timedOut = false;
    let timeout: number | undefined;
    controller.setOwner(owner);
    reader.setOwner(owner, !owner);
    observedActive.current = snapshot.lifecycle === "active";
    terminalRequested.current = false;
    if (owner && snapshot.lifecycle === "active") {
      timeout = window.setTimeout(() => {
        timedOut = true;
        setBaselineFinished(true);
      }, BASELINE_TIMEOUT_MS);
      void reader.load().then(() => {
        if (timeout !== undefined) window.clearTimeout(timeout);
        if (cancelled || timedOut) return;
        const state = reader.getState();
        const collection = state.status === "success" ? state.collection
          : state.status === "empty" ? EMPTY_COLLECTION : null;
        if (collection && controller.prime(owner, collection)) setBaselineReady(true);
        setBaselineFinished(true);
      });
    }
    return () => {
      cancelled = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
    // A new session/owner resets the pre-match baseline; later snapshot revisions must not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, owner, controller, reader]);

  useEffect(() => {
    if (snapshot.lifecycle === "active") observedActive.current = true;
    if (!owner || !baselineReady || !observedActive.current || terminalRequested.current
        || snapshot.lifecycle !== "completed" || !snapshot.winner
        || snapshot.terminationReason === "technical-abort") return;
    const matchId = session.configuration.mode === "online"
      ? session.configuration.authoritativeMatchId
      : session instanceof LocalBotMatchSession ? session.getSingleMatchAchievementSnapshot()?.matchId : null;
    if (!matchId) return;
    const canonicalOwner = owner;
    terminalRequested.current = true;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      cancelled = true;
      setResolved(true);
    }, TERMINAL_CHECK_TIMEOUT_MS);
    void (async () => {
      try {
        if (session.configuration.mode === "bot") {
          const completed = session instanceof LocalBotMatchSession
            ? session.getSingleMatchAchievementSnapshot() : null;
          if (!completed?.valid || !completed.complete || completed.status !== "completed"
              || (completed.terminationReason !== "king-captured" && completed.terminationReason !== "timeout")) return;
          if (!await playerProfileService.hasSettledCurrentCompletions()) return;
        }
        await reader.load();
        if (cancelled) return;
        const state = reader.getState();
        const collection = state.status === "success" ? state.collection
          : state.status === "empty" ? EMPTY_COLLECTION : null;
        if (!collection) return;
        setNotifications(controller.resolveTerminal(canonicalOwner, matchId, collection));
      } catch {
        // Achievement reads must never prevent the normal result screen.
      } finally {
        window.clearTimeout(timeout);
        if (!cancelled) setResolved(true);
      }
    })();
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [baselineReady, controller, owner, reader, session, snapshot.lifecycle, snapshot.terminationReason, snapshot.winner]);

  const current = notifications[0];
  const completed = snapshot.lifecycle === "completed" && Boolean(snapshot.winner);
  const hasMatchIdentity = session.configuration.mode === "online"
    ? Boolean(session.configuration.authoritativeMatchId)
    : session instanceof LocalBotMatchSession && Boolean(session.getSingleMatchAchievementSnapshot()?.matchId);
  const eligible = completed && owner && startedActive && hasMatchIdentity
    && snapshot.terminationReason !== "technical-abort";
  const waitingForBaseline = eligible && !baselineFinished;
  const checkingUnlocks = eligible && baselineReady && !resolved;
  if (current) return <GoldenProgressReveal achievement={ACHIEVEMENT_DEFINITIONS[current]}
    key={current} manualDismiss onFinished={() => setNotifications((items) => items.slice(1))} />;
  return waitingForBaseline || checkingUnlocks ? null : children;
}
