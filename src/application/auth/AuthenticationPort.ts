import type { AuthenticationSession } from "./AuthenticationContracts";

export type AuthenticationStateListener = (
  session: AuthenticationSession,
) => void;

export interface AuthenticationPort {
  isAuthenticationAvailable(): boolean;
  getSession(): AuthenticationSession;
  restoreSession(): Promise<AuthenticationSession>;
  subscribe(listener: AuthenticationStateListener): () => void;
  chooseGuest(): Promise<AuthenticationSession>;
  beginAuthentication(): Promise<AuthenticationSession>;
  signOut(): Promise<AuthenticationSession>;
  dispose(): void;
}
