// ─────────────────────────────────────────────────────────────────────────────
// THE SPARK DRAFT STORE (ADR-991 in docs/DECISIONS.md).
//
// PURE. No React, no DOM, no `window`, no Supabase. Everything here takes a `StorageLike` and a
// clock, so the rules that actually matter (what a key is, when a draft expires, what is refused,
// what discard does) are unit-testable in node and can never quietly depend on a browser.
//
// WHY A CLIENT STORE AT ALL, now that there is also a server one. This is the FAST half of a
// local-first pair (ADR-1001 in docs/DECISIONS.md). It is what makes typing feel instant, what
// survives a crash or a refresh with zero latency, and what keeps working on a flaky connection.
// The server half (lib/studio/draft-store.ts) adds the other thing: it makes a draft THE AUTHOR'S
// rather than THAT MACHINE'S. Sync degrades to this file on any failure, never the other way.
//
// Deferred creation is untouched by either half. Journey, Practice and Circle forbid a row in the
// ENTITY's own table before the author commits a reviewed title; the staged answers live in
// `studio_draft`, which carries no entity id and cannot be listed, searched, or mistaken for the
// thing being made. The commit path is unchanged.
// ─────────────────────────────────────────────────────────────────────────────

/** Bumped when the stored shape changes. An entry at any other version is dropped on read. */
export const DRAFT_VERSION = 1

/** Every key this module owns starts here, so pruning can find its own and nothing else. */
export const DRAFT_PREFIX = 'frequency.spark.draft.'

/** A draft is recoverable for a week. Past that it is noise, and being offered a half-typed thing
 *  from last month is worse than being offered nothing. */
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** One field's ceiling. A pasted source document can run to megabytes; the store is for what was
 *  typed, not for a whole uploaded course, and blowing the quota would lose the small answers too. */
export const MAX_VALUE_CHARS = 20_000

/** The whole entry's ceiling, well inside the ~5MB localStorage budget shared with everything else. */
export const MAX_DRAFT_CHARS = 100_000

export interface SparkDraft {
  v: number
  scope: string
  /** Epoch ms of the last write. Expiry counts from here, not from when it was first started. */
  savedAt: number
  /** The step the author was on. Recorded for diagnostics; the shell does not jump them there
   *  (the step machine belongs to the wizard, and the kit does not reach into it). */
  step: number
  values: Record<string, string>
}

/** The slice of the Storage API this module uses. Lets tests pass a plain object. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  readonly length: number
  key(index: number): string | null
}

// ── Keys ─────────────────────────────────────────────────────────────────────────────────────

const slug = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/**
 * The scope a draft is filed under, built from whatever the surface can say about itself without
 * naming an entity (its route and its eyebrow). Entity-agnostic on purpose: the kit never learns
 * that "New Journey" is a Journey, it only knows this is a different Spark from that one.
 */
export function draftScope(parts: readonly (string | null | undefined)[]): string {
  return parts
    .map((p) => (p ? slug(p) : ''))
    .filter(Boolean)
    .join('.')
}

export function draftStorageKey(scope: string): string {
  return `${DRAFT_PREFIX}v${DRAFT_VERSION}.${scope}`
}

// ── What may be saved ────────────────────────────────────────────────────────────────────────

/** A control, described without depending on the DOM so the rules stay testable. */
export interface FieldDescriptor {
  tag: 'input' | 'textarea' | 'select'
  type?: string | null
  id?: string | null
  name?: string | null
  ariaLabel?: string | null
  autocomplete?: string | null
  /** `data-spark-draft="off"` on a control keeps it out of the draft entirely. */
  optOut?: boolean
  /** Position among the draftable controls on this step. Only used when nothing else identifies it. */
  index: number
}

/** Input types that are never a draft: a secret, a machine value, or not a value at all. Radio is
 *  excluded because a group shares one name, so capturing members separately would fight itself. */
const REFUSED_TYPES = new Set(['password', 'hidden', 'file', 'submit', 'button', 'reset', 'image', 'radio'])

/** Autocomplete hints the browser itself marks as credential or payment data. */
const REFUSED_AUTOCOMPLETE = /^(cc-|current-password|new-password|one-time-code)/i

/** Belt and braces for a control that carries no autocomplete hint but is plainly sensitive. */
const REFUSED_NAME = /pass(word|code)|secret|token|api.?key|cvc|cvv|card.?number|\bssn\b|routing|iban/i

/**
 * The SECOND gate on the refusal list, applied to a stored KEY rather than to a live control.
 *
 * The first gate (`isDraftable`) is the real one: it sees the control, so it sees the input type,
 * the autocomplete hint and the opt-out attribute, and a refused field never enters the draft at
 * all. This one sees only what a key can carry, which is the field's name. It exists because the
 * sync layer writes into the database, where a leaked secret is worse than it is in one browser,
 * and a gate that runs on the way IN cannot be skipped by a caller that got the collection wrong.
 */
export function isRefusedKey(key: string): boolean {
  return REFUSED_NAME.test(key)
}

/** Drop anything the key-level refusal catches. Used by the server store before a row is written. */
export function refuseNamedSecrets(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).filter(([k]) => !isRefusedKey(k)))
}

/**
 * Whether this control's value may be written to the store. The default is yes: a Spark asks the
 * author to describe what they are making, and that is the thing worth not losing. The refusals are
 * narrow and explicit, so a new field kind does not have to remember to opt in.
 */
export function isDraftable(desc: FieldDescriptor): boolean {
  if (desc.optOut) return false
  if (desc.tag === 'input' && REFUSED_TYPES.has((desc.type ?? 'text').toLowerCase())) return false
  if (desc.autocomplete && REFUSED_AUTOCOMPLETE.test(desc.autocomplete.trim())) return false
  const named = `${desc.name ?? ''} ${desc.id ?? ''} ${desc.ariaLabel ?? ''}`
  return !REFUSED_NAME.test(named)
}

/**
 * The stable name a value is filed under. Identity first (`name`, then `id`, then the accessible
 * name), because those survive the author moving between steps and the field list changing shape.
 *
 * The Studio kit already gives every declared control an `id` of its manifest path (`answers.who`),
 * so in practice a Spark field keys itself. Only an anonymous one-off control falls through to the
 * positional key, which is scoped to its step so two of them cannot collide.
 */
export function fieldKey(desc: FieldDescriptor, step: number): string {
  const identity = desc.name?.trim() || desc.id?.trim() || desc.ariaLabel?.trim()
  return identity ? `f.${slug(identity)}` : `s${step}.${desc.tag}.${desc.index}`
}

// ── Size ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Drop what is empty or oversized, then shed the largest remaining values until the entry fits.
 * Losing the biggest paste is better than losing the whole draft to a quota error. PURE.
 */
export function capValues(values: Record<string, string>): Record<string, string> {
  const kept: [string, string][] = Object.entries(values)
    .filter(([, v]) => typeof v === 'string' && v.trim().length > 0 && v.length <= MAX_VALUE_CHARS)

  let total = kept.reduce((n, [k, v]) => n + k.length + v.length + 6, 0)
  if (total > MAX_DRAFT_CHARS) {
    // Largest first, so the smallest answers are the last thing to go.
    kept.sort((a, b) => b[1].length - a[1].length)
    while (kept.length > 0 && total > MAX_DRAFT_CHARS) {
      const [k, v] = kept.shift() as [string, string]
      total -= k.length + v.length + 6
    }
  }

  return Object.fromEntries(kept)
}

export function hasDraftContent(draft: SparkDraft | null): boolean {
  return !!draft && Object.keys(draft.values).length > 0
}

// ── Read / write / discard ───────────────────────────────────────────────────────────────────

function parse(raw: string | null, scope: string): SparkDraft | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<SparkDraft>
    if (parsed?.v !== DRAFT_VERSION) return null
    if (typeof parsed.savedAt !== 'number' || !Number.isFinite(parsed.savedAt)) return null
    if (!parsed.values || typeof parsed.values !== 'object' || Array.isArray(parsed.values)) return null
    const values: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed.values)) if (typeof v === 'string') values[k] = v
    return {
      v: DRAFT_VERSION,
      scope: typeof parsed.scope === 'string' ? parsed.scope : scope,
      savedAt: parsed.savedAt,
      step: typeof parsed.step === 'number' ? parsed.step : 1,
      values,
    }
  } catch {
    return null
  }
}

export function isExpired(draft: SparkDraft, now: number, ttlMs: number = DRAFT_TTL_MS): boolean {
  // A clock that jumped backwards (a corrected device clock, a restored backup) leaves a savedAt in
  // the future. Treat that as stale too rather than as immortal.
  return now - draft.savedAt > ttlMs || draft.savedAt > now + ttlMs
}

/** The stored draft for this scope, or null. Anything unreadable, mis-versioned, or stale is
 *  removed as it is read, so a bad entry cannot sit there being re-offered forever. */
export function readDraft(storage: StorageLike, scope: string, now: number = Date.now()): SparkDraft | null {
  const key = draftStorageKey(scope)
  let draft: SparkDraft | null = null
  try {
    draft = parse(storage.getItem(key), scope)
  } catch {
    return null
  }
  if (!draft || isExpired(draft, now)) {
    try {
      storage.removeItem(key)
    } catch {
      /* a full or blocked store still reads fine; nothing to do */
    }
    return null
  }
  return draft
}

/**
 * Write the draft for this scope. Returns what was stored, or null when there was nothing worth
 * storing (in which case any previous entry is discarded, so an author who clears every field is
 * not offered their own emptiness later).
 */
export function writeDraft(
  storage: StorageLike,
  scope: string,
  input: { step: number; values: Record<string, string> },
  now: number = Date.now(),
): SparkDraft | null {
  const values = capValues(input.values)
  if (Object.keys(values).length === 0) {
    discardDraft(storage, scope)
    return null
  }
  const draft: SparkDraft = { v: DRAFT_VERSION, scope, savedAt: now, step: input.step, values }
  try {
    storage.setItem(draftStorageKey(scope), JSON.stringify(draft))
  } catch {
    // Quota, private mode, or storage disabled. Autosave is an assist, never a blocker.
    return null
  }
  return draft
}

export function discardDraft(storage: StorageLike, scope: string): void {
  try {
    storage.removeItem(draftStorageKey(scope))
  } catch {
    /* nothing to do */
  }
}

/**
 * Remove every expired or unreadable Spark draft, whatever its scope. Runs when any Spark opens, so
 * abandoned drafts for entities the author never returns to still age out. Returns the count removed.
 */
/**
 * Erase EVERY Spark draft on this device, expired or not. Called on sign-out.
 *
 * 🔴 WHY THIS EXISTS, because it is the one function here that is about somebody else.
 *
 * A draft key is `frequency.spark.draft.v1.<route>.<eyebrow>` — it names the SURFACE and nothing
 * about the author. That is deliberate (the kit is entity-blind and has no identity to reach for),
 * and it is fine while a browser belongs to one person. It stops being fine on a shared device:
 * member A abandons a half-typed Circle, member B signs in on the same browser and opens the same
 * Spark, and `reconcileDrafts` finds A's local copy with no server copy to beat it. B is then shown
 * a card that says "**You** started this 2 hours ago", and "Restore answers" fills B's wizard with
 * A's unpublished writing. The draft store refuses passwords, payment fields and anything matching
 * the credential patterns above, so this is never secrets — but it is one member's text in another
 * member's form, under a sentence claiming they wrote it.
 *
 * Clearing on sign-out closes the path a member actually takes to hand the machine over, and it is
 * independently right: your unfinished writing should not outlive your session on a device you just
 * stepped away from. It does NOT close the path where A never signs out and B signs in on the same
 * browser — that needs the author folded into the key, which orphans every in-flight draft on the
 * day it ships and is therefore an owner's call, not a 3am one. Recorded rather than silently
 * half-fixed.
 *
 * Returns how many entries were removed. Never throws: private mode and a full quota both surface
 * as a throwing `Storage`, and a sign-out must not be the thing that fails.
 */
export function clearAllDrafts(storage: StorageLike): number {
  const doomed: string[] = []
  try {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i)
      if (key?.startsWith(DRAFT_PREFIX)) doomed.push(key)
    }
    for (const key of doomed) storage.removeItem(key)
  } catch {
    return 0
  }
  return doomed.length
}

export function pruneDrafts(storage: StorageLike, now: number = Date.now()): number {
  const doomed: string[] = []
  try {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i)
      if (!key || !key.startsWith(DRAFT_PREFIX)) continue
      const draft = parse(storage.getItem(key), '')
      if (!draft || isExpired(draft, now)) doomed.push(key)
    }
    for (const key of doomed) storage.removeItem(key)
  } catch {
    return 0
  }
  return doomed.length
}

// ── Copy helpers ─────────────────────────────────────────────────────────────────────────────

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "just now" / "6 minutes ago" / "yesterday". PURE, and rendered only after mount, so it never
 *  has to agree with a server render. */
export function savedAgoLabel(savedAt: number, now: number = Date.now()): string {
  const ago = Math.max(0, now - savedAt)
  if (ago < MINUTE) return 'just now'
  if (ago < HOUR) {
    const n = Math.floor(ago / MINUTE)
    return `${n} minute${n === 1 ? '' : 's'} ago`
  }
  if (ago < DAY) {
    const n = Math.floor(ago / HOUR)
    return `${n} hour${n === 1 ? '' : 's'} ago`
  }
  const days = Math.floor(ago / DAY)
  return days === 1 ? 'yesterday' : `${days} days ago`
}
