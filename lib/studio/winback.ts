// Human-written operational winback template, consent filtering and separate ephemeral coaching.
// Model output has no proposal-write or send path. Human approval still precedes every send.

import { completeRaw } from '@/lib/ai/complete'
import { aiAvailable, featureOverBudget } from '@/lib/ai/usage'
import { aiRateLimited } from '@/lib/ai/rate-limit'

import { withVoice } from '@/lib/ai/voice'

const FEATURE = 'studio-winback'

export const LAPSE_DAYS = 14

export interface WinbackCandidate {
  profileId: string
  email: string
  displayName: string | null
}

interface WinbackDraft {
  subject: string
  body: string
}

// Existing human-written operational template. The model never supplies these fields.
export function deterministicWinback(name: string): WinbackDraft {
  const lead = name?.trim() || 'there'
  return {
    subject: "A five-minute restart, when you're ready",
    body: `Hi ${lead}, it's been a couple of weeks since your last practice. Five minutes today starts a new streak, and everything you've earned is still in your Vault.`,
  }
}

// Consent gate, factored out for testing: keep only candidates allowed to receive
// a lifecycle email. `consents` is injected (the real one is the unified send-gate,
// `resolveSendGate(id, 'email', 'lifecycle')` in lib/studio/agent.ts — never the bare
// preference read, which is not a consent check) so the test can stub it deterministically.
export async function filterByConsent(
  candidates: WinbackCandidate[],
  consents: (profileId: string) => Promise<boolean>,
): Promise<WinbackCandidate[]> {
  // Resolve every consent check in parallel rather than one-at-a-time (site-audit PERF-2): each
  // check is its own DB read, so a serial loop was O(n) round-trips. Order + result are preserved.
  const decisions = await Promise.all(candidates.map((c) => consents(c.profileId)))
  return candidates.filter((_, i) => decisions[i])
}

/** This guidance is transient operator review text. It is never a draft or a stored action payload. */
export interface WinbackCoaching { questions: string[]; source: 'coach' | 'checklist' }
const CHECKLIST = [
  'What useful reason does someone have to return, without assuming why they paused?',
  'Which consent and suppression checks must pass before this invitation is approved?',
  'How will you learn whether the invitation helped without treating an open as a return?',
]
const REVIEW_QUESTIONS = Object.freeze({ reason: CHECKLIST[0], consent: CHECKLIST[1], measurement: CHECKLIST[2] })
function coachingQuestions(text: string): string[] | null {
  try {
    const value: unknown = JSON.parse(text)
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1 || !Object.hasOwn(value, 'questionIds')) return null
    const ids = (value as { questionIds?: unknown }).questionIds
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 3 || ids.some(id => typeof id !== 'string' || !Object.hasOwn(REVIEW_QUESTIONS, id))) return null
    return [...new Set(ids as (keyof typeof REVIEW_QUESTIONS)[])].map(id => REVIEW_QUESTIONS[id])
  } catch { return null }
}

/** No recipient data crosses this boundary. The model selects reviewed IDs only; no write/send path. */
export async function coachWinbackReview(actorId: string): Promise<WinbackCoaching> {
  const fallback: WinbackCoaching = { questions: [...CHECKLIST], source: 'checklist' }
  if (!actorId || !(await aiAvailable()) || (await featureOverBudget(FEATURE)) || (await aiRateLimited(FEATURE, actorId))) return fallback
  try {
    const response = await completeRaw({
      accounting: { feature: FEATURE, profileId: actorId }, tier: 'haiku', maxTokens: 350,
      system: withVoice('Coach a human operator reviewing a lifecycle invitation. Ask questions about relevance, consent, friction and how a useful return would be measured. Do not write email subjects, bodies, offers or recipient-facing copy. Do not infer why anyone paused or invent statistics. Return only JSON with one questionIds array containing one to three distinct reviewed IDs. Choose relevant considerations from ' + JSON.stringify(REVIEW_QUESTIONS) + '. Return IDs only; the server supplies the reviewed words. No question wording, checks or other fields.'),
      messages: [{ role: 'user', content: 'Help the operator review an existing human-written operational template. No individual recipient evidence is provided. Ask coaching questions only.' }],
    })
    const questions = coachingQuestions(response.text)
    return questions ? { source: 'coach', questions } : fallback
  } catch { return fallback }
}

/** Only this server-owned template version may flow through the winback proposal send door.
 * Older unattributed/model drafts wait for a new human-reviewed proposal; no silent rewrite. */
export function isOperationalWinbackPayload(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const payload = value as Record<string, unknown>
  if (payload.copySource !== 'operational_winback_v1' || typeof payload.templateName !== 'string') return false
  const expected = deterministicWinback(payload.templateName)
  return payload.subject === expected.subject && payload.body === expected.body
}
