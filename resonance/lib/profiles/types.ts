export interface Profile {
  worldId: string;
  userId: string;
  displayName: string;
  avatarConfig: Record<string, unknown>;
  bio: string | null;
}
