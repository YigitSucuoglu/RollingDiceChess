import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { CurrentPlayerRank, RankedLeaderboardEntry } from "../application/leaderboard/LeaderboardContracts";
import { createLeaderboardService } from "../bootstrap/Leaderboard";
import "../styles/LeaderboardPage.css";

function Identity({ discriminator, username }: Pick<RankedLeaderboardEntry, "discriminator" | "username">) {
  return <span className="leaderboard-identity"><strong title={username}>{username}</strong><span>#{discriminator}</span></span>;
}
function PodiumPlayer({ entry }: { readonly entry: RankedLeaderboardEntry }) {
  return <li className={`leaderboard-podium-player rank-${entry.rank}${entry.isCurrentPlayer ? " is-current" : ""}`}>
    <span className="leaderboard-medal" aria-hidden="true">{entry.rank === 1 ? "♛" : "◆"}</span>
    <span className="leaderboard-podium-rank">#{entry.rank}</span><Identity {...entry} />
    <span className="leaderboard-rating">{entry.rating}</span>
  </li>;
}
function RankedRow({ entry, currentLabel }: { readonly entry: RankedLeaderboardEntry; readonly currentLabel?: string }) {
  return <li className={`leaderboard-row${entry.isCurrentPlayer ? " is-current" : ""}`}>
    <span className="leaderboard-row-rank">#{entry.rank}</span><Identity {...entry} />
    {entry.isCurrentPlayer && currentLabel && <span className="leaderboard-you">{currentLabel}</span>}
    <span className="leaderboard-rating">{entry.rating}</span>
  </li>;
}
function CurrentRankCard({ player, label, you }: { readonly player: CurrentPlayerRank & { readonly rank: number }; readonly label: string; readonly you: string }) {
  return <section className="leaderboard-rank-card" aria-labelledby="your-rank-title">
    <p id="your-rank-title" className="leaderboard-section-label">{label}</p>
    <RankedRow currentLabel={you} entry={{ ...player, isCurrentPlayer: true }} />
  </section>;
}
function Skeleton({ loadingLabel }: { readonly loadingLabel: string }) {
  return <div className="leaderboard-skeleton" role="status" aria-label={loadingLabel}>
    <div className="leaderboard-skeleton-podium" />
    {Array.from({ length: 6 }, (_, index) => <div className="leaderboard-skeleton-row" key={index} />)}
  </div>;
}

export default function LeaderboardPage() {
  const navigate = useNavigate(); const { t } = useTranslation();
  const service = useMemo(() => createLeaderboardService(), []);
  const state = useSyncExternalStore((listener) => service.subscribe(listener), () => service.getState());
  useEffect(() => { document.title = `${t("home.leaderboard")} | RouletteChess`; }, [t]);
  useEffect(() => { void service.load(); }, [service]);
  const loading = state.top.status === "loading" || state.currentPlayer.status === "loading";
  const topEntries = state.top.status === "success" ? state.top.entries : [];
  const podiumEntries = topEntries.slice(0, 3); const listEntries = topEntries.slice(3);
  const currentPlayerIsInTop = topEntries.some((entry) => entry.isCurrentPlayer);

  return <main className="leaderboard-page"><div className="leaderboard-shell">
    <header className="leaderboard-header">
      <button className="leaderboard-back" onClick={() => navigate("/")} type="button">← {t("common.actions.back")}</button>
      <div><p className="leaderboard-eyebrow">RouletteChess</p><h1>{t("home.leaderboard")}</h1></div>
      <button className="leaderboard-refresh" disabled={loading} onClick={() => void service.revalidate()} type="button">{loading ? t("common.status.loading") : t("leaderboard.refresh")}</button>
    </header>
    {state.currentPlayer.status === "qualified" && !currentPlayerIsInTop && <CurrentRankCard label={t("leaderboard.yourRankLabel")} player={state.currentPlayer.player} you={t("leaderboard.you")} />}
    {state.currentPlayer.status === "unqualified" && <section className="leaderboard-qualification" aria-label={t("leaderboard.yourRankLabel")}><p className="leaderboard-section-label">{t("leaderboard.yourRankLabel")}</p><p>{t("leaderboard.unqualified")}</p></section>}
    {state.currentPlayer.status === "error" && <section className="leaderboard-inline-error" role="alert"><p>{t("leaderboard.rankError")}</p><button onClick={() => void service.revalidate()} type="button">{t("common.actions.retry")}</button></section>}
    <section className="leaderboard-board" aria-labelledby="top-100-title">
      <div className="leaderboard-board-heading"><p className="leaderboard-section-label">{t("leaderboard.globalRankings")}</p><h2 id="top-100-title">{t("leaderboard.top100")}</h2></div>
      {state.top.status === "loading" && <Skeleton loadingLabel={t("common.status.loading")} />}
      {state.top.status === "error" && <div className="leaderboard-state leaderboard-error" role="alert"><p>{t("leaderboard.topError")}</p><button onClick={() => void service.revalidate()} type="button">{t("common.actions.retry")}</button></div>}
      {state.top.status === "empty" && <div className="leaderboard-state"><span aria-hidden="true">◇</span><p>{t("leaderboard.empty")}</p></div>}
      {state.top.status === "success" && <>
        <ol className={`leaderboard-podium count-${podiumEntries.length}`} aria-label={t("leaderboard.podium")}>{podiumEntries.map((entry) => <PodiumPlayer entry={entry} key={`${entry.rank}-${entry.discriminator}`} />)}</ol>
        {listEntries.length > 0 && <ol className="leaderboard-list" aria-label={t("leaderboard.top100")} start={4}>{listEntries.map((entry) => <RankedRow currentLabel={t("leaderboard.you")} entry={entry} key={`${entry.rank}-${entry.discriminator}`} />)}</ol>}
      </>}
    </section>
  </div></main>;
}
