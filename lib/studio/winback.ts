// Winback drafting + consent — the testable core of the AI operator's
// lapsed-member proposal (Phase 6.6 / ADR-028). Kept separate from agent.ts so
// the consent gate and the deterministic fallback are unit-testable without a DB
// or a live model. The agent stays COPILOT-GATED: these only produce a *proposed*
// draft; a human approves before anything sends (see executeAction in agent.ts).

import { completeRaw } from '@/lib/ai/complete'
import { aiEnabled } from '@/lib/ai/client'

export const LAPSE_DAYS = 14

export interface WinbackCandidate {
  profileId: string
  email: string
  displayName: string | null
}

export interface WinbackDraft {
  subject: string
  body: string
}

// Deterministic fallback — used when there's no ANTHROPIC_API_KEY or the model
// call fails/returns junk. Always available, so a winback can always be proposed.
export function deterministicWinback(name: string): WinbackDraft {
  const lead = name?.trim() || 'there'
  return {
    subject: 'We miss you at Frequency',
    body: `Hi ${lead}, it's been a couple of weeks since your last practice. A short session today is all it takes to pick your streak back up. We'd love to see you.`,
  }
}

// Consent gate, factored out for testing: keep only candidates allowed to receive
// a lifecycle email. `consents` is injected (the real one is
// `shouldSend(id, 'email', 'lifecycle')`) so the test can stub it deterministically.
export async function filterByConsent(
  candidates: WinbackCandidate[],
  consents: (profileId: string) => Promise<boolean>,
): Promise<WinbackCandidate[]> {
  const kept: WinbackCandidate[] = []
  for (const c of candidates) {
    if (await consents(c.profileId)) kept.push(c)
  }
  return kept
}

const SYSTEM_PROMPT = `You write short, warm win-back emails for Frequency, a platform for real-world community built on in-person "practices" (small recurring rituals members do together).

Voice: warm, human, specific, never salesy or guilt-trippy. No exclamation spam, no emoji, no fake urgency, no invented facts about the member.

Goal: gently invite a lapsed member back to log one practice. Keep it to 2–3 sentences.

Respond with ONLY a JSON object, no other text, no markdown fences:
{"subject": "<= 60 characters", "body": "2-3 sentence plain-text email body"}`

// Extract the first balanced top-level JSON object from a model response.
function extractJson(text: string): unknown | null {
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

function isValidDraft(v: unknown): v is WinbackDraft {
  if (!v || typeof v !== 'object') return false
  const d = v as Record<string, unknown>
  return typeof d.subject === 'string' && d.subject.trim() !== '' &&
    typeof d.body === 'string' && d.body.trim() !== ''
}

// Bounded Claude drafter. Returns null (→ caller uses the deterministic fallback)
// when AI is off, the call errors, or the output doesn't parse to a valid
// {subject, body}. The model only DRAFTS copy; it never sends. Routes through the
// shared AI chokepoint (lib/ai/complete) so the provider/model tier is governed in
// one place — no per-call SDK instance, no hardcoded model id (the opus tier here
// is the same 'claude-opus-4-8' as before).
export async function draftWinbackWithClaude(
  name: string,
  opts: { lapseDays?: number } = {},
): Promise<WinbackDraft | null> {
  if (!aiEnabled()) return null

  const lead = name?.trim() || 'there'
  const lapseDays = opts.lapseDays ?? LAPSE_DAYS

  try {
    const res = await completeRaw({
      tier: 'opus',
      maxTokens: 400,
      cacheSystem: true,
      // Simple, single-shot generation — no thinking needed. Respond with the
      // final JSON only (the prompt constrains the shape; we still parse defensively).
      thinking: { type: 'disabled' },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Member's first name: ${lead}. They have no verified practice in the last ${lapseDays} days. Write their win-back email.`,
        },
      ],
    })
    const parsed = extractJson(res.text)
    if (isValidDraft(parsed)) {
      return { subject: parsed.subject.trim().slice(0, 120), body: parsed.body.trim() }
    }
    return null
  } catch {
    // AI off (AiUnavailableError) or a transient failure: caller uses the
    // deterministic fallback. The model only ever drafts; it never sends.
    return null
  }
}
