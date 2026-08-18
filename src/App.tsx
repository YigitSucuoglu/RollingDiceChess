import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";

import HomePage from "./pages/HomePage";
import ObservabilityRouteTracker from "./observability/ObservabilityRouteTracker";
import AuthenticationEntry from "./auth/AuthenticationEntry";
import AuthenticationProvider from "./auth/AuthenticationProvider";
import { useAuthentication } from "./auth/authentication-context";
import UsernameOnboarding, { AccountProfileUnavailable } from "./auth/UsernameOnboarding";
import playerProfileService from "./profile/PlayerProfileService";
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
  const [, setProfileRevision] = useState(0);
  useEffect(
    () => playerProfileService.subscribe(() => setProfileRevision((value) => value + 1)),
    [],
  );
  if (!initialized) {
    return <div aria-label="Loading" className="route-loading" role="status" />;
  }
  if (session.state.status === "unselected" || session.state.status === "authenticating" || session.state.status === "failed") {
    return <AuthenticationEntry />;
  }
  if (session.state.status === "authenticated") {
    const profileStatus = playerProfileService.getCanonicalProfileStatus();
    if (profileStatus === "loading" || profileStatus === "not-applicable") {
      return <div aria-label="Loading" className="route-loading" role="status" />;
    }
    if (profileStatus === "unavailable") return <AccountProfileUnavailable />;
    if (playerProfileService.getProfile().usernameOnboardingRequired) {
      return <UsernameOnboarding />;
    }
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
