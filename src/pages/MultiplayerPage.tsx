import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useAuthentication } from "../auth/authentication-context";
import multiplayerLobby from "../bootstrap/Multiplayer";
import type { CreateLobbyIntent, MultiplayerLobbySnapshot, SidePreference } from "../domain/multiplayer/MultiplayerContracts";
import { MultiplayerLobbyError, type CurrentMultiplayerContext, type OpenMultiplayerLobby } from "../application/multiplayer/MultiplayerLobbyPort";
import "../styles/MultiplayerPage.css";

const TIME_CONTROLS = [
  { id: "blitz-3-0", label: "3+0", initialMs: 180_000, incrementMs: 0 },
  { id: "blitz-5-1", label: "5+1", initialMs: 300_000, incrementMs: 1_000 },
  { id: "rapid-10-0", label: "10+0", initialMs: 600_000, incrementMs: 0 },
] as const;

type Operation = "create" | "join" | "kick" | "leave" | "start" | null;

function identity(player: MultiplayerLobbySnapshot["host"]): string {
  return `${player.displayName} #${player.publicDiscriminator}`;
}

function timeLabel(time: MultiplayerLobbySnapshot["timeControl"]): string {
  return `${Math.round(time.initialMs / 60_000)}+${Math.round(time.incrementMs / 1_000)}`;
}

function failureKey(error: unknown): string {
  if (!(error instanceof MultiplayerLobbyError)) return "multiplayer.errors.unknown";
  return {
    "already-active": "multiplayer.errors.alreadyActive",
    forbidden: "multiplayer.errors.forbidden",
    "invalid-code": "multiplayer.errors.invalidCode",
    "lobby-full": "multiplayer.errors.full",
    "lobby-unavailable": "multiplayer.errors.unavailable",
    network: "multiplayer.errors.network",
    "not-configured": "multiplayer.errors.onlineRequired",
    unknown: "multiplayer.errors.unknown",
  }[error.code];
}

export default function MultiplayerPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { session } = useAuthentication();
  const onlineIdentity = multiplayerLobby.isAvailable()
    && (session.state.status === "authenticated"
      || (session.state.status === "guest" && session.state.persistence === "cloud"));
  const [context, setContext] = useState<CurrentMultiplayerContext | null>(null);
  const [lobbies, setLobbies] = useState<readonly OpenMultiplayerLobby[]>([]);
  const [loading, setLoading] = useState(true);
  const [operation, setOperation] = useState<Operation>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [degraded, setDegraded] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showPrivate, setShowPrivate] = useState(false);
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [mode, setMode] = useState<"ranked" | "unranked">("ranked");
  const [side, setSide] = useState<SidePreference>("random");
  const [timeControlId, setTimeControlId] = useState("blitz-5-1");
  const [privateCode, setPrivateCode] = useState("");
  const [copied, setCopied] = useState(false);
  const mounted = useRef(true);
  const contextRef = useRef<CurrentMultiplayerContext | null>(null);

  useEffect(() => { contextRef.current = context; }, [context]);

  const reconcile = useCallback(async () => {
    if (!onlineIdentity) { setLoading(false); return; }
    try {
      const current = await multiplayerLobby.getCurrentContext();
      if (!mounted.current) return;
      if (current?.kind === "legacy-match") {
        await multiplayerLobby.recoverLegacyMatch(current.matchId);
        if (!mounted.current) return;
        setContext(null);
        setLobbies(await multiplayerLobby.listOpenLobbies());
        setNotice(t("multiplayer.notices.legacyRecovered"));
        setDegraded(false);
        return;
      }
      setContext(current);
      if (!current) setLobbies(await multiplayerLobby.listOpenLobbies());
      setDegraded(false);
    } catch (reason) {
      if (!mounted.current) return;
      setError(t(failureKey(reason)));
      setDegraded(true);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [onlineIdentity, t]);

  useEffect(() => {
    document.title = t("multiplayer.browserTitle");
    mounted.current = true;
    queueMicrotask(() => void reconcile());
    const unsubscribe = multiplayerLobby.subscribe((event) => {
      const current = contextRef.current;
      if (event.scope === "participant" && current?.kind === "lobby"
          && event.lobbyId === current.lobby.lobbyId) {
        void multiplayerLobby.getLobby(event.lobbyId).then(setContext).catch(() => {
          setContext(null);
          setNotice(t(event.event === "opponent-kicked"
            ? "multiplayer.notices.kicked"
            : event.event === "host-closed"
              ? "multiplayer.notices.hostClosed"
              : "multiplayer.notices.unavailable"));
          void reconcile();
        });
      } else {
        void reconcile();
      }
    });
    const recover = () => void reconcile();
    const recoveryInterval = window.setInterval(recover, 30_000);
    window.addEventListener("online", recover);
    window.addEventListener("focus", recover);
    return () => {
      mounted.current = false;
      unsubscribe();
      window.clearInterval(recoveryInterval);
      window.removeEventListener("online", recover);
      window.removeEventListener("focus", recover);
    };
  }, [reconcile, t]);

  const run = useCallback(async <T,>(name: Exclude<Operation, null>, task: () => Promise<T>, apply: (result: T) => void) => {
    if (operation) return;
    setOperation(name); setError(null); setNotice(null);
    try { apply(await task()); setDegraded(false); }
    catch (reason) { setError(t(failureKey(reason))); if (name === "join") void reconcile(); }
    finally { setOperation(null); }
  }, [operation, reconcile, t]);

  const selectedTime = useMemo(
    () => TIME_CONTROLS.find((option) => option.id === timeControlId) ?? TIME_CONTROLS[1],
    [timeControlId],
  );

  const create = (event: FormEvent) => {
    event.preventDefault();
    const intent: CreateLobbyIntent = {
      visibility, mode,
      sidePreference: mode === "ranked" ? "random" : side,
      timeControl: selectedTime,
    };
    void run("create", () => multiplayerLobby.createLobby(intent), (result) => {
      setContext(result); setShowCreate(false); setLobbies([]);
    });
  };

  const joinPrivate = (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/u.test(privateCode)) { setError(t("multiplayer.errors.invalidCode")); return; }
    void run("join", () => multiplayerLobby.joinPrivateLobby(privateCode), (result) => {
      setContext(result); setShowPrivate(false); setLobbies([]);
    });
  };

  if (!onlineIdentity) {
    return <main className="multiplayer-page"><section className="multiplayer-unavailable" aria-labelledby="multiplayer-title">
      <button className="multiplayer-back" onClick={() => navigate("/")} type="button">← {t("common.actions.back")}</button>
      <p className="multiplayer-eyebrow">RouletteChess Online</p>
      <h1 id="multiplayer-title">{t("multiplayer.title")}</h1>
      <p>{t("multiplayer.onlineRequired")}</p>
      <div className="multiplayer-unavailable-actions">
        <button onClick={() => void reconcile()} type="button">{t("common.actions.retry")}</button>
        <button onClick={() => navigate("/play")} type="button">{t("multiplayer.playSingleplayer")}</button>
      </div>
    </section></main>;
  }

  if (context?.kind === "match") {
    return <Navigate replace to={`/game/${context.matchId}`} />;
  }

  if (context?.kind === "lobby") {
    const { lobby, role } = context;
    const ready = lobby.status === "ready" && lobby.opponent;
    const leave = () => void run("leave", () => multiplayerLobby.leaveLobby(lobby.lobbyId), () => {
      setContext(null); setNotice(null); void reconcile();
    });
    return <main className="multiplayer-page"><div className="multiplayer-shell lobby-room">
      <header className="multiplayer-header">
        <span aria-hidden="true" />
        <div><p className="multiplayer-eyebrow">RouletteChess Online</p><h1>{t(lobby.visibility === "private" ? "multiplayer.privateLobby" : "multiplayer.publicLobby")}</h1></div>
        {degraded ? <span className="multiplayer-reconnecting" role="status">{t("multiplayer.reconnecting")}</span> : <span />}
      </header>

      {lobby.privateCode ? <section className="lobby-code" aria-label={t("multiplayer.lobbyCode")}>
        <span>{t("multiplayer.lobbyCode")}</span><strong aria-label={t("multiplayer.sixDigitCode", { code: lobby.privateCode })}>{lobby.privateCode}</strong>
        <button onClick={() => void navigator.clipboard?.writeText(lobby.privateCode ?? "").then(() => setCopied(true))} type="button">{t(copied ? "multiplayer.copied" : "multiplayer.copyCode")}</button>
      </section> : null}

      <section className="lobby-versus" aria-live="polite">
        <PlayerCard label={t("multiplayer.host")} player={lobby.host} />
        <div className="lobby-vs">VS</div>
        {lobby.opponent ? <PlayerCard label={t("multiplayer.opponent")} player={lobby.opponent} />
          : <div className="lobby-player lobby-player-empty"><span className="multiplayer-spinner" aria-hidden="true"/><strong>{t("multiplayer.waitingOpponent")}</strong></div>}
      </section>

      <section className="lobby-settings" aria-label={t("multiplayer.matchSettings")}>
        <span><small>{t("multiplayer.mode")}</small><strong>{t(`multiplayer.${lobby.mode}`)}</strong></span>
        <span><small>{t("multiplayer.timeControl")}</small><strong>{timeLabel(lobby.timeControl)}</strong></span>
        <span><small>{t("multiplayer.side")}</small><strong>{t(`multiplayer.${lobby.sidePreference}`)}</strong></span>
      </section>

      <div className="lobby-actions">
        {role === "host" && ready ? <>
          <button className="danger" disabled={Boolean(operation)} onClick={() => void run("kick", () => multiplayerLobby.kickOpponent(lobby.lobbyId), setContext)} type="button">{t("multiplayer.kickPlayer")}</button>
          <button className="primary" disabled={Boolean(operation)} onClick={() => void run("start", () => multiplayerLobby.startMatch(lobby.lobbyId), (result) => setContext({ kind: "match", matchId: result.matchId }))} type="button">{operation === "start" ? t("multiplayer.starting") : t("multiplayer.startMatch")}</button>
        </> : null}
        {role === "opponent" || !ready ? <button disabled={Boolean(operation)} onClick={leave} type="button">{t(role === "host" ? "multiplayer.closeLobby" : "multiplayer.leaveLobby")}</button> : null}
      </div>
      {error ? <p className="multiplayer-message error" role="alert">{error}</p> : null}
    </div></main>;
  }

  return <main className="multiplayer-page"><div className="multiplayer-shell">
    <header className="multiplayer-header">
      <button className="multiplayer-back" onClick={() => navigate("/")} type="button">← {t("common.actions.back")}</button>
      <div><p className="multiplayer-eyebrow">RouletteChess Online</p><h1>{t("multiplayer.title")}</h1></div>
      {degraded ? <span className="multiplayer-reconnecting" role="status">{t("multiplayer.reconnecting")}</span> : <span />}
    </header>
    {notice ? <p className="multiplayer-message" role="status">{notice}</p> : null}
    {error ? <p className="multiplayer-message error" role="alert">{error}</p> : null}

    <section className="multiplayer-primary-actions" aria-label={t("multiplayer.actions") }>
      <button className="primary" onClick={() => { setShowCreate((value) => !value); setShowPrivate(false); }} type="button">＋ {t("multiplayer.createLobby")}</button>
      <button onClick={() => { setShowPrivate((value) => !value); setShowCreate(false); }} type="button"># {t("multiplayer.joinPrivate")}</button>
    </section>

    {showCreate ? <form className="multiplayer-form" onSubmit={create}>
      <h2>{t("multiplayer.createLobby")}</h2>
      <Choice label={t("multiplayer.visibility")} name="visibility" value={visibility} setValue={(value) => setVisibility(value as "public" | "private")} options={["public", "private"]} t={t} />
      <Choice label={t("multiplayer.mode")} name="mode" value={mode} setValue={(value) => setMode(value as "ranked" | "unranked")} options={["ranked", "unranked"]} t={t} />
      <p className="multiplayer-hint">{t(mode === "ranked" ? "multiplayer.rankedHint" : "multiplayer.unrankedHint")}</p>
      <label>{t("multiplayer.timeControl")}<select value={timeControlId} onChange={(event) => setTimeControlId(event.target.value)}>{TIME_CONTROLS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      {mode === "ranked" ? <label>{t("multiplayer.side")}<span className="locked-choice">{t("multiplayer.random")} · {t("multiplayer.locked")}</span></label>
        : <Choice label={t("multiplayer.side")} name="side" value={side} setValue={(value) => setSide(value as SidePreference)} options={["white", "black", "random"]} t={t} />}
      <button className="primary" disabled={Boolean(operation)} type="submit">{operation === "create" ? t("multiplayer.creating") : t("multiplayer.create")}</button>
    </form> : null}

    {showPrivate ? <form className="multiplayer-form private-join" onSubmit={joinPrivate}>
      <h2>{t("multiplayer.joinPrivate")}</h2><label htmlFor="private-code">{t("multiplayer.lobbyCode")}</label>
      <input id="private-code" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" placeholder="000000" value={privateCode} onChange={(event) => setPrivateCode(event.target.value.replace(/\D/gu, "").slice(0, 6))} />
      <button className="primary" disabled={Boolean(operation) || privateCode.length !== 6} type="submit">{operation === "join" ? t("multiplayer.joining") : t("multiplayer.join")}</button>
    </form> : null}

    <section className="open-lobbies" aria-labelledby="open-lobbies-title">
      <div className="section-heading"><div><p className="multiplayer-eyebrow">{t("multiplayer.availableMatches")}</p><h2 id="open-lobbies-title">{t("multiplayer.openLobbies")}</h2></div><button onClick={() => void reconcile()} type="button">↻ {t("multiplayer.refresh")}</button></div>
      {loading ? <p className="lobby-empty" role="status">{t("common.status.loading")}</p>
        : lobbies.length === 0 ? <div className="lobby-empty"><strong>{t("multiplayer.noOpenLobbies")}</strong><span>{t("multiplayer.emptyHint")}</span></div>
          : <div className="lobby-list">{lobbies.map((item) => <article className="open-lobby-card" key={item.lobbyId}>
            <div className="lobby-card-identity"><strong>{identity(item.host)}</strong><span>{t("multiplayer.rating", { rating: item.host.multiplayerRating })}</span></div>
            <div className="lobby-card-meta"><span className={`mode-badge ${item.mode}`}>{t(`multiplayer.${item.mode}`)}</span><strong>{timeLabel(item.timeControl)}</strong><span>{item.mode === "ranked" ? t("multiplayer.randomSide") : t("multiplayer.hostSide", { side: t(`multiplayer.${item.sidePreference}`) })}</span></div>
            <button disabled={Boolean(operation)} onClick={() => void run("join", () => multiplayerLobby.joinPublicLobby(item.lobbyId), (result) => { setContext(result); setLobbies([]); })} type="button">{t("multiplayer.join")}</button>
          </article>)}</div>}
    </section>
  </div></main>;
}

function PlayerCard({ label, player }: { readonly label: string; readonly player: MultiplayerLobbySnapshot["host"] }) {
  const { t } = useTranslation();
  return <div className="lobby-player"><small>{label}</small><strong>{identity(player)}</strong><span>{t("multiplayer.rating", { rating: player.multiplayerRating })}</span></div>;
}

function Choice({ label, name, value, setValue, options, t }: { readonly label: string; readonly name: string; readonly value: string; readonly setValue: (value: string) => void; readonly options: readonly string[]; readonly t: (key: string) => string }) {
  return <fieldset><legend>{label}</legend><div className="choice-row">{options.map((option) => <label key={option}><input checked={value === option} name={name} onChange={() => setValue(option)} type="radio" value={option}/><span>{t(`multiplayer.${option}`)}</span></label>)}</div></fieldset>;
}
