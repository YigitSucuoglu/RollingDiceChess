import {
  MultiplayerLobbyError,
  type MultiplayerLobbyPort,
} from "../../application/multiplayer/MultiplayerLobbyPort";

export class UnavailableMultiplayerLobbyAdapter implements MultiplayerLobbyPort {
  public isAvailable(): boolean { return false; }
  private fail(): never { throw new MultiplayerLobbyError("not-configured"); }
  public async listOpenLobbies(): Promise<never> { return this.fail(); }
  public async getCurrentContext(): Promise<never> { return this.fail(); }
  public async getLobby(): Promise<never> { return this.fail(); }
  public async createLobby(): Promise<never> { return this.fail(); }
  public async joinPublicLobby(): Promise<never> { return this.fail(); }
  public async joinPrivateLobby(): Promise<never> { return this.fail(); }
  public async kickOpponent(): Promise<never> { return this.fail(); }
  public async leaveLobby(): Promise<never> { return this.fail(); }
  public async heartbeatLobby(): Promise<never> { return this.fail(); }
  public async recoverLegacyMatch(): Promise<never> { return this.fail(); }
  public async startMatch(): Promise<never> { return this.fail(); }
  public subscribe(): () => void { return () => undefined; }
  public dispose(): void { /* No resources. */ }
}
