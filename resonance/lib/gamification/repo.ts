import { createHash } from "node:crypto";
import { createServerClient } from "@/lib/supabase/server";
import { rankForPoints, type RankName } from "./ranks";

/**
 * The zaps_ledger ref_id column is a uuid, so callers that key idempotency off a
 * human-readable string (e.g. `trivia:<venue>:<round>`, `revshare:<item>:<buyer>`)
 * hash it into a stable v5-style uuid. Same seed -> same uuid, so the ledger's
 * unique (world,user,reason,ref) key dedupes retries.
 */
export function seededRefId(seed: string): string {
  const h = createHash("sha1").update(seed).digest("hex").slice(0, 32);
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    "5" + h.slice(13, 16),
    ((parseInt(h.slice(16, 17), 16) & 0x3) | 0x8).toString(16) + h.slice(17, 20),
    h.slice(20, 32),
  ].join("-");
}

export interface Season {
  id: string;
  worldId: string;
  startsAt: string;
  endsAt: string;
  theme: string | null;
}

export interface Standing {
  balance: number;
  djPoints: number;
  rank: RankName;
  seasonId: string;
}

const SEASON_WEEKS = 13;

/** The season covering now for a world, creating a 13-week one if none exists. */
export async function getOrCreateCurrentSeason(worldId: string): Promise<Season> {
  const supabase = createServerClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("seasons")
    .select("*")
    .eq("world_id", worldId)
    .lte("starts_at", now)
    .gte("ends_at", now)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (data) return toSeason(data);

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + SEASON_WEEKS * 7 * 24 * 3600 * 1000);
  const { data: created, error: insErr } = await supabase
    .from("seasons")
    .insert({ world_id: worldId, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() })
    .select("*")
    .single();
  if (insErr) throw insErr;
  return toSeason(created);
}

/**
 * Append an award. Idempotent: the unique (world,user,reason,ref) key means a
 * given play awards a user at most once. Returns true only when newly recorded.
 */
export async function awardZaps(
  worldId: string,
  userId: string,
  delta: number,
  reason: "vote_received" | "attendance" | "purchase" | "reward",
  refId: string | null,
): Promise<boolean> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("zaps_ledger")
    .upsert(
      { world_id: worldId, user_id: userId, delta, reason, ref_id: refId },
      { onConflict: "world_id,user_id,reason,ref_id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function getBalance(worldId: string, userId: string): Promise<number> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("zaps_ledger")
    .select("delta")
    .eq("world_id", worldId)
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).reduce((sum, r) => sum + (r.delta as number), 0);
}

/** Add DJ points for the season and recompute rank (read-modify-write). */
export async function addDjPoints(
  worldId: string,
  userId: string,
  seasonId: string,
  points: number,
): Promise<{ djPoints: number; rank: RankName }> {
  const supabase = createServerClient();
  const { data: existing, error } = await supabase
    .from("reputation")
    .select("dj_points")
    .eq("world_id", worldId)
    .eq("user_id", userId)
    .eq("season_id", seasonId)
    .maybeSingle();
  if (error) throw error;

  const djPoints = (existing?.dj_points ?? 0) + points;
  const rank = rankForPoints(djPoints);
  const { error: upErr } = await supabase.from("reputation").upsert(
    { world_id: worldId, user_id: userId, season_id: seasonId, dj_points: djPoints, rank },
    { onConflict: "world_id,user_id,season_id" },
  );
  if (upErr) throw upErr;
  return { djPoints, rank };
}

export async function getStanding(worldId: string, userId: string): Promise<Standing> {
  const season = await getOrCreateCurrentSeason(worldId);
  const supabase = createServerClient();
  const [balance, repRes] = await Promise.all([
    getBalance(worldId, userId),
    supabase
      .from("reputation")
      .select("dj_points, rank")
      .eq("world_id", worldId)
      .eq("user_id", userId)
      .eq("season_id", season.id)
      .maybeSingle(),
  ]);
  if (repRes.error) throw repRes.error;
  return {
    balance,
    djPoints: (repRes.data?.dj_points as number) ?? 0,
    rank: (repRes.data?.rank as RankName) ?? "Crew",
    seasonId: season.id,
  };
}

function toSeason(r: Record<string, unknown>): Season {
  return {
    id: r.id as string,
    worldId: r.world_id as string,
    startsAt: r.starts_at as string,
    endsAt: r.ends_at as string,
    theme: (r.theme as string | null) ?? null,
  };
}
