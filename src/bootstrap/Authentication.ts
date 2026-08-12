import type { AuthenticationPort } from "../application/auth/AuthenticationPort";
import { GuestAuthenticationAdapter } from "../infrastructure/auth/GuestAuthenticationAdapter";

export function createAuthentication(): AuthenticationPort {
  return new GuestAuthenticationAdapter();
}

const authentication = createAuthentication();

export default authentication;
