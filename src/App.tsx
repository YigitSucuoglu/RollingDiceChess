import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";

import HomePage from "./pages/HomePage";
import ObservabilityRouteTracker from "./observability/ObservabilityRouteTracker";
import AuthenticationEntry from "./auth/AuthenticationEntry";
import AuthenticationProvider from "./auth/AuthenticationProvider";
import { useAuthentication } from "./auth/authentication-context";
const GamePage = lazy(() => import("./pages/GamePage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const PlaySetupPage = lazy(() => import("./pages/PlaySetupPage"));
const HowToPlayPage = lazy(() => import("./pages/HowToPlayPage"));
const ObservabilityVerificationPage = __OBSERVABILITY_TEST_MODE__
  ? lazy(() => import("./observability/ObservabilityVerificationPage"))
  : null;

function ApplicationRoutes() {
  const { initialized, session } = useAuthentication();
  if (!initialized) {
    return <div aria-label="Loading" className="route-loading" role="status" />;
  }
  if (session.state.status === "unselected" || session.state.status === "authenticating" || session.state.status === "failed") {
    return <AuthenticationEntry />;
  }
  return (
    <BrowserRouter>
      <ObservabilityRouteTracker />
      <Suspense fallback={<div aria-label="Loading" className="route-loading" role="status" />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/how-to-play" element={<HowToPlayPage />} />
          <Route path="/play" element={<PlaySetupPage />} />
          <Route path="/game" element={<GamePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          {ObservabilityVerificationPage ? (
            <Route path="/__observability-test" element={<ObservabilityVerificationPage />} />
          ) : null}
          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

function App() {
  return (
    <AuthenticationProvider>
      <ApplicationRoutes />
    </AuthenticationProvider>
  );
}

export default App;
