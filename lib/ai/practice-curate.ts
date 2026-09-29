// VERA FILLS WHAT A LIBRARY PRACTICE LEFT EMPTY (LIVE-644, ADR-1607; child 4 of PROG-PRAC4).
//
// The practice spark drafts a card hook at create (lib/ai/practice-spark.ts), but a practice that
// reached the library without it (hand entry, AI off, the staff set) keeps an empty `summary` for
// ever, and nothing proposes tags at all. This module is the curator's door for both, on the
// pre-screen pattern (lib/ai/practice-publish-screen.ts): one Haiku read of one practice, under
// its own budget key and the voice primer, returning a PROPOSAL.
//
// THE RULE: fill only what is empty. A card hook is drafted only when `summary` is blank, and tags
// only when the practice carries fewer than CURATE_TAG_FLOOR. Tags come from the canonical list
// first, and at most MAX_NEW_TAGS new word per practice, so the vocabulary does not fork. The same
// rule is re-checked at write (applyPracticeCuration): a hook someone wrote between the draft and
// the accept is kept, and existing tags from every source are kept. Never automatic: a curator
// accepts or discards on the needs-attention panel. Sibling of LIVE-587 (the Loom's fill-only-empty
// rule), not blocked by it.
//
// FAIL-SAFE: AI off, over the cap, a missing practice or an AiUnavailableError returns null. The
// caller shows that Vera could not draft and the row stays exactly as it was.
//
// authz-delegated: server-only; the curator gate lives at the calling actions
// (draftPracticeCurationAction / acceptPracticeCurationAction).

import {
  getPractice,
  getPracticeTagLabels,
  listCanonicalTags,
  setPracticeTags,
  updatePractice,
} from '@/lib/practices'
import { slugify } from '@/lib/utils'
import { aiAvailable, featureOverBudget, recordAiUsage } from './usage'
import { completeText, AiUnavailableError } from './complete'
import { voiceLine, withVoice } from './voice'
import { withPracticeShape } from './practice-shape'
import { noteList, parseModelJson, z } from './schema'

/** The ledger key and the budget cap key (lib/ai/budget.ts). */
const FEATURE = 'practice-curate'

/** A practice with fewer tags than this gets a tag proposal. */
export const CURATE_TAG_FLOOR = 3
/** The most tags one proposal carries. */
export const MAX_CURATE_TAGS = 3
/** The most tags in one proposal that are not already canonical. */
export const MAX_NEW_TAGS = 1
/** The card hook column's cap (updatePractice writes summary at 140). */
const HOOK_MAX = 140
/** A tag label's cap (setPracticeTags stores labels at 40). */
const TAG_MAX = 40
/** How many canonical labels the prompt lists. The vocabulary is small; this is a safety cap. */
const CANONICAL_PROMPT_MAX = 120

/** What a practice is missing, by the fill-only-empty rule. */
export interface CurationGaps {
  /** The card hook (summary) is blank. */
  hook: boolean
  /** The practice has fewer than CURATE_TAG_FLOOR tags. */
  tags: boolean
}

/** Vera's proposal. `hook` is null when the hook was not empty or she had nothing usable; `tags`
 *  is empty when the practice already had enough, or nothing fitted. `asked` records which gaps
 *  were open, so the panel can say "nothing to fill" without a model call. */
export interface PracticeCurationDraft {
  hook: string | null
  tags: string[]
  asked: CurationGaps
}

/** What an accept actually wrote. */
export interface PracticeCurationApplied {
  /** The hook was written (the summary was still empty). */
  hookWritten: boolean
  /** The hook was offered but a person had written one first, so theirs was kept. */
  hookKept: boolean
  /** Tags added to the practice (0 when it had reached the floor in the meantime). */
  tagsAdded: number
}

/** The open gaps for one practice. PURE. */
export function curationGaps(input: { summary: string | null | undefined; tagCount: number }): CurationGaps {
  return {
    hook: !(input.summary ?? '').trim(),
    tags: input.tagCount < CURATE_TAG_FLOOR,
  }
}

/** One card hook as the library stores it: the voice's mechanical rules, no wrapping quotes, one
 *  line, capped at a word boundary. Null when nothing usable is left. PURE. */
export function cleanHook(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  let t = voiceLine(raw.replace(/\s+/g, ' ')).trim()
  t = t.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim()
  if (!t) return null
  if (t.length > HOOK_MAX) {
    const cut = t.slice(0, HOOK_MAX)
    const space = cut.lastIndexOf(' ')
    t = (space > 40 ? cut.slice(0, space) : cut).replace(/[\s,;:]+$/, '')
  }
  return t || null
}

/** One tag label: plain words, one line, capped. Null when nothing usable is left. PURE. */
function cleanTagLabel(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const t = raw
    .replace(/[#"“”]+/g, ' ')
    .replace(/[–—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, TAG_MAX)
    .trim()
  return t && slugify(t) ? t : null
}

/** The key two tags match on: the slug with its hyphens dropped, so "breath work" and
 *  "Breathwork" are one tag. PURE. */
function tagKey(label: string): string {
  return slugify(label).replace(/-/g, '')
}

/**
 * Choose the tags to propose from what Vera returned. PURE.
 * Canonical matches come first and carry the canonical label (so "Breath Work" lands on the
 * canonical "Breathwork" def, not a fork), then at most MAX_NEW_TAGS new word. Anything the
 * practice already carries is dropped, and the whole list is capped at `room`.
 */
export function pickTags(
  proposed: readonly unknown[],
  opts: { canonical: readonly string[]; existing: readonly string[]; room: number },
): string[] {
  const room = Math.max(0, Math.min(MAX_CURATE_TAGS, Math.floor(opts.room)))
  if (room === 0) return []
  const canonicalByKey = new Map<string, string>()
  for (const label of opts.canonical) {
    const k = tagKey(label)
    if (k && !canonicalByKey.has(k)) canonicalByKey.set(k, label)
  }
  const seen = new Set(opts.existing.map(tagKey).filter(Boolean))
  const canon: string[] = []
  const fresh: string[] = []
  for (const raw of proposed) {
    const label = cleanTagLabel(raw)
    if (!label) continue
    const key = tagKey(label)
    if (seen.has(key)) continue
    seen.add(key)
    const canonicalLabel = canonicalByKey.get(key)
    if (canonicalLabel) canon.push(canonicalLabel)
    else fresh.push(label.toLowerCase())
  }
  return [...canon, ...fresh.slice(0, MAX_NEW_TAGS)].slice(0, room)
}

const CURATE_SYSTEM = `You are Vera, helping a Frequency curator fill in a Practice that is already in the library. You only fill what is empty. A person wrote everything that is there, so you never rewrite it.

You will be told which of these to draft:
- HOOK: the card hook, one line under 100 characters, 8 to 12 words, the problem the Practice solves for a skeptic. Plain, concrete, no hype, no feelings narrated, no health claims.
- TAGS: short topic tags a member would search for (one to three words each). Pick from the CANONICAL TAGS list whenever one fits, spelled exactly as listed. Suggest a new tag only when nothing in the list fits.

Return STRICT JSON only, no prose around it, in exactly this shape:
{"hook":"...","tags":["..."]}
Use null for the hook and [] for tags when you were not asked for them. Use no em dashes.`

/** The reply contract: a hook string (or null) and a list of short tags. A stray value is dropped,
 *  not fatal; a missing key reads as nothing offered. */
const CURATE_REPLY = z.object({
  hook: z.string().nullable().optional(),
  tags: noteList(8, TAG_MAX).default([]),
})

/** Parse Vera's JSON reply, tolerating fences and junk. A malformed reply is an empty offer.
 *  Exported for its test. */
export function parseCurateJson(text: string): { hook: string | null; tags: string[] } {
  const res = parseModelJson(text, CURATE_REPLY)
  return res.ok ? { hook: res.data.hook ?? null, tags: res.data.tags } : { hook: null, tags: [] }
}

/**
 * Draft what one library practice is missing. Returns null when Vera cannot draft (AI off, over
 * the cap, AI unavailable mid-call, or no such practice). Returns a draft with `asked` both false,
 * and makes no model call, when nothing is empty. A PROPOSAL only: nothing is written here.
 *
 * authz-delegated: the curator gate lives at the calling action (draftPracticeCurationAction).
 */
export async function draftPracticeCuration(practiceId: string): Promise<PracticeCurationDraft | null> {
  const practice = await getPractice(practiceId)
  if (!practice) return null
  const existing = await getPracticeTagLabels(practiceId)
  const asked = curationGaps({ summary: practice.summary, tagCount: existing.length })
  if (!asked.hook && !asked.tags) return { hook: null, tags: [], asked }

  if (!(await aiAvailable()) || (await featureOverBudget(FEATURE))) return null

  const canonical = (await listCanonicalTags()).map((t) => t.label).slice(0, CANONICAL_PROMPT_MAX)
  const room = asked.tags ? Math.min(MAX_CURATE_TAGS, CURATE_TAG_FLOOR - existing.length) : 0
  try {
    const res = await completeText({
      system: withVoice(withPracticeShape(CURATE_SYSTEM)),
      messages: [
        {
          role: 'user',
          content:
            `Draft: ${[asked.hook ? 'HOOK' : null, asked.tags ? `TAGS (up to ${room})` : null].filter(Boolean).join(' and ')}.\n\n` +
            `TITLE: ${practice.title ?? '(none)'}\n` +
            `DESCRIPTION: ${practice.description ?? '(none)'}\n` +
            `BODY: ${(practice.body ?? '(none)').slice(0, 3000)}\n` +
            `TAGS ALREADY ON IT: ${existing.length ? existing.join(', ') : '(none)'}\n` +
            `CANONICAL TAGS: ${canonical.length ? canonical.join(', ') : '(none yet)'}\n\n` +
            `Return the JSON described in your instructions.`,
        },
      ],
      tier: 'haiku',
      maxTokens: 300,
    })
    await recordAiUsage({ feature: FEATURE, model: res.tier, usage: res.usage, costUsd: res.costUsd })
    const reply = parseCurateJson(res.text)
    return {
      hook: asked.hook ? cleanHook(reply.hook) : null,
      tags: asked.tags ? pickTags(reply.tags, { canonical, existing, room }) : [],
      asked,
    }
  } catch (e) {
    if (e instanceof AiUnavailableError) return null
    throw e
  }
}

/**
 * Write what a curator accepted, through the existing update paths, filling only what is still
 * empty. The hook goes through updatePractice (which also refreshes the search embedding) only
 * when `summary` is still blank. Tags go through setPracticeTags as Vera's source, passed WITH the
 * practice's current tags so the source swap there keeps every tag already on it; they are added
 * only while the practice is still under CURATE_TAG_FLOOR.
 *
 * authz-delegated: the curator gate lives at the calling action (acceptPracticeCurationAction).
 */
export async function applyPracticeCuration(
  practiceId: string,
  accepted: { hook?: string | null; tags?: readonly string[] },
  actorId: string,
): Promise<PracticeCurationApplied> {
  const practice = await getPractice(practiceId)
  if (!practice) throw new Error('Practice not found.')
  const existing = await getPracticeTagLabels(practiceId)
  const gaps = curationGaps({ summary: practice.summary, tagCount: existing.length })

  const hook = cleanHook(accepted.hook)
  let hookWritten = false
  if (hook && gaps.hook) {
    await updatePractice(practiceId, { summary: hook })
    hookWritten = true
  }

  let tagsAdded = 0
  if (gaps.tags && accepted.tags?.length) {
    // `canonical: accepted` keeps the curator's own spelling; the room is what is left under the floor.
    const fresh = pickTags(accepted.tags, {
      canonical: accepted.tags.filter((t): t is string => typeof t === 'string'),
      existing,
      room: CURATE_TAG_FLOOR - existing.length,
    })
    if (fresh.length > 0) {
      await setPracticeTags(practiceId, [...existing, ...fresh], { source: 'vera', assignedBy: actorId })
      tagsAdded = fresh.length
    }
  }

  return { hookWritten, hookKept: !!hook && !gaps.hook, tagsAdded }
}
