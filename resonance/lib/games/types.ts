/**
 * Mini-game framework types + realtime event names (§16).
 *
 * The game rides the SAME venue channel as the room loop (see
 * `venueTopic` in lib/sync/channels.ts). We reuse that topic and define our own
 * event-name constants here so the room's channel names stay untouched.
 *
 * Server authority: a question's `answerIndex` is part of the bank held on the
 * server. It is NEVER part of a `game:question` payload — only `game:reveal`
 * carries it, and only after the host reveals.
 */

/** A trivia question. `answerIndex` is server-only; it never ships while open. */
export interface TriviaQuestion {
  id: string;
  prompt: string;
  options: string[];
  answerIndex: number;
}

/** The session status the server walks a venue's game through. */
export type GameStatus = "idle" | "open" | "revealed";

/** Persisted live-game row for a venue (one per venue). */
export interface GameSession {
  venueId: string;
  gameKey: string;
  currentQuestionId: string | null;
  status: GameStatus;
  roundNo: number;
}

/** A player's running score in a venue. */
export interface GameScore {
  userId: string;
  points: number;
}

/** Host round actions accepted by POST /api/games/[venueId]. */
export type HostAction = "start" | "next" | "reveal" | "end";

// ---- realtime event names (reuse venueTopic; do not touch channels.ts) ------

/** A round opened: { questionId, prompt, options, roundNo }. NO answerIndex. */
export const GAME_QUESTION_EVENT = "game:question";

/** A round revealed: { questionId, answerIndex, scores }. */
export const GAME_REVEAL_EVENT = "game:reveal";

/** The game ended / reset: {}. Clients clear the board. */
export const GAME_END_EVENT = "game:end";

// ---- broadcast payload shapes ----------------------------------------------

/** Public question payload (safe to broadcast while a round is open). */
export interface QuestionPayload {
  questionId: string;
  prompt: string;
  options: string[];
  roundNo: number;
}

/** Reveal payload: the answer plus the current scoreboard. */
export interface RevealPayload {
  questionId: string;
  answerIndex: number;
  scores: GameScore[];
}
