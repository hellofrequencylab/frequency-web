// SHARED SPACE CONTENT SLOTS. One small vocabulary of facts about a Space (its name, tagline, intro, story and
// contact details) that every surface reads: the Space page, the Spotlight and the website all draw their
// words from the same `metadata.space` record (lib/spaces/content-data.ts), and this module is the one place
// that names which field is which slot. Edit a fact once and every surface follows.
//
// RESOLUTION ORDER, for every slot: saved content, then kit copy, then the block's own default.
//   saved         what the Space already stores (brand name, tagline, spaces.about, the Business Info form).
//   kit copy      the sample words a starter kit wrote into a block, written as `{{slot|sample words}}`.
//   block default what the block draws when its prop resolves to nothing.
//
// NOTHING IS REWRITTEN. A token lives in a block's stored props exactly as the kit wrote it and is resolved
// at render time, so removing a kit, switching theme or filling in Business Info never edits a saved block.
// An owner who types over a token's field replaces the token, and from then on that block is theirs alone.
//
// PURE and total: no server or React imports, so the editor canvas, the public site and tests share it, and
// a malformed record yields no slots instead of throwing.

const SLOT_KEYS = ['name', 'tagline', 'intro', 'story', 'email', 'phone', 'address', 'hours'] as const
type SlotKey = (typeof SLOT_KEYS)[number]
export type SlotValues = Partial<Record<SlotKey, string>>

function text(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined
}

function record(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

/** The saved value of every slot, read off a Space's content record (`metadata.space`, SpaceContentData).
 *  A slot with nothing saved is absent, never an empty string. */
export function readSlots(content: unknown): SlotValues {
  const c = record(content)
  const identity = record(c.identity)
  const profile = record(c.profile)
  const out: SlotValues = {
    name: text(identity.name),
    tagline: text(identity.tagline),
    intro: text(c.aboutShort),
    story: text(profile.about),
    email: text(profile.email),
    phone: text(profile.phone),
    address: text(profile.address),
    hours: text(profile.hours),
  }
  for (const key of SLOT_KEYS) if (out[key] === undefined) delete out[key]
  return out
}

/** The value a slot draws, by the resolution order. `undefined` means the block's own default applies. */
function resolveSlot(saved: string | undefined, kit: string | undefined): string | undefined {
  return text(saved) ?? text(kit)
}

const TOKEN = /\{\{\s*([a-z]+)\s*(?:\|([^{}]*))?\}\}/g

/** True when a string carries at least one slot token. */
function hasToken(value: string): boolean {
  TOKEN.lastIndex = 0
  return TOKEN.test(value)
}

/** Resolve the slot tokens in one string. An unknown slot name is left exactly as written, so a typo shows up
 *  in the editor instead of silently vanishing. */
function resolveSlotText(value: string, slots: SlotValues): string {
  return value.replace(TOKEN, (whole, name: string, kit: string | undefined) => {
    if (!(SLOT_KEYS as readonly string[]).includes(name)) return whole
    return resolveSlot(slots[name as SlotKey], kit) ?? ''
  })
}

/** Resolve every slot token in a block's props, at any depth (cards, lists and nested blocks included).
 *  Returns the SAME object when nothing carries a token, so an untouched block costs nothing and keeps its
 *  identity. Never mutates its input. */
export function bindSlots<T>(value: T, slots: SlotValues): T {
  if (typeof value === 'string') return (hasToken(value) ? resolveSlotText(value, slots) : value) as T
  if (Array.isArray(value)) {
    let changed = false
    const next = value.map((item) => {
      const bound = bindSlots(item, slots)
      if (bound !== item) changed = true
      return bound
    })
    return (changed ? next : value) as T
  }
  if (value && typeof value === 'object') {
    let changed = false
    const next: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const bound = bindSlots(item, slots)
      if (bound !== item) changed = true
      next[key] = bound
    }
    return (changed ? next : value) as T
  }
  return value
}

function sameJson(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b)
}

/** The props to save after an edit made on the RESOLVED words (what the inspector shows). Anything the owner left
 *  alone keeps its stored value, token included, so editing one field never turns a neighbour's `{{slot|...}}`
 *  into frozen text. A field the owner changed takes their words, which is what ends a token's job. Never mutates. */
export function keepSlotTokens<T>(stored: T, bound: T, next: T): T {
  if (sameJson(bound, next)) return stored
  if (Array.isArray(next) && Array.isArray(stored) && Array.isArray(bound) && next.length === bound.length && stored.length === bound.length) {
    return next.map((item, i) => keepSlotTokens(stored[i], bound[i], item)) as T
  }
  if (next && typeof next === 'object' && !Array.isArray(next) && stored && typeof stored === 'object' && bound && typeof bound === 'object') {
    const s = stored as Record<string, unknown>, b = bound as Record<string, unknown>
    return Object.fromEntries(Object.entries(next as Record<string, unknown>).map(([key, item]) => [key, key in b ? keepSlotTokens(s[key], b[key], item) : item])) as T
  }
  return next
}
