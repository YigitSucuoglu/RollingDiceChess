import { AchievementReadError, parseAchievementCollection, type AchievementCollection, type AchievementReadPort } from "../../application/achievements/AchievementRead";

interface AchievementRpcClient {
  rpc(name: string): PromiseLike<{ readonly data: unknown; readonly error: { readonly code?: string } | null }>;
}

export class SupabaseAchievementReadAdapter implements AchievementReadPort {
  private readonly client: AchievementRpcClient;
  public constructor(client: AchievementRpcClient) { this.client = client; }

  public async fetchCurrent(): Promise<AchievementCollection> {
    const { data, error } = await this.client.rpc("get_current_player_achievements");
    if (error) throw new AchievementReadError("unavailable");
    return parseAchievementCollection(data);
  }
}
