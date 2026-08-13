import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { AuthenticationPort } from "../application/auth/AuthenticationPort";
import authentication from "../bootstrap/Authentication";
import { AuthenticationContext } from "./authentication-context";

export default function AuthenticationProvider({
  children,
  port = authentication,
}: {
  readonly children: ReactNode;
  readonly port?: AuthenticationPort;
}) {
  const [session, setSession] = useState(() => port.getSession());
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    let active = true;
    const unsubscribe = port.subscribe((nextSession) => {
      if (active) setSession(nextSession);
    });
    void port.restoreSession()
      .then((restoredSession) => {
        if (active) setSession(restoredSession);
      })
      .finally(() => {
        if (active) setInitialized(true);
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [port]);

  const value = useMemo(
    () => ({ authentication: port, initialized, session }),
    [initialized, port, session],
  );
  return (
    <AuthenticationContext.Provider value={value}>
      {children}
    </AuthenticationContext.Provider>
  );
}
