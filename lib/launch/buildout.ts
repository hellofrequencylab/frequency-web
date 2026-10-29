// THE BUILDOUT (LIVE-1875). After the person submits the launch flow, Vera drafts their Space copy, website words,
// Spotlight and first email FROM what they gave her: the Spotlight answers, the Space tagline and about, the profile
// bio and website, and the facts they accepted on the source shelf. She quotes; she never invents.
//
// THE RULE: every generated field carries a cite (the slot, the field, a snippet and where it came from), and the
// snippet must be the person's own words, found in that source (snippetIsQuoted / checkFact, lib/launch/facts.ts).
// A field with no valid cite is dropped to an empty string, which the review screen reads as "ask them". A number
// or a web address in a field that is not in the sources drops the field too.
//
// THIS FILE IS THE SHARED CONTRACT (lane F's review screen imports the types) and the deterministic path: quoteDraft
// builds a complete draft from quotes only, with no AI call. The optional AI polish (lib/launch/buildout-io.ts) can
// only replace a field with a cited rewrite, and goes through the same enforceCites. PURE, no imports from the app.

import { checkFact, type ShelfFact } from './facts.ts'
import type { SpotlightAnswers } from './spotlight-step.ts'

type BuildoutSlot = 'spotlight' | 'space' | 'website' | 'email'

export interface BuildoutCite {
  slot: BuildoutSlot
  /** The field the cite backs: 'name', 'line', 'link', 'tagline', 'about', 'headline', 'intro', 'subject', 'body'. */
  field: string
  /** The person's own words, found verbatim (whitespace and case aside) in the source named by `origin`. */
  snippet: string
  /** Where the snippet came from, in words a person recognises ("Your Spotlight answers", "Your Space about"). */
  origin: string
}

export interface BuildoutDraft {
  spotlight: SpotlightAnswers
  space: { tagline: string; about: string }
  website: { headline: string; intro: string }
  email: { subject: string; body: string }
  cites: BuildoutCite[]
}

/** One thing the person wrote, with where it lives. */
interface BuildoutPassage {
  origin: string
  text: string
}

export interface BuildoutInput {
  spotlight: SpotlightAnswers
  space: { tagline?: string | null; about?: string | null } | null
  profile: { bio?: string | null; website?: string | null } | null
  /** The shelf facts; only the accepted ones are read. */
  facts: readonly ShelfFact[]
}

/** Vera may polish at most this many times per launch (a retry counts), whatever the switch says. */
export const MAX_AI_CALLS = 2

/** Has this launch any polish calls left? `spent` counts every attempt, a failed one included. */
export const polishCallsLeft = (spent: number): boolean => spent < MAX_AI_CALLS

const LIMITS = { tagline: 160, about: 900, headline: 120, intro: 500, subject: 90, body: 1200, piece: 600 } as const

const SPOTLIGHT_ORIGIN = 'Your Spotlight answers'
const SPACE_TAGLINE_ORIGIN = 'Your Space tagline'
const SPACE_ABOUT_ORIGIN = 'Your Space about'
const BIO_ORIGIN = 'Your profile bio'
const WEBSITE_ORIGIN = 'Your profile website'

const squash = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

/** The first `max` characters, cut back to a word end. A prefix of the person's text, so it is still a quote. */
function clip(text: string, max: number): string {
  const t = squash(text)
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:]+$/, '')
}

/** Every passage the person wrote that a draft may quote. Built from named fields only: nothing else about the
 *  person (persona, wellness, Journey or Circle topics, niche, intents) can reach a draft or a model. */
export function passagesOf(input: BuildoutInput): BuildoutPassage[] {
  const a = input.spotlight
  const out: BuildoutPassage[] = [{ origin: SPOTLIGHT_ORIGIN, text: [a.name, a.line, a.link].filter(Boolean).join('\n') }]
  const add = (origin: string, text: string | null | undefined) => {
    const t = (text ?? '').trim()
    if (t) out.push({ origin, text: t })
  }
  add(SPACE_TAGLINE_ORIGIN, input.space?.tagline)
  add(SPACE_ABOUT_ORIGIN, input.space?.about)
  add(BIO_ORIGIN, input.profile?.bio)
  add(WEBSITE_ORIGIN, input.profile?.website)
  for (const f of input.facts) if (f.state === 'accepted') add(`Your source: ${f.origin}`, f.snippet)
  return out
}

interface Piece {
  text: string
  origin: string
}

/** True when `later` adds nothing to what is already chosen. */
const covered = (chosen: readonly Piece[], later: string) => chosen.some((p) => squash(p.text).toLowerCase().includes(squash(later).toLowerCase()))

/** The pieces for a slot, in order of trust: shelf facts the person accepted, then their Space, then profile. */
function acceptedPieces(facts: readonly ShelfFact[], slots: readonly string[]): Piece[] {
  return facts.filter((f) => f.state === 'accepted' && slots.includes(f.slot)).map((f) => ({ text: f.snippet, origin: `Your source: ${f.origin}` }))
}

function firstOf(pieces: readonly (Piece | null)[], max: number): Piece | null {
  const p = pieces.find((x): x is Piece => !!x && squash(x.text).length > 0)
  return p ? { text: clip(p.text, max), origin: p.origin } : null
}

const piece = (text: string | null | undefined, origin: string): Piece | null => (squash(text) ? { text: squash(text), origin } : null)

/** Paragraphs joined from distinct pieces, up to `max` characters. Each kept piece is a verbatim prefix quote. */
function compose(pieces: readonly (Piece | null)[], max: number): Piece[] {
  const kept: Piece[] = []
  let used = 0
  for (const p of pieces) {
    if (!p || covered(kept, p.text)) continue
    const room = max - used - (kept.length ? 2 : 0)
    if (room < 40) break
    const text = clip(p.text, Math.min(LIMITS.piece, room))
    if (!text) continue
    kept.push({ text, origin: p.origin })
    used += text.length + (kept.length > 1 ? 2 : 0)
  }
  return kept
}

/** The whole draft from quotes only. No AI, no connecting words of Vera's own: a field is a quote or it is empty. */
export function quoteDraft(input: BuildoutInput): BuildoutDraft {
  const a = input.spotlight
  const cites: BuildoutCite[] = []
  const cite = (slot: BuildoutSlot, field: string, p: Piece) => cites.push({ slot, field, snippet: p.text, origin: p.origin })
  const spot = (field: 'name' | 'line' | 'link') => {
    if (a[field]) cite('spotlight', field, { text: a[field], origin: SPOTLIGHT_ORIGIN })
  }
  for (const field of ['name', 'line', 'link'] as const) spot(field)

  const line = piece(a.line, SPOTLIGHT_ORIGIN)
  const tagline = firstOf(
    [...acceptedPieces(input.facts, ['tagline']), piece(input.space?.tagline, SPACE_TAGLINE_ORIGIN), line],
    LIMITS.tagline,
  )
  const aboutPieces = compose(
    [
      piece(input.space?.about, SPACE_ABOUT_ORIGIN),
      ...acceptedPieces(input.facts, ['story', 'intro']),
      piece(input.profile?.bio, BIO_ORIGIN),
      line,
    ],
    LIMITS.about,
  )
  const introPieces = compose(aboutPieces, LIMITS.intro)
  const headline = firstOf([tagline, piece(a.name, SPOTLIGHT_ORIGIN)], LIMITS.headline)
  const subject = firstOf([piece(a.name, SPOTLIGHT_ORIGIN)], LIMITS.subject)
  const link = a.link ? { text: a.link, origin: SPOTLIGHT_ORIGIN } : null
  const bodyPieces = compose([line, ...aboutPieces.slice(0, 2), link], LIMITS.body)

  if (tagline) cite('space', 'tagline', tagline)
  aboutPieces.forEach((p) => cite('space', 'about', p))
  if (headline) cite('website', 'headline', headline)
  introPieces.forEach((p) => cite('website', 'intro', p))
  if (subject) cite('email', 'subject', subject)
  bodyPieces.forEach((p) => cite('email', 'body', p))

  const join = (ps: readonly Piece[]) => ps.map((p) => p.text).join('\n\n')
  return {
    spotlight: { name: a.name, line: a.line, link: a.link },
    space: { tagline: tagline?.text ?? '', about: join(aboutPieces) },
    website: { headline: headline?.text ?? '', intro: join(introPieces) },
    email: { subject: subject?.text ?? '', body: join(bodyPieces) },
    cites,
  }
}

type FieldRef = { slot: BuildoutSlot; field: string }

const FIELDS: readonly FieldRef[] = [
  { slot: 'spotlight', field: 'name' }, { slot: 'spotlight', field: 'line' }, { slot: 'spotlight', field: 'link' },
  { slot: 'space', field: 'tagline' }, { slot: 'space', field: 'about' },
  { slot: 'website', field: 'headline' }, { slot: 'website', field: 'intro' },
  { slot: 'email', field: 'subject' }, { slot: 'email', field: 'body' },
]

function getField(d: BuildoutDraft, f: FieldRef): string {
  return (d[f.slot] as Record<string, string>)[f.field] ?? ''
}

function withField(d: BuildoutDraft, f: FieldRef, value: string): BuildoutDraft {
  return { ...d, [f.slot]: { ...(d[f.slot] as Record<string, string>), [f.field]: value } } as BuildoutDraft
}

/** Numbers and web addresses in `value` that no source contains: the two things a rewrite most often invents. */
function inventsFacts(value: string, sourceText: string): boolean {
  const hay = squash(sourceText).toLowerCase()
  const tokens = value.toLowerCase().match(/https?:\/\/\S+|\b\w+\.(?:com|org|net|io|co|app|me|studio)\b|\d[\d,.:]*/g) ?? []
  return tokens.some((t) => !hay.includes(t.replace(/[.,:]+$/, '')))
}

/** Hold a draft to the rule. A cite stays only if its snippet is found in the passage it names (checkFact). A field
 *  with no surviving cite, or one that brings in a number or address no source has, is emptied: "ask them". */
export function enforceCites(draft: BuildoutDraft, passages: readonly BuildoutPassage[]): BuildoutDraft {
  const all = passages.map((p) => p.text).join('\n')
  const valid = draft.cites.filter((c) => {
    const texts = passages.filter((p) => p.origin === c.origin).map((p) => p.text)
    return texts.some((t) => checkFact({ slot: 'story', value: c.snippet, snippet: c.snippet, origin: c.origin }, t).ok)
  })
  let out: BuildoutDraft = { ...draft, cites: valid }
  for (const f of FIELDS) {
    const v = getField(out, f)
    if (!v) continue
    const backed = valid.some((c) => c.slot === f.slot && c.field === f.field)
    if (!backed || inventsFacts(v, all)) {
      out = withField(out, f, '')
      out = { ...out, cites: out.cites.filter((c) => !(c.slot === f.slot && c.field === f.field)) }
    }
  }
  return out
}

/** The fields left empty: what the review screen asks the person to fill in themselves. Spotlight link is optional. */
export function askThem(draft: BuildoutDraft): FieldRef[] {
  return FIELDS.filter((f) => !(f.slot === 'spotlight' && f.field === 'link') && !getField(draft, f))
}

/** The fields an AI polish may rewrite. The Spotlight is the person's submitted words and is never rewritten. */
const POLISH_FIELDS: readonly FieldRef[] = FIELDS.filter((f) => f.slot !== 'spotlight')

const EM_DASH = /\s*[–—]\s*/g

/** Take a model's answer (untrusted) as proposed rewrites of polishable fields, each with its own cite. A rewrite
 *  replaces the quoted field only if it is well formed and within the field's length; the result still goes through
 *  enforceCites, so a rewrite whose snippet is not the person's words is dropped and the quote stays. */
export function applyPolish(base: BuildoutDraft, raw: unknown, passages: readonly BuildoutPassage[]): BuildoutDraft {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { fields?: unknown }).fields) ? ((raw as { fields: unknown[] }).fields) : []
  let out = base
  for (const item of list.slice(0, POLISH_FIELDS.length)) {
    const r = item as Record<string, unknown>
    const ref = POLISH_FIELDS.find((f) => f.slot === r?.slot && f.field === r?.field)
    if (!ref || typeof r.value !== 'string' || typeof r.snippet !== 'string' || typeof r.origin !== 'string') continue
    const value = r.value.replace(EM_DASH, ', ').trim()
    const max = LIMITS[ref.field as keyof typeof LIMITS]
    if (!value || value.length > max) continue
    const candidate: BuildoutDraft = {
      ...withField(out, ref, value),
      cites: [...out.cites.filter((c) => !(c.slot === ref.slot && c.field === ref.field)), { slot: ref.slot, field: ref.field, snippet: r.snippet.trim(), origin: r.origin.trim() }],
    }
    const checked = enforceCites(candidate, passages)
    if (getField(checked, ref)) out = checked
  }
  return out
}

/** The tool schema the model answers in (JSON-schema output). */
export const POLISH_SCHEMA = {
  type: 'object',
  properties: {
    fields: {
      type: 'array',
      maxItems: POLISH_FIELDS.length,
      items: {
        type: 'object',
        properties: {
          slot: { type: 'string', enum: ['space', 'website', 'email'] },
          field: { type: 'string', enum: ['tagline', 'about', 'headline', 'intro', 'subject', 'body'] },
          value: { type: 'string' },
          snippet: { type: 'string', description: 'A phrase copied word for word from one passage that this value is built from.' },
          origin: { type: 'string', description: 'The origin of the passage the snippet was copied from, exactly as given.' },
        },
        required: ['slot', 'field', 'value', 'snippet', 'origin'],
        additionalProperties: false,
      },
    },
  },
  required: ['fields'],
  additionalProperties: false,
} as const

/** A stored buildout: the draft, how it was made and how many AI calls this launch has spent. */
export interface StoredBuildout {
  draft: BuildoutDraft
  mode: 'quotes' | 'ai'
  aiCalls: number
  at: string
}

/** The stored jsonb read defensively. Null when it is not a draft this code wrote. */
export function readStoredBuildout(raw: unknown): StoredBuildout | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const d = r.draft as Partial<BuildoutDraft> | undefined
  if (!d || typeof d !== 'object' || !Array.isArray(d.cites) || !d.spotlight || !d.space || !d.website || !d.email) return null
  const aiCalls = typeof r.aiCalls === 'number' && Number.isInteger(r.aiCalls) && r.aiCalls >= 0 ? r.aiCalls : MAX_AI_CALLS
  return { draft: d as BuildoutDraft, mode: r.mode === 'ai' ? 'ai' : 'quotes', aiCalls, at: typeof r.at === 'string' ? r.at : '' }
}
