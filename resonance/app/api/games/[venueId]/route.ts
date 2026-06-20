import { NextResponse } from "next/server";
import { getAuthedUserId } from "@/lib/auth/server";
import { broadcastToVenue } from "@/lib/realtime/server-broadcast";
import {
  getSession,
  setQuestion,
  revealSession,
  endSession,
  topScores,
} from "@/lib/games/repo";
import { nextQuestion, questionById, publicQuestion } from "@/lib/games/trivia";
import {
  GAME_QUESTION_EVENT,
  GAME_REVEAL_EVENT,
  GAME_END_EVENT,
  type HostAction,
} from "@/lib/games/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ venueId: string }> };

/**
 * Host round actions for Crowd Trivia (§16), server-authoritative.
 *
 * Body: { action: 'start' | 'next' | 'reveal' | 'end' }.
 * - start/next: the SERVER picks the next question, opens it, and broadcasts
 *   `game:question` WITHOUT the answer index.
 * - reveal: broadcasts `game:reveal` with the answer index + current scores.
 * - end: resets to idle and broadcasts `game:end`.
 *
 * Host-gating is a follow-up; for now any authed caller can drive the round.
 */
export async function POST(req: Request, ctx: Ctx) {
  const { venueId } = await ctx.params;
  const userId = await getAuthedUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { action?: HostAction };
  const action = body.action;

  if (action === "start" || action === "next") {
    const session = await getSession(venueId);
    const q = nextQuestion(session.currentQuestionId);
    const updated = await setQuestion(venueId, q.id);
    const pub = publicQuestion(q);
    await broadcastToVenue(venueId, GAME_QUESTION_EVENT, {
      ...pub,
      roundNo: updated.roundNo,
    });
    return NextResponse.json({ ok: true, roundNo: updated.roundNo });
  }

  if (action === "reveal") {
    const session = await getSession(venueId);
    if (!session.currentQuestionId) {
      return NextResponse.json({ error: "no open question" }, { status: 409 });
    }
    const q = questionById(session.currentQuestionId);
    if (!q) return NextResponse.json({ error: "unknown question" }, { status: 409 });
    await revealSession(venueId);
    const scores = await topScores(venueId);
    await broadcastToVenue(venueId, GAME_REVEAL_EVENT, {
      questionId: q.id,
      answerIndex: q.answerIndex,
      scores,
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "end") {
    await endSession(venueId);
    await broadcastToVenue(venueId, GAME_END_EVENT, {});
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
