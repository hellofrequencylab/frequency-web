// The per-Space Vera "co-host" SEAM (ENTITY-SPACES, Phase 1). A Space owner/admin can
// have Vera DRAFT their profile copy — a bio/about, an offering blurb, a tagline —
// grounded in the Space's OWN context (its name, type, brand). Cheap by design: the
// `haiku` default tier through the consolidated completeText chokepoint (lib/ai/complete.ts),
// the voice primer injected (lib/ai/voice.ts), the usage ledger tagged, and NO new infra.
//
// Mirrors the existing draft generators (lib/ai/circle-wizard.ts, lib/ai/event-blurb.ts):
//   • voice-compliant system prompt (obeys docs/NAMING.md + docs/CONTENT-VOICE.md),
//   • the owner's Space type/brand handed in as grounded context (invent nothing else),
//   • parses to a plain string, re-coerced (never trust the raw shape),
//   • records AI usage via recordAiUsage, best-effort,
//   • NEVER throws: AI off / over budget / a transient failure all fall back to a
//     deterministic, still-useful draft the owner can edit.
//
// NO em dashes anywhere: the system prompt forbids them AND we strip them defensively
// from every output (the long dash is replaced with a comma; ranges collapse to a hyphen).
//
// Later (deferred, noted here so nobody re-derives it): an eval harness for these drafts,
// MCP/tool grounding over the Space's live content, and RAG embeddings over the Space's
// posts/offerings to ground the copy in real material rather than just the brand fields.
// Phase 1 stays cheap and model-agnostic (the gateway flag from Epic 0.5b handles swap).

import { completeText, AiUnavailableError } from './complete'
import { aiEnabled } from './client'
import { recordAiUsage } from './usage'
import { withVoice } from './voice'
import type { SpaceType } from '@/lib/spaces/types'

const FEATURE = 'space-copilot'

/** The minimum a co-host draft needs about a Space: who it is and how it's branded. A loose
 *  shape (not the full `Space`) so callers can pass a resolved Space row directly — every
 *  field is optional and defended, so a thin/empty Space still yields a sensible fallback. */
export interface SpaceContext {
  /** The Space's slug/name (the canonical handle). */
  name?: string | null
  /** The kind of Space (practitioner, business, coaching…), shapes the framing. */
  type?: SpaceType | null
  /** The display brand name (falls back to `name`). */
  brandName?: string | null
  /** A short, free-text description of what the owner does — the richest grounding when present. */
  about?: string | null
  /** The actor, for the usage ledger (never blocks). */
  profileId?: string | null
}

/** One offering a Space lists (a service, program, package). Either a structured entry or just
 *  free text the owner typed — both are accepted and grounded, nothing else is invented. */
export interface OfferingContext {
  /** The offering's name/title. */
  title?: string | null
  /** Any free-text the owner gave about it (a description, notes, a price line). */
  text?: string | null
}

// ── Plain-language labels for each Space type (so the model frames the copy right) ──────────
const TYPE_LABEL: Record<SpaceType, string> = {
  root: 'space',
  practitioner: 'practitioner',
  business: 'business',
  organization: 'organization',
  lab: 'lab',
  partner: 'partner',
  coaching: 'coach',
}

function typeLabel(type: SpaceType | null | undefined): string {
  return (type && TYPE_LABEL[type]) || 'space'
}

/** The brand/name a draft should refer to (brand wins, then name, then a neutral noun). */
function brandLabel(ctx: SpaceContext): string {
  return clean(ctx.brandName, 80) || clean(ctx.name, 80) || 'this space'
}

/** Sanitize a free-text field before it enters a prompt: strip quotes/backticks/newlines and
 *  clamp length, so a crafted name/about can't break out of the context framing (defensive —
 *  the same guard event-blurb.ts uses). */
function clean(s: unknown, max = 240): string {
  return String(s ?? '')
    .replace(/[`"'\\]/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

/**
 * Strip em dashes from any AI (or fallback) output — the voice canon forbids the long dash
 * (docs/CONTENT-VOICE.md, AGENTS.md). Belt-and-braces with the system prompt: an em/en dash
 * with spaces around it becomes a comma; a tight one (a range) collapses to a hyphen. Also
 * trims surrounding quotes the model sometimes adds.
 */
export function stripEmDashes(text: string): string {
  return text
    .replace(/\s*[—–]\s*/g, (m) => (/^\s|\s$/.test(m) ? ', ' : '-'))
    .replace(/\s+,/g, ',')
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

const BASE_RULES = `You are Vera, the Frequency co-host, helping a Space owner write their own profile copy. Write as one warm, plain person (a camp counselor you actually respect), never salesy, never hype.

Ground every word in the FACTS you are given about this Space. Never invent a credential, a result, a location, a price, a year in business, or any claim you were not given. When the facts are thin, write something honest and inviting rather than padding with fabricated detail.

Hard rules:
- Write in the second or third person about the Space, never first-person "I".
- NEVER use an em dash or en dash (the long dash). Use a period, a comma, or parentheses instead.
- Use contractions. Sentence case. No emoji, no hashtags, no surrounding quotes.
- No health or outcome claims; stay relational and concrete.
- Output ONLY the copy itself, nothing else (no preamble, no label, no options list).`

// ── Bio / About ─────────────────────────────────────────────────────────────────────────────

const BIO_SYSTEM = `${BASE_RULES}

Task: write a short ABOUT / bio for this Space. Two or three plain sentences (max ~60 words). Say plainly what they do and who it's for, in their own grounded terms. Lead with the substance, not an adjective.`

/**
 * Draft a short bio/about for a Space, grounded in its context. Runs on Haiku via the
 * consolidated chokepoint; records usage best-effort. NEVER throws — returns a deterministic
 * fallback when AI is off, over budget, or the call fails, so the "Draft with Vera" affordance
 * always returns something the owner can edit.
 */
export async function draftSpaceBio(ctx: SpaceContext): Promise<string> {
  const facts = [
    `Space name: ${brandLabel(ctx)}.`,
    `Kind of space: ${typeLabel(ctx.type)}.`,
    ctx.about ? `What they do (owner's words): ${clean(ctx.about, 600)}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const text = await draft({
    system: BIO_SYSTEM,
    user: `FACTS (the only material you may use):\n${facts}\n\nWrite the short About for this Space.`,
    maxTokens: 200,
    profileId: ctx.profileId,
  })
  return text ?? fallbackBio(ctx)
}

/** Deterministic About for when Vera is off — still grounded in the Space's own context. */
export function fallbackBio(ctx: SpaceContext): string {
  const brand = brandLabel(ctx)
  const label = typeLabel(ctx.type)
  const about = clean(ctx.about, 400)
  const lead = about
    ? `${brand} is a ${label}. ${about}`
    : `${brand} is a ${label} on Frequency.`
  const close = 'Take a look around, and reach out if it sounds like your kind of thing.'
  return stripEmDashes(`${lead} ${close}`)
}

// ── Offering blurb ────────────────────────────────────────────────────────────────────────────

const OFFERING_SYSTEM = `${BASE_RULES}

Task: write a short BLURB for one thing this Space offers (a service, program, session, or package). One or two plain sentences (max ~40 words). Say what it is and who it helps, concretely. Do not state a price or a result you were not given.`

/**
 * Draft a short blurb for one of a Space's offerings, grounded in the Space + offering context.
 * Same guarantees as draftSpaceBio (Haiku, ledgered, never throws, em-dash-free).
 */
export async function draftOfferingBlurb(ctx: SpaceContext, offering: OfferingContext): Promise<string> {
  const facts = [
    `Space name: ${brandLabel(ctx)}.`,
    `Kind of space: ${typeLabel(ctx.type)}.`,
    offering.title ? `Offering name: ${clean(offering.title, 120)}.` : '',
    offering.text ? `Offering details (owner's words): ${clean(offering.text, 600)}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const text = await draft({
    system: OFFERING_SYSTEM,
    user: `FACTS (the only material you may use):\n${facts}\n\nWrite the short blurb for this offering.`,
    maxTokens: 160,
    profileId: ctx.profileId,
  })
  return text ?? fallbackOfferingBlurb(ctx, offering)
}

/** Deterministic offering blurb for when Vera is off. */
export function fallbackOfferingBlurb(ctx: SpaceContext, offering: OfferingContext): string {
  const title = clean(offering.title, 100)
  const details = clean(offering.text, 200)
  const brand = brandLabel(ctx)
  if (details) return stripEmDashes(details)
  if (title) return stripEmDashes(`${title}, from ${brand}. Reach out to learn more or to book a spot.`)
  return stripEmDashes(`An offering from ${brand}. Reach out to learn more or to book a spot.`)
}

// ── Tagline ───────────────────────────────────────────────────────────────────────────────────

const TAGLINE_SYSTEM = `${BASE_RULES}

Task: write ONE short TAGLINE for this Space. A single line, max ~8 words, no period needed. Plain and specific, never a slogan or hype. It should still work for someone who'd say "that's not really my thing".`

/**
 * Suggest a short tagline for a Space. Same guarantees as the others (Haiku, ledgered, never
 * throws, em-dash-free). Returns a single clamped line.
 */
export async function suggestTagline(ctx: SpaceContext): Promise<string> {
  const facts = [
    `Space name: ${brandLabel(ctx)}.`,
    `Kind of space: ${typeLabel(ctx.type)}.`,
    ctx.about ? `What they do (owner's words): ${clean(ctx.about, 400)}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const text = await draft({
    system: TAGLINE_SYSTEM,
    user: `FACTS (the only material you may use):\n${facts}\n\nWrite ONE short tagline for this Space.`,
    maxTokens: 40,
    profileId: ctx.profileId,
  })
  // Taglines are one short line: take the first line, drop a trailing period, clamp to ~80 chars.
  const line = (text ?? fallbackTagline(ctx)).split('\n')[0].trim().replace(/\.$/, '')
  return stripEmDashes(line).slice(0, 80)
}

/** Deterministic tagline for when Vera is off — plain, grounded, never a slogan. */
export function fallbackTagline(ctx: SpaceContext): string {
  const label = typeLabel(ctx.type)
  switch (ctx.type) {
    case 'coaching':
      return 'Coaching that meets you where you are'
    case 'practitioner':
      return 'A practice you can settle into'
    case 'business':
    case 'partner':
      return 'A place to start something good'
    case 'organization':
      return 'People, gathered around the work'
    case 'lab':
      return 'Where the work gets made'
    default:
      return `A ${label} on Frequency`
  }
}

// ── Shared generation core ───────────────────────────────────────────────────────────────────

/**
 * The one Haiku call every drafter shares: voice-injected system prompt, single user turn,
 * usage ledgered best-effort, em dashes stripped. Returns the cleaned string, or null when
 * AI is off / the call fails / the model returned nothing — the caller substitutes its
 * deterministic fallback. NEVER throws.
 */
async function draft(p: {
  system: string
  user: string
  maxTokens: number
  profileId?: string | null
}): Promise<string | null> {
  if (!aiEnabled()) return null
  try {
    const res = await completeText({
      system: withVoice(p.system),
      tier: 'haiku',
      maxTokens: p.maxTokens,
      cacheSystem: true,
      messages: [{ role: 'user', content: p.user }],
    })
    void recordAiUsage({
      feature: FEATURE,
      model: res.tier,
      usage: res.usage,
      costUsd: res.costUsd,
      profileId: p.profileId ?? null,
    })
    const text = stripEmDashes(res.text)
    return text || null
  } catch (e) {
    // AI off mid-call / transient failure: fall back deterministically, never surface the error.
    if (e instanceof AiUnavailableError) return null
    return null
  }
}
