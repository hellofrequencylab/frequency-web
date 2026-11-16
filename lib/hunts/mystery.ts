/**
 * Mystery answers (FH-042): the server-only check of a typed answer, with a hard attempt limit.
 * No database and no Next here; lib/hunts/claim-store.ts owns the reads and the attempt ledger.
 *
 * - The answer is never stored and never leaves the server. A mission holds `answer_hash`
 *   (`s1:<salt>:<digest>`, scrypt over the normalised answer with a random salt per mission), and
 *   no player read selects that column: lib/hunts/run-store.ts loads title, clue and hint only.
 * - The compare is constant time, and a stored value that cannot be read costs the same work as one
 *   that can, so a response time says nothing about the answer or about how the mission is set up.
 * - Attempts are bounded. The caller records each verdict under a numbered attempt that the database
 *   allows once, and drops a verdict it could not record, so a player learns the outcome of at most
 *   MAX_ANSWER_ATTEMPTS guesses, parallel requests included.
 * - A wrong guess earns the fallback hint from the second attempt on. When the attempts are gone the
 *   answer is locked for that run and the player goes on through the mission's fallback path
 *   (lib/hunts/graph/branches.ts); validateGraph refuses a Mystery that has none.
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

/** Judged guesses one run gets at one Mystery. */
export const MAX_ANSWER_ATTEMPTS = 5
/** The fallback hint shows once this many guesses have been judged wrong. */
const HINT_AFTER_ATTEMPTS = 2
/** Longer input is cut before hashing, so a huge body cannot buy unbounded work. */
const MAX_ANSWER_LENGTH = 120

const SCHEME = 's1'
const DIGEST_BYTES = 32
const DUMMY_SALT = Buffer.alloc(16)

/** What makes two spellings the same answer: Unicode form, case, and runs of whitespace. */
function normalizeAnswer(raw: string): string {
  return raw.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ').slice(0, MAX_ANSWER_LENGTH)
}

const digest = (normalized: string, salt: Buffer): Buffer => scryptSync(normalized, salt, DIGEST_BYTES)

/** The value to store in hunt_missions.answer_hash for an answer. Authoring calls this; nothing stores the answer. */
export function hashAnswer(answer: string, salt: Buffer = randomBytes(16)): string {
  return `${SCHEME}:${salt.toString('hex')}:${digest(normalizeAnswer(answer), salt).toString('hex')}`
}

/** Does the attempt match the stored hash? Constant time; an unreadable stored value is a no. */
function answerMatches(stored: string | null | undefined, attempt: string): boolean {
  const parts = typeof stored === 'string' ? stored.split(':') : []
  const wellFormed = parts.length === 3 && parts[0] === SCHEME && /^[0-9a-f]{32}$/.test(parts[1]) && /^[0-9a-f]{64}$/.test(parts[2])
  const salt = wellFormed ? Buffer.from(parts[1], 'hex') : DUMMY_SALT
  const expected = wellFormed ? Buffer.from(parts[2], 'hex') : Buffer.alloc(DIGEST_BYTES)
  const same = timingSafeEqual(digest(normalizeAnswer(attempt), salt), expected)
  return wellFormed && same
}

type AnswerVerdict =
  | { outcome: 'correct' }
  | { outcome: 'wrong'; attemptsLeft: number; showHint: boolean }
  /** No attempts remain. The fallback path is the way on. */
  | { outcome: 'locked'; attemptsLeft: 0; showHint: true }

/**
 * Judge one guess. `attemptsUsed` is how many attempts the run had already used BEFORE this one.
 * At or past the limit nothing is compared at all.
 */
export function judgeAnswer(input: { stored: string | null | undefined; attempt: string; attemptsUsed: number }): AnswerVerdict {
  const used = Number.isInteger(input.attemptsUsed) && input.attemptsUsed >= 0 ? input.attemptsUsed : MAX_ANSWER_ATTEMPTS
  if (used >= MAX_ANSWER_ATTEMPTS) return { outcome: 'locked', attemptsLeft: 0, showHint: true }
  if (answerMatches(input.stored, input.attempt)) return { outcome: 'correct' }
  const attemptsLeft = MAX_ANSWER_ATTEMPTS - used - 1
  if (attemptsLeft === 0) return { outcome: 'locked', attemptsLeft: 0, showHint: true }
  return { outcome: 'wrong', attemptsLeft, showHint: used + 1 >= HINT_AFTER_ATTEMPTS }
}

/**
 * FH-042S: seal the Mystery answers of a draft as it arrives from the editor, before anything reads or
 * stores it. Each `mysteries[i].answer` the resident typed becomes `answerHash` and the plain answer is
 * removed; a row with no new answer keeps the hash it had. Everything else passes through untouched for
 * lib/hunts/draft.ts `parseTrailDraft`, which keeps only a well-formed hash. Server only (node:crypto).
 */
export function sealDraftAnswers(input: unknown): unknown {
  if (!input || typeof input !== 'object' || !Array.isArray((input as { mysteries?: unknown }).mysteries)) return input
  const draft = input as Record<string, unknown> & { mysteries: unknown[] }
  return {
    ...draft,
    mysteries: draft.mysteries.map((row) => {
      if (!row || typeof row !== 'object') return row
      const { answer, ...rest } = row as Record<string, unknown>
      return typeof answer === 'string' && answer.trim() !== '' ? { ...rest, answerHash: hashAnswer(answer) } : rest
    }),
  }
}

/**
 * FH-042S: the Mysteries a run can no longer answer. `attempts` are the run's judged guesses (one per
 * `answer:<n>` claim row, `correct` as the database returns the policy_result field). A Mystery is
 * locked once MAX_ANSWER_ATTEMPTS guesses are recorded and none was right. Sorted keys.
 */
export function lockedMysteries(attempts: readonly { mission_key: string; correct: string | boolean | null }[]): string[] {
  const used = new Map<string, number>()
  const solved = new Set<string>()
  for (const a of attempts) {
    if (a.correct === true || a.correct === 'true') solved.add(a.mission_key)
    used.set(a.mission_key, (used.get(a.mission_key) ?? 0) + 1)
  }
  return [...used].filter(([k, n]) => n >= MAX_ANSWER_ATTEMPTS && !solved.has(k)).map(([k]) => k).sort()
}
