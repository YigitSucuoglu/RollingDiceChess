import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import "../styles/MultiplayerPage.css";

export default function LeaderboardPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  useEffect(() => { document.title = `${t("home.leaderboard")} | RouletteChess`; }, [t]);
  return <main className="multiplayer-page"><section className="multiplayer-unavailable">
    <button className="multiplayer-back" onClick={() => navigate("/")} type="button">← {t("common.actions.back")}</button>
    <p className="multiplayer-eyebrow">RouletteChess</p>
    <h1>{t("home.leaderboard")}</h1>
    <p>{t("common.status.comingSoon")}</p>
  </section></main>;
}
