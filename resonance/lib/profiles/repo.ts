import { createServerClient } from "@/lib/supabase/server";
import type { Profile } from "./types";

/** Server-side profile store (service role). */

export async function getProfile(
  worldId: string,
  userId: string,
): Promise<Profile | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("world_id", worldId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? toProfile(data) : null;
}

export async function upsertProfile(
  worldId: string,
  userId: string,
  fields: { displayName: string; avatarConfig?: Record<string, unknown>; bio?: string | null },
): Promise<Profile> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        world_id: worldId,
        user_id: userId,
        display_name: fields.displayName,
        avatar_config: fields.avatarConfig ?? {},
        bio: fields.bio ?? null,
      },
      { onConflict: "world_id,user_id" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return toProfile(data);
}

function toProfile(r: Record<string, unknown>): Profile {
  return {
    worldId: r.world_id as string,
    userId: r.user_id as string,
    displayName: r.display_name as string,
    avatarConfig: (r.avatar_config as Record<string, unknown>) ?? {},
    bio: (r.bio as string | null) ?? null,
  };
}
