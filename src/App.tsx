import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";

import HomePage from "./pages/HomePage";
import GamePage from "./pages/GamePage";
import SettingsPage from "./pages/SettingsPage";
import ProfilePage from "./pages/ProfilePage";
import PlaySetupPage from "./pages/PlaySetupPage";
import HowToPlayPage from "./pages/HowToPlayPage";
import ObservabilityRouteTracker from "./observability/ObservabilityRouteTracker";
const ObservabilityVerificationPage = __OBSERVABILITY_TEST_MODE__
  ? lazy(() => import("./observability/ObservabilityVerificationPage"))
  : null;

function App() {
  return (
    <BrowserRouter>
      <ObservabilityRouteTracker />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/how-to-play" element={<HowToPlayPage />} />
        <Route path="/play" element={<PlaySetupPage />} />
        <Route path="/game" element={<GamePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        {ObservabilityVerificationPage ? (
          <Route
            path="/__observability-test"
            element={(
              <Suspense fallback={null}>
                <ObservabilityVerificationPage />
              </Suspense>
            )}
          />
        ) : null}
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
