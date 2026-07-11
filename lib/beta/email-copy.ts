// ============================================================================
// Beta Command Center — Wave 2: Vera's beta email copy editor. The propose→edit→
// approve loop (the creator-tips model, lib/ai/creator-tips.ts): Vera DRAFTS or
// REFINES beta email copy through withVoice(), the draft is linted against the voice
// canon, and the operator edits + saves it into a campaign DRAFT. Vera NEVER sends,
// and nothing she writes is auto-armed: her output only ever becomes a draft body,
// which still has to clear the whole Draft → Ready → Approved gate.
//
// Budget: an ADMIN analysis surface (like creator-tips) — gated by the platform AI
// switch + a per-feature daily cap, never a member budget. Server-only; the thin action
// entrypoint is in app/(main)/admin/beta/email-actions.ts.

import { writerGate } from './guard'
import { lintVoice, type VoiceViolation } from './email'
import { withVoice } from '@/lib/ai/voice'
import { completeText, AiUnavailableError } from '@/lib/ai/complete'
import { aiAvailable, featureOverBudget, recordAiUsage } from '@/lib/ai/usage'
import { ok, fail, type ActionResult } from '@/lib/action-result'

const FEATURE = 'beta-email-copy'

export type CopyMode = 'draft' | 'refine'

export interface BetaCopyRequest {
  /** 'draft' writes fresh copy from the brief; 'refine' rewrites `existing`. */
  mode: CopyMode
  /** What the email is for, in the operator's words (e.g. "invite waitlist to create an account"). */
  brief: string
  /** The current copy to refine (mode 'refine'); ignored for 'draft'. */
  existing?: string
}

export interface BetaCopyResult {
  /** The subject line Vera proposed (first line), best-effort. */
  subject: string
  /** The full body copy. */
  body: string
  /** Voice-lint findings on Vera's own output (she is held to the same floor). */
  violations: VoiceViolation[]
}

const SYSTEM = `You are Vera, writing a beta launch email for Frequency that a human operator will review, edit, and only then send. Write the whole email as finished copy: a subject line, then the body. Keep it short (a subject under ten words, a body of 90 to 160 words). Plain, warm, concrete, like a camp counselor you respect. Open with the point, give one clear next step, and close plainly. Use bracketed placeholders like [Create my account] for links the operator will fill in. Never invent facts, prices, dates, or numbers that were not in the brief. Never use an em dash or en dash; use a period, comma, or parentheses. At most one exclamation point, usually zero. Output EXACTLY this shape and nothing else:
Subject: <the subject line>

<the body>`

function splitSubjectBody(text: string): { subject: string; body: string } {
  const trimmed = text.trim()
  const match = trimmed.match(/^subject:\s*(.+?)\s*\n([\s\S]*)$/i)
  if (match) return { subject: match[1].trim(), body: match[2].trim() }
  // No "Subject:" prefix — treat the first line as the subject.
  const nl = trimmed.indexOf('\n')
  if (nl === -1) return { subject: '', body: trimmed }
  return { subject: trimmed.slice(0, nl).trim(), body: trimmed.slice(nl + 1).trim() }
}

/**
 * Vera drafts or refines beta email copy. Content-writer gated (drafting is not
 * sending). Runs through the single AI chokepoint with the voice primer prepended,
 * records usage, and lints her output so the operator sees any voice violations
 * (especially em dashes) before the copy can go Ready. Returns a proposal; the caller
 * decides whether to save it into a draft. Fails friendly when AI is off or over budget.
 */
export async function draftBetaEmailCopy(req: BetaCopyRequest): Promise<ActionResult<BetaCopyResult>> {
  const gate = await writerGate()
  if (!gate.ok) return fail(gate.error)

  const brief = req.brief.trim()
  if (!brief) return fail('Tell Vera what the email is for.')
  if (req.mode === 'refine' && !req.existing?.trim()) {
    return fail('There is no copy to refine yet. Write a brief and draft first.')
  }

  if (!(await aiAvailable()) || (await featureOverBudget(FEATURE))) {
    return fail('Vera is off or over budget for today. Write the copy by hand, or try again tomorrow.')
  }

  const userMsg =
    req.mode === 'refine'
      ? `Refine this beta email so it fits the voice. Keep its intent.\n\nBRIEF: ${brief}\n\nCURRENT COPY:\n${req.existing?.trim()}`
      : `Write a beta email for this.\n\nBRIEF: ${brief}`

  try {
    const res = await completeText({
      system: withVoice(SYSTEM),
      messages: [{ role: 'user', content: userMsg }],
      tier: 'haiku',
      maxTokens: 500,
    })
    await recordAiUsage({
      feature: FEATURE,
      model: res.tier,
      usage: res.usage,
      costUsd: res.costUsd,
      profileId: gate.profileId,
    })
    const text = res.text.trim()
    if (!text) return fail('Vera did not return anything. Try again with a clearer brief.')
    const { subject, body } = splitSubjectBody(text)
    const { violations } = lintVoice(`${subject}\n${body}`)
    return ok({ subject, body, violations })
  } catch (e) {
    if (e instanceof AiUnavailableError) {
      return fail('Vera is not configured right now. Write the copy by hand.')
    }
    return fail('Vera hit an error. Try again in a moment.')
  }
}
