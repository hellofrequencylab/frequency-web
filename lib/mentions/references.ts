// @PEOPLE AND #ITEMS IN A MESSAGE (LIVE-2524, hub plan 2026-11-24). Pure: no React, no Supabase.
//
// A message box stores a tag as a token in the text itself, so the words and the reference travel
// together and survive copy and paste:
//
//   @[Sam Rivera](profile:0b0e…)      a person
//   #[Spring sound bath](plan:7c1d…)  an item
//
// The label is the name at the time of writing; the id is the truth. A reader renders the current
// name when it has one and falls back to the label, so a rename never breaks a message. The server
// reads the ids with `extractReferences` at save time and writes one `mentions` row per id
// (lib/mentions/store.ts), never parsing on read.
//
// The token grammar is closed on purpose: a kind outside REFERENCE_KINDS, or an id that is not a
// UUID, is plain text, so a pasted lookalike never becomes a reference.

export const REFERENCE_KINDS = ['profile', 'plan', 'task', 'entry', 'event', 'deal', 'contact', 'space'] as const
export type ReferenceKind = (typeof REFERENCE_KINDS)[number]

export interface Reference {
  kind: ReferenceKind
  id: string
  label: string
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const KINDS = REFERENCE_KINDS.join('|')
// [@#] then [label] then (kind:uuid). A label holds no square brackets and no line break.
const TOKEN = new RegExp(`([@#])\\[([^\\[\\]\\n]{1,80})\\]\\((${KINDS}):(${UUID})\\)`, 'gi')

/** The most references one message may carry; past this the rest are plain text. */
export const MAX_REFERENCES = 20

/** Every distinct reference in a message, in the order written. A person needs @, an item needs #. */
export function extractReferences(body: string): Reference[] {
  const out: Reference[] = []
  const seen = new Set<string>()
  for (const m of body.matchAll(TOKEN)) {
    const [, sigil, label, rawKind, rawId] = m
    const kind = rawKind.toLowerCase() as ReferenceKind
    if ((sigil === '@') !== (kind === 'profile')) continue
    const id = rawId.toLowerCase()
    const key = `${kind}:${id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ kind, id, label: label.trim() })
    if (out.length >= MAX_REFERENCES) break
  }
  return out
}

/** The people tagged in a message: profile ids, distinct, in order. */
export function mentionedProfileIds(body: string): string[] {
  return extractReferences(body)
    .filter((r) => r.kind === 'profile')
    .map((r) => r.id)
}

/** The token a picker inserts for a person or an item. Brackets in the label are dropped. */
export function referenceToken(kind: ReferenceKind, id: string, label: string): string {
  const clean = label.replace(/[[\]\n]/g, '').trim().slice(0, 80) || 'someone'
  return `${kind === 'profile' ? '@' : '#'}[${clean}](${kind}:${id})`
}

export type MessagePart = { text: string } | { ref: Reference }

/** A message split into plain text and references, for rendering a tag as a chip. */
export function splitMessage(body: string): MessagePart[] {
  const parts: MessagePart[] = []
  let at = 0
  for (const m of body.matchAll(TOKEN)) {
    const [whole, sigil, label, rawKind, rawId] = m
    const kind = rawKind.toLowerCase() as ReferenceKind
    if ((sigil === '@') !== (kind === 'profile')) continue
    const start = m.index ?? 0
    if (start > at) parts.push({ text: body.slice(at, start) })
    parts.push({ ref: { kind, id: rawId.toLowerCase(), label: label.trim() } })
    at = start + whole.length
  }
  if (at < body.length) parts.push({ text: body.slice(at) })
  return parts
}

/** The message as a person reads it with no chips: tokens become "@Sam" and "#Spring sound bath". */
export function plainText(body: string): string {
  return splitMessage(body)
    .map((p) => ('text' in p ? p.text : `${p.ref.kind === 'profile' ? '@' : '#'}${p.ref.label}`))
    .join('')
}

/**
 * The open @ query at the caret, for a picker: the word typed since the last @ that starts a word,
 * or null when the caret is not in one. "Thanks @sa|" gives { start: 7, query: 'sa' }.
 */
export function openMentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  const m = /(^|\s)@([^\s@#[\]()]{0,30})$/.exec(before)
  if (!m) return null
  return { start: before.length - m[2].length - 1, query: m[2] }
}
