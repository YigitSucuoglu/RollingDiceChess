import Board from "../components/Board/Board";
import "./GamePage.css";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

function GamePage() {
  const { t } = useTranslation();
  useEffect(() => { document.title = t("setup.browserTitle"); }, [t]);
  return (
    <main className="game-page">
      <Board />
    </main>
  );
}

export default GamePage;
