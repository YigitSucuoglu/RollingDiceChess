import { createContext, useContext } from "react";

import type { AuthenticationSession } from "../application/auth/AuthenticationContracts";
import type { AuthenticationPort } from "../application/auth/AuthenticationPort";

export interface AuthenticationContextValue {
  readonly authentication: AuthenticationPort;
  readonly initialized: boolean;
  readonly session: AuthenticationSession;
}

export const AuthenticationContext = createContext<AuthenticationContextValue | null>(null);

export function useAuthentication(): AuthenticationContextValue {
  const value = useContext(AuthenticationContext);
  if (!value) throw new Error("AuthenticationProvider is missing.");
  return value;
}
