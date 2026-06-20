import { NextResponse } from "next/server";
import { getAuthedUserId } from "@/lib/auth/server";
import { getVenue } from "@/lib/dj/repo";
import { awardZaps, seededRefId } from "@/lib/gamification/repo";
import { DEMO_WORLD_ID } from "@/lib/constants";
import { getSession, addScore, hasScoredRound } from "@/lib/games/repo";
import { isCorrect } from "@/lib/games/trivia";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ venueId: string }> };

/** Points + Zaps for a correct first answer in a round. */
const POINTS = 1;
const ZAPS = 3;

/**
 * Submit an answer to the open trivia round (§16), server-authoritative.
 *
 * Body: { questionId, choice }. The server loads the session, accepts only when
 * the round is 'open' and the question matches, then checks the answer key in
 * code (never on the wire). A correct first answer for this round awards points
 * AND Zaps (reason 'reward', refId trivia:<venue>:<round>). Wrong answers return
 * { correct: false } and leak nothing. The award is once-per-(venue,user,round):
 * the score row stamps last_round, so a retry can't double-pay.
 */
export async function POST(req: Request, ctx: Ctx) {
  const { venueId } = await ctx.params;
  const userId = await getAuthedUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    questionId?: string;
    choice?: number;
  };
  const { questionId, choice } = body;
  if (typeof questionId !== "string" || typeof choice !== "number") {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const session = await getSession(venueId);
  // Only the live, open question scores.
  if (session.status !== "open" || session.currentQuestionId !== questionId) {
    return NextResponse.json({ error: "round closed" }, { status: 409 });
  }

  if (!isCorrect(questionId, choice)) {
    return NextResponse.json({ correct: false });
  }

  // Already scored this round? Report correct, don't pay again.
  if (await hasScoredRound(venueId, userId, session.roundNo)) {
    return NextResponse.json({ correct: true, points: POINTS });
  }

  const points = await addScore(venueId, userId, POINTS, session.roundNo);

  // Zaps ride the existing ledger. worldId from the venue, falling back to demo.
  const venue = await getVenue(venueId);
  const worldId = venue?.worldId ?? DEMO_WORLD_ID;
  await awardZaps(
    worldId,
    userId,
    ZAPS,
    "reward",
    seededRefId(`trivia:${venueId}:${session.roundNo}:${userId}`),
  );

  return NextResponse.json({ correct: true, points });
}
