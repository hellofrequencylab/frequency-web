/**
 * Mini-game persistence (§16) — sessions + scores.
 *
 * Server-only (uses the service-role client). One session row per venue; reading
 * a venue that has never played creates an idle row so callers always get a
 * session back. Scores upsert on (venue, user) and carry `last_round` for the
 * per-round award dedupe.
 */

import { createServerClient } from "@/lib/supabase/server";
import type { GameSession, GameScore, GameStatus } from "./types";

function toSession(r: Record<string, unknown>): GameSession {
  return {
    venueId: r.venue_id as string,
    gameKey: r.game_key as string,
    currentQuestionId: (r.current_question_id as string | null) ?? null,
    status: r.status as GameStatus,
    roundNo: r.round_no as number,
  };
}

/** Get the venue's session, creating an idle row on first read. */
export async function getSession(venueId: string): Promise<GameSession> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("game_sessions")
    .select("*")
    .eq("venue_id", venueId)
    .maybeSingle();
  if (error) throw error;
  if (data) return toSession(data);

  const { data: created, error: insErr } = await supabase
    .from("game_sessions")
    .upsert({ venue_id: venueId }, { onConflict: "venue_id" })
    .select("*")
    .single();
  if (insErr) throw insErr;
  return toSession(created);
}

/** Open a question: set it current, mark 'open', bump the round number. */
export async function setQuestion(
  venueId: string,
  questionId: string,
): Promise<GameSession> {
  const current = await getSession(venueId);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("game_sessions")
    .update({
      current_question_id: questionId,
      status: "open",
      round_no: current.roundNo + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("venue_id", venueId)
    .select("*")
    .single();
  if (error) throw error;
  return toSession(data);
}

/** Mark the current question revealed. */
export async function revealSession(venueId: string): Promise<GameSession> {
  await getSession(venueId);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("game_sessions")
    .update({ status: "revealed", updated_at: new Date().toISOString() })
    .eq("venue_id", venueId)
    .select("*")
    .single();
  if (error) throw error;
  return toSession(data);
}

/** End the game: clear the question and return to idle. */
export async function endSession(venueId: string): Promise<GameSession> {
  await getSession(venueId);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("game_sessions")
    .update({
      status: "idle",
      current_question_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("venue_id", venueId)
    .select("*")
    .single();
  if (error) throw error;
  return toSession(data);
}

/**
 * Add `delta` points for a player, stamping `last_round` so the caller can guard
 * against scoring the same round twice. Read-modify-write upsert on (venue,user).
 */
export async function addScore(
  venueId: string,
  userId: string,
  delta: number,
  round: number,
): Promise<number> {
  const supabase = createServerClient();
  const { data: existing, error } = await supabase
    .from("game_scores")
    .select("points")
    .eq("venue_id", venueId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;

  const points = ((existing?.points as number | undefined) ?? 0) + delta;
  const { error: upErr } = await supabase.from("game_scores").upsert(
    {
      venue_id: venueId,
      user_id: userId,
      points,
      last_round: round,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "venue_id,user_id" },
  );
  if (upErr) throw upErr;
  return points;
}

/**
 * Whether a player has already been scored for `round` in this venue. Used to
 * make the award once-per-(venue,user,round). Reads the stamped last_round.
 */
export async function hasScoredRound(
  venueId: string,
  userId: string,
  round: number,
): Promise<boolean> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("game_scores")
    .select("last_round")
    .eq("venue_id", venueId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return ((data?.last_round as number | undefined) ?? 0) === round && round > 0;
}

/** Top scores in a venue, highest first. */
export async function topScores(
  venueId: string,
  limit = 10,
): Promise<GameScore[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("game_scores")
    .select("user_id, points")
    .eq("venue_id", venueId)
    .order("points", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    userId: r.user_id as string,
    points: r.points as number,
  }));
}
