import { createHash } from "node:crypto";
import { createServerClient } from "@/lib/supabase/server";
import { rankForPoints, type RankName } from "./ranks";

/**
 * The zaps_ledger ref_id column is a uuid, so callers that key idempotency off a
 * human-readable string (e.g. `trivia:<venue>:<round>`, `revshare:<item>:<buyer>`)
 * map it to a stable uuid. Same seed -> same uuid, so the ledger's unique
 * (world,user,reason,ref) key dedupes retries.
 *
 * This is NOT a security primitive: it is a deterministic id derivation, so the
 * digest only needs to be stable and collision-resistant. We use SHA-256 (not
 * SHA-1) and format the first 16 bytes as an RFC 9562 v8 (custom) uuid.
 */
export function seededRefId(seed: string): string {
  const h = createHash("sha256").update(seed).digest("hex").slice(0, 32);
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    "8" + h.slice(13, 16),
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

/**
 * Add DJ points for the season and recompute rank ATOMICALLY.
 *
 * Delegates to the `resonance.add_dj_points` RPC (migration 0016), which does the
 * increment-and-rank in a single `insert ... on conflict do update set
 * dj_points = dj_points + excluded.dj_points` statement. This replaces the old
 * select+add+upsert, which two concurrent awards could interleave to lose one.
 */
export async function addDjPoints(
  worldId: string,
  userId: string,
  seasonId: string,
  points: number,
): Promise<{ djPoints: number; rank: RankName }> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("add_dj_points", {
    p_world_id: worldId,
    p_user_id: userId,
    p_season_id: seasonId,
    p_points: points,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    djPoints: (row?.out_dj_points as number) ?? 0,
    rank: (row?.out_rank as RankName) ?? rankForPoints(0),
  };
}

/**
 * All-or-nothing DJ award for a finished play: credit `points` Zaps AND the same
 * DJ points in ONE transaction (RPC `resonance.award_for_play`, migration 0016).
 *
 * The ledger's unique (world,user,reason,ref) key anchors idempotency; the
 * reputation increment happens in the same transaction, so a mid-failure rolls
 * back both (never Zaps-without-points) and a retry is a no-op. `newly` is false
 * when this play was already awarded.
 */
export async function awardForPlayAtomic(
  worldId: string,
  userId: string,
  points: number,
  seasonId: string,
  refId: string,
): Promise<{ newly: boolean; djPoints: number; rank: RankName }> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("award_for_play", {
    p_world_id: worldId,
    p_user_id: userId,
    p_amount: points,
    p_season_id: seasonId,
    p_ref_id: refId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    newly: Boolean(row?.newly),
    djPoints: (row?.out_dj_points as number) ?? 0,
    rank: (row?.out_rank as RankName) ?? rankForPoints(0),
  };
}

/**
 * Atomically debit `amount` Zaps, only if the balance covers it (RPC
 * `resonance.spend_zaps`, migration 0016). A per-wallet advisory lock serializes
 * concurrent spends so two can't both read the same balance and overdraw.
 * Idempotent on (world,user,reason,ref). Returns whether it debited and the
 * resulting balance.
 */
export async function debitZaps(
  worldId: string,
  userId: string,
  amount: number,
  reason: "purchase" | "reward",
  refId: string,
): Promise<{ ok: boolean; balance: number }> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("spend_zaps", {
    p_world_id: worldId,
    p_user_id: userId,
    p_amount: amount,
    p_reason: reason,
    p_ref_id: refId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: Boolean(row?.ok), balance: (row?.balance as number) ?? 0 };
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
