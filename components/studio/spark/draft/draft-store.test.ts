import { describe, expect, it } from 'vitest'
import {
  DRAFT_PREFIX,
  DRAFT_TTL_MS,
  MAX_DRAFT_CHARS,
  MAX_VALUE_CHARS,
  capValues,
  discardDraft,
  draftScope,
  draftStorageKey,
  fieldKey,
  hasDraftContent,
  isDraftable,
  isExpired,
  pruneDrafts,
  readDraft,
  savedAgoLabel,
  writeDraft,
  type FieldDescriptor,
  type StorageLike,
} from './draft-store'

/** A localStorage stand-in. `broken` models private mode / a full quota, where every write throws. */
function fakeStorage(seed: Record<string, string> = {}, broken = false): StorageLike & { map: Map<string, string> } {
  const map = new Map(Object.entries(seed))
  return {
    map,
    get length() {
      return map.size
    },
    key: (i) => Array.from(map.keys())[i] ?? null,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      if (broken) throw new Error('QuotaExceededError')
      map.set(k, v)
    },
    removeItem: (k) => {
      if (broken) throw new Error('SecurityError')
      map.delete(k)
    },
  }
}

const NOW = 1_800_000_000_000
const desc = (over: Partial<FieldDescriptor> = {}): FieldDescriptor => ({ tag: 'input', index: 0, ...over })

describe('keying', () => {
  it('builds a scope from route + eyebrow, and never leaks punctuation into the key', () => {
    expect(draftScope(['/journeys/new', 'New Journey'])).toBe('journeys-new.new-journey')
    expect(draftStorageKey(draftScope(['/journeys/new', 'New Journey']))).toBe(
      `${DRAFT_PREFIX}v1.journeys-new.new-journey`,
    )
  })

  it('keeps two Sparks apart, and the same Spark together across visits', () => {
    const journey = draftScope(['/journeys/new', 'New Journey'])
    const practice = draftScope(['/practices/new', 'New Practice'])
    expect(journey).not.toBe(practice)
    expect(draftScope(['/journeys/new', 'New Journey'])).toBe(journey)
  })

  it('drops empty parts rather than leaving a dangling separator', () => {
    expect(draftScope([null, 'New Event', undefined, ''])).toBe('new-event')
  })

  it('prefers a control identity over its position, so a field survives the step list changing', () => {
    expect(fieldKey(desc({ id: 'answers.who' }), 2)).toBe('f.answers-who')
    expect(fieldKey(desc({ id: 'answers.who' }), 5)).toBe('f.answers-who')
    expect(fieldKey(desc({ name: 'title', id: 'other' }), 1)).toBe('f.title')
    expect(fieldKey(desc({ ariaLabel: 'Course documents' }), 1)).toBe('f.course-documents')
  })

  it('falls back to a per-step position for an anonymous control, so two cannot collide', () => {
    expect(fieldKey(desc({ tag: 'textarea', index: 0 }), 3)).toBe('s3.textarea.0')
    expect(fieldKey(desc({ tag: 'textarea', index: 1 }), 3)).not.toBe(fieldKey(desc({ tag: 'textarea', index: 0 }), 3))
    expect(fieldKey(desc({ tag: 'textarea', index: 0 }), 4)).not.toBe(fieldKey(desc({ tag: 'textarea', index: 0 }), 3))
  })
})

describe('what may be saved', () => {
  it('saves the ordinary answer controls', () => {
    expect(isDraftable(desc({ id: 'answers.who' }))).toBe(true)
    expect(isDraftable(desc({ tag: 'textarea', id: 'spark-source' }))).toBe(true)
    expect(isDraftable(desc({ tag: 'select', id: 'answers.pace' }))).toBe(true)
    expect(isDraftable(desc({ type: 'checkbox', id: 'settings.public' }))).toBe(true)
  })

  it('refuses secrets, machine values, files, and radio groups', () => {
    expect(isDraftable(desc({ type: 'password' }))).toBe(false)
    expect(isDraftable(desc({ type: 'hidden' }))).toBe(false)
    expect(isDraftable(desc({ type: 'file' }))).toBe(false)
    expect(isDraftable(desc({ type: 'radio', name: 'pace' }))).toBe(false)
    expect(isDraftable(desc({ autocomplete: 'cc-number' }))).toBe(false)
    expect(isDraftable(desc({ autocomplete: 'one-time-code' }))).toBe(false)
    expect(isDraftable(desc({ name: 'stripe_secret' }))).toBe(false)
    expect(isDraftable(desc({ ariaLabel: 'Card number' }))).toBe(false)
  })

  it('honours an explicit opt-out', () => {
    expect(isDraftable(desc({ id: 'answers.who', optOut: true }))).toBe(false)
  })
})

describe('size', () => {
  it('drops blank values so an untouched form never becomes a draft', () => {
    expect(capValues({ 'f.a': '  ', 'f.b': '', 'f.c': 'real' })).toEqual({ 'f.c': 'real' })
  })

  it('refuses a single oversized value but keeps the small answers beside it', () => {
    const capped = capValues({ 'f.paste': 'x'.repeat(MAX_VALUE_CHARS + 1), 'f.who': 'busy parents' })
    expect(capped['f.paste']).toBeUndefined()
    expect(capped['f.who']).toBe('busy parents')
  })

  it('sheds the largest values until the whole entry fits', () => {
    const big = 'y'.repeat(MAX_VALUE_CHARS)
    const values: Record<string, string> = { 'f.who': 'short' }
    for (let i = 0; i < 12; i += 1) values[`f.big${i}`] = big
    const capped = capValues(values)
    const total = Object.entries(capped).reduce((n, [k, v]) => n + k.length + v.length + 6, 0)
    expect(total).toBeLessThanOrEqual(MAX_DRAFT_CHARS)
    expect(capped['f.who']).toBe('short')
  })
})

describe('write, read, and expiry', () => {
  it('round-trips a draft', () => {
    const store = fakeStorage()
    writeDraft(store, 'journeys-new.new-journey', { step: 3, values: { 'f.answers-who': 'busy parents' } }, NOW)
    const back = readDraft(store, 'journeys-new.new-journey', NOW + 1000)
    expect(back?.values['f.answers-who']).toBe('busy parents')
    expect(back?.step).toBe(3)
  })

  it('stores nothing (and clears what was there) when every field is empty', () => {
    const store = fakeStorage()
    writeDraft(store, 'a', { step: 1, values: { 'f.who': 'typed' } }, NOW)
    expect(readDraft(store, 'a', NOW)).not.toBeNull()
    expect(writeDraft(store, 'a', { step: 1, values: { 'f.who': '   ' } }, NOW)).toBeNull()
    expect(readDraft(store, 'a', NOW)).toBeNull()
  })

  it('keeps a draft inside the week and drops it after', () => {
    const store = fakeStorage()
    writeDraft(store, 'a', { step: 1, values: { 'f.who': 'typed' } }, NOW)
    expect(readDraft(store, 'a', NOW + DRAFT_TTL_MS - 1)).not.toBeNull()
    expect(readDraft(store, 'a', NOW + DRAFT_TTL_MS + 1)).toBeNull()
  })

  it('removes the stale entry as it reads it, so it cannot be offered twice', () => {
    const store = fakeStorage()
    writeDraft(store, 'a', { step: 1, values: { 'f.who': 'typed' } }, NOW)
    readDraft(store, 'a', NOW + DRAFT_TTL_MS + 1)
    expect(store.map.has(draftStorageKey('a'))).toBe(false)
  })

  it('counts the week from the last write, not from the first', () => {
    const store = fakeStorage()
    writeDraft(store, 'a', { step: 1, values: { 'f.who': 'first' } }, NOW)
    writeDraft(store, 'a', { step: 2, values: { 'f.who': 'still going' } }, NOW + DRAFT_TTL_MS - 1000)
    expect(readDraft(store, 'a', NOW + DRAFT_TTL_MS + 1000)).not.toBeNull()
  })

  it('treats a draft from the future as stale (a corrected device clock)', () => {
    const draft = { v: 1, scope: 'a', savedAt: NOW + DRAFT_TTL_MS * 3, step: 1, values: { x: 'y' } }
    expect(isExpired(draft, NOW)).toBe(true)
  })

  it('drops an entry written by an older shape', () => {
    const store = fakeStorage({ [draftStorageKey('a')]: JSON.stringify({ v: 0, savedAt: NOW, values: { x: 'y' } }) })
    expect(readDraft(store, 'a', NOW)).toBeNull()
  })

  it('survives unparseable junk', () => {
    const store = fakeStorage({ [draftStorageKey('a')]: '{not json' })
    expect(readDraft(store, 'a', NOW)).toBeNull()
  })

  it('never throws when storage is blocked or full', () => {
    const store = fakeStorage({}, true)
    expect(() => writeDraft(store, 'a', { step: 1, values: { 'f.who': 'typed' } }, NOW)).not.toThrow()
    expect(writeDraft(store, 'a', { step: 1, values: { 'f.who': 'typed' } }, NOW)).toBeNull()
    expect(() => discardDraft(store, 'a')).not.toThrow()
    expect(() => pruneDrafts(store, NOW)).not.toThrow()
  })
})

describe('discard', () => {
  it('leaves nothing behind for this Spark', () => {
    const store = fakeStorage()
    writeDraft(store, 'a', { step: 2, values: { 'f.who': 'typed' } }, NOW)
    discardDraft(store, 'a')
    expect(readDraft(store, 'a', NOW)).toBeNull()
    expect(store.map.size).toBe(0)
  })

  it('touches only the Spark it was asked about', () => {
    const store = fakeStorage()
    writeDraft(store, 'a', { step: 1, values: { 'f.who': 'a' } }, NOW)
    writeDraft(store, 'b', { step: 1, values: { 'f.who': 'b' } }, NOW)
    discardDraft(store, 'a')
    expect(readDraft(store, 'a', NOW)).toBeNull()
    expect(readDraft(store, 'b', NOW)?.values['f.who']).toBe('b')
  })

  it('is idempotent', () => {
    const store = fakeStorage()
    discardDraft(store, 'never-existed')
    expect(() => discardDraft(store, 'never-existed')).not.toThrow()
  })
})

describe('pruning', () => {
  it('clears every stale Spark draft and keeps the live ones', () => {
    const store = fakeStorage()
    writeDraft(store, 'old', { step: 1, values: { 'f.who': 'ancient' } }, NOW - DRAFT_TTL_MS * 2)
    writeDraft(store, 'fresh', { step: 1, values: { 'f.who': 'today' } }, NOW)
    store.map.set('unrelated.key', 'someone elses value')

    expect(pruneDrafts(store, NOW)).toBe(1)
    expect(readDraft(store, 'old', NOW)).toBeNull()
    expect(readDraft(store, 'fresh', NOW)).not.toBeNull()
    expect(store.map.get('unrelated.key')).toBe('someone elses value')
  })
})

describe('the offer', () => {
  it('is only made when there is something to restore', () => {
    expect(hasDraftContent(null)).toBe(false)
    expect(hasDraftContent({ v: 1, scope: 'a', savedAt: NOW, step: 1, values: {} })).toBe(false)
    expect(hasDraftContent({ v: 1, scope: 'a', savedAt: NOW, step: 1, values: { 'f.who': 'x' } })).toBe(true)
  })

  it('says when it was saved, in plain words', () => {
    expect(savedAgoLabel(NOW - 5_000, NOW)).toBe('just now')
    expect(savedAgoLabel(NOW - 60_000, NOW)).toBe('1 minute ago')
    expect(savedAgoLabel(NOW - 6 * 60_000, NOW)).toBe('6 minutes ago')
    expect(savedAgoLabel(NOW - 2 * 3_600_000, NOW)).toBe('2 hours ago')
    expect(savedAgoLabel(NOW - 26 * 3_600_000, NOW)).toBe('yesterday')
    expect(savedAgoLabel(NOW - 3 * 86_400_000, NOW)).toBe('3 days ago')
  })
})
