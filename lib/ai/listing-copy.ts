// Vera listing-copy generator (ADR-596, finding #5). A Space owner or maker authoring a commerce
// listing can have Vera DRAFT the two words that carry it: a plain, specific TITLE and a short
// DESCRIPTION, grounded in the few facts the author gives (what it is, a seed name/keywords, how it
// is priced). The later Shop-console UI wires a "Draft with Vera" button to this; this module only
// exports the function.
//
// Mirrors the existing draft generators (lib/ai/space-copilot.ts, lib/ai/event-blurb.ts):
//   • the Frequency voice primer injected (lib/ai/voice.ts) so the copy obeys docs/CONTENT-VOICE.md
//     + docs/NAMING.md (no em dashes, no hype, "Listing"/"Market"/"Shop" used correctly),
//   • the author's facts handed in as grounded context (invent nothing else: no price, no result),
//   • Haiku default tier through the consolidated completeText chokepoint (lib/ai/complete.ts),
//   • usage ledgered best-effort via recordAiUsage,
//   • NEVER throws: AI off / over budget / a transient failure / a bad JSON shape all fall back to a
//     deterministic, still-useful draft the author can edit.

import { completeText, AiUnavailableError } from './complete'
import { aiEnabled } from './client'
import { recordAiUsage, featureOverBudget } from './usage'
import { withVoice } from './voice'
import { stripEmDashes } from './space-copilot'
import type { ProductKind, ServicePriceModel } from '@/lib/commerce/types'

const FEATURE = 'listing-copy'

/** What the author tells Vera about the listing. Every field is optional and defended, so a thin
 *  seed (just a name) still yields a sensible draft. */
export interface ListingCopyInput {
  /** The commerce kind, so the copy frames a product vs a bookable service vs a ticket. */
  kind: ProductKind
  /** The working name / a few keywords the author typed (the richest grounding). */
  seed?: string | null
  /** How the listing is priced (fixed / from / free / contact) — services only; shapes the framing. */
  priceModel?: ServicePriceModel | null
  /** The Space/maker brand or name, if the author wants the copy to name it. */
  brandName?: string | null
  /** The actor + Space, for the usage ledger + the per-Space daily cap (never blocks). */
  profileId?: string | null
  spaceId?: string | null
}

/** The draft Vera returns: a short title and a short description, both member-facing. */
export interface ListingCopy {
  title: string
  description: string
}

// ── Plain-language framing per kind, so the model writes for the right thing ────────────────────
const KIND_NOUN: Record<ProductKind, string> = {
  physical: 'a physical product for sale',
  digital: 'a digital product for sale',
  service: 'a bookable service',
  booking: 'a bookable service',
  ticket: 'a ticket to an event',
}

/** Sanitize a free-text field before it enters the prompt: strip quotes/backticks/newlines and clamp,
 *  so a crafted seed can't break out of the facts framing (the same guard event-blurb.ts uses). */
function clean(s: unknown, max = 240): string {
  return String(s ?? '')
    .replace(/[`"'\\]/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

const SYSTEM = `You are Vera, the Frequency co-host, helping someone write the copy for one commerce Listing (a product, a bookable service, or a ticket). You write TWO things: a short title and a short description.

Ground every word in the FACTS you are given. Never invent a price, a result, a credential, a location, a date, or any claim you were not handed. When the facts are thin, write something honest and inviting rather than padding with fabricated detail.

Hard rules:
- Title: plain and specific, the thing itself, max ~8 words. Sentence case, no trailing period, no quotes. "Morning pottery class", not "Unlock your creative flow".
- Description: one or two plain sentences, max ~40 words. Say what it is and who it helps, concretely. Do not state a price you were not given.
- NEVER use an em dash or en dash. Use a period, a comma, or parentheses.
- Use contractions. No emoji, no hashtags, no hype, never salesy.
- Output ONLY a single JSON object: {"title": "...", "description": "..."}. No preamble, no code fence, nothing else.`

/** Build the grounded facts block from the author's input (only what is true). */
function factsFor(input: ListingCopyInput): string {
  const priceLine: Record<ServicePriceModel, string> = {
    fixed: 'It has a fixed price.',
    from: 'Its price starts "from" a base (it can vary).',
    free: 'It is free.',
    contact: 'The buyer contacts the seller for pricing (no set price).',
  }
  return [
    `This listing is ${KIND_NOUN[input.kind] ?? 'a commerce listing'}.`,
    input.brandName ? `Sold by: ${clean(input.brandName, 80)}.` : '',
    input.seed ? `Working name / keywords the author gave: ${clean(input.seed, 200)}.` : '',
    input.priceModel ? priceLine[input.priceModel] : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/** Parse the model's JSON object into {title, description}, tolerating a stray code fence or prose
 *  around it. Returns null when nothing usable is found (the caller falls back). */
function parseCopy(raw: string): { title: string; description: string } | null {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const obj = JSON.parse(match[0]) as { title?: unknown; description?: unknown }
    const title = typeof obj.title === 'string' ? obj.title : ''
    const description = typeof obj.description === 'string' ? obj.description : ''
    if (!title && !description) return null
    return { title, description }
  } catch {
    return null
  }
}

/**
 * Draft listing copy (title + description) for a commerce listing, grounded in the author's facts.
 * Runs on Haiku via the consolidated chokepoint; records usage best-effort. NEVER throws — returns a
 * deterministic, em-dash-free fallback when AI is off, over budget, fails, or returns an unusable
 * shape, so the "Draft with Vera" affordance always yields something editable.
 */
export async function draftListingCopy(input: ListingCopyInput): Promise<ListingCopy> {
  const fallback = fallbackListingCopy(input)
  if (!aiEnabled()) return fallback
  // Per-Space daily spend cap: when we know the Space, gate on ITS spend so one Space can't run up
  // the whole feature's bill; the global 'listing-copy' cap still applies underneath.
  if (await featureOverBudget(FEATURE, input.spaceId)) return fallback

  try {
    const res = await completeText({
      system: withVoice(SYSTEM),
      tier: 'haiku',
      maxTokens: 220,
      cacheSystem: true,
      messages: [
        {
          role: 'user',
          content: `FACTS (the only material you may use):\n${factsFor(input)}\n\nWrite the JSON with the title and description for this listing.`,
        },
      ],
    })
    void recordAiUsage({
      feature: FEATURE,
      model: res.tier,
      usage: res.usage,
      costUsd: res.costUsd,
      profileId: input.profileId ?? null,
      spaceId: input.spaceId ?? null,
    })
    const parsed = parseCopy(res.text)
    if (!parsed) return fallback
    // Clean each field: em dashes stripped, title to one line without a trailing period, both clamped.
    const title = stripEmDashes(parsed.title).split('\n')[0].replace(/\.$/, '').slice(0, 120) || fallback.title
    const description = stripEmDashes(parsed.description).slice(0, 400) || fallback.description
    return { title, description }
  } catch (e) {
    // AI off mid-call / transient failure: fall back deterministically, never surface the error.
    if (e instanceof AiUnavailableError) return fallback
    return fallback
  }
}

/** Deterministic listing copy for when Vera is off — still grounded in the author's seed + kind. */
export function fallbackListingCopy(input: ListingCopyInput): ListingCopy {
  const seed = clean(input.seed, 100)
  const brand = clean(input.brandName, 80)
  const isService = input.kind === 'service' || input.kind === 'booking'
  const title = seed || (isService ? 'New service' : input.kind === 'ticket' ? 'Event ticket' : 'New listing')
  const who = brand ? ` from ${brand}` : ''
  const description = isService
    ? `A ${clean(input.seed, 60) || 'session'} you can book${who}. Add the details and pick your times.`
    : input.kind === 'ticket'
      ? `A ticket${who}. Add the details so people know what to expect.`
      : `${seed || 'A new listing'}${who}. Add a short description so buyers know what it is.`
  return { title: stripEmDashes(title).slice(0, 120), description: stripEmDashes(description).slice(0, 400) }
}
