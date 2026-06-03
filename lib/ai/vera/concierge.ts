// The onboarding concierge — Vera leading onboarding as a conversation (AI-VERA §7,
// ADR-066 Phase D). This is the DETERMINISTIC script: it always works (the doctrine's
// non-AI baseline, and the live AI kernel's fallback). When the kernel is enabled the
// loop makes it smarter, but the beats, the tools she may propose, and the "get them
// to a real thing, then step back" arc stay the same.

export type ConciergeStage = 'greet' | 'learn' | 'orient' | 'handoff' | 'done'

export interface ProposedToolCall {
  tool: string
  args: Record<string, unknown>
}

export interface ConciergeReply {
  message: string
  /** The stage AFTER this reply (what the next turn should pass in). */
  stage: ConciergeStage
  /** Write tools Vera proposes — shown to the member to confirm (never auto-run). */
  proposals: ProposedToolCall[]
  /** Quick-reply chips. */
  suggestions: string[]
  done: boolean
}

const GREETING =
  "Hey — you found us. I keep this place running. What brought you here? And don't say 'just looking,' nobody types a URL for fun."

/** The next concierge beat. Pure: (stage, what the member just said) → reply +
 *  proposed writes. Unit-tested. */
export function conciergeReply(stage: ConciergeStage, memberText: string): ConciergeReply {
  const said = memberText.trim()

  switch (stage) {
    case 'greet':
      return {
        message: GREETING,
        stage: 'learn',
        proposals: [],
        suggestions: ['New to the area', 'Looking for people', 'Just curious'],
        done: false,
      }

    case 'learn':
      return {
        message: `Got it.${said ? " I'll remember that." : ''} Here's where you find your people — pick a circle that doesn't scare you. Showing up is the whole thing.`,
        stage: 'orient',
        // Capture what they came for, to confirm into memory (propose-and-confirm).
        proposals: said ? [{ tool: 'remember_fact', args: { fact: said, category: 'goals' } }] : [],
        suggestions: ['Show me circles'],
        done: false,
      }

    case 'orient':
      return {
        message: "The easiest way in is just turning up — to a circle or a gathering. Want me to point you at a host who runs one?",
        stage: 'handoff',
        proposals: [],
        suggestions: ['Yes, introduce me', "I'll explore first"],
        done: false,
      }

    case 'handoff':
      return {
        message: "Good. You don't have to have it figured out — most folks here didn't either. I'll be around when you need me.",
        stage: 'done',
        proposals: [],
        suggestions: [],
        done: true,
      }

    case 'done':
    default:
      return { message: "You're set. Go find your people.", stage: 'done', proposals: [], suggestions: [], done: true }
  }
}
