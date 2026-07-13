import { describe, it, expect } from 'vitest'
import {
  asMediaKind,
  asRecordingHostKind,
  asRecordingVisibility,
  asShowStatus,
  asFeedVisibility,
  attachmentKey,
  attachmentKeyOf,
  canViewRecording,
  isRecordingPublic,
  priceFromJson,
  effectiveRecordingPrice,
  effectiveRequiredEntitlement,
  type Recording,
} from './types'

// Airwaves P0 pure helpers (ADR-608): the narrowers, the attach key (the app-layer mirror of the DB
// unique index), the visibility gate (the private-Journey predicate), and the price mapping /
// override precedence. All PURE — no IO — so they are the unit-testable core the gated CRUD leans on.

describe('narrowers (default-deny / default-safe)', () => {
  it('asMediaKind accepts audio/video, rejects anything else', () => {
    expect(asMediaKind('audio')).toBe('audio')
    expect(asMediaKind('video')).toBe('video')
    expect(asMediaKind('image')).toBeNull()
    expect(asMediaKind('')).toBeNull()
    expect(asMediaKind(undefined)).toBeNull()
  })

  it('asRecordingVisibility defaults a garbage value to the table default (space)', () => {
    expect(asRecordingVisibility('public')).toBe('public')
    expect(asRecordingVisibility('private')).toBe('private')
    expect(asRecordingVisibility('space')).toBe('space')
    expect(asRecordingVisibility('nonsense')).toBe('space')
    expect(asRecordingVisibility(null)).toBe('space')
  })

  it('asRecordingHostKind accepts the six hosts, rejects others', () => {
    for (const k of ['space', 'journey', 'journey_item', 'practice', 'event', 'product']) {
      expect(asRecordingHostKind(k)).toBe(k)
    }
    expect(asRecordingHostKind('show')).toBeNull()
    expect(asRecordingHostKind('')).toBeNull()
  })

  it('asShowStatus / asFeedVisibility default safely', () => {
    expect(asShowStatus('published')).toBe('published')
    expect(asShowStatus('wat')).toBe('draft')
    expect(asFeedVisibility('private')).toBe('private')
    expect(asFeedVisibility('wat')).toBe('public')
  })
})

describe('attachmentKey', () => {
  it('is the recording:host_kind:host_id triple', () => {
    expect(attachmentKey('rec1', 'event', 'ev9')).toBe('rec1:event:ev9')
  })

  it('matches attachmentKeyOf for the same triple (DB unique-index parity)', () => {
    const a = { recordingId: 'rec1', hostKind: 'journey_item' as const, hostId: 'ji5' }
    expect(attachmentKeyOf(a)).toBe(attachmentKey('rec1', 'journey_item', 'ji5'))
    expect(attachmentKeyOf(a)).toBe('rec1:journey_item:ji5')
  })

  it('distinguishes the same recording on different hosts', () => {
    expect(attachmentKey('rec1', 'event', 'x')).not.toBe(attachmentKey('rec1', 'practice', 'x'))
  })
})

describe('canViewRecording (the private-Journey predicate)', () => {
  it('admits a public recording to anyone', () => {
    expect(canViewRecording({ visibility: 'public' }, false)).toBe(true)
  })

  it('admits a space recording to anyone at the DB floor (finer gate is app-layer)', () => {
    expect(canViewRecording({ visibility: 'space' }, false)).toBe(true)
  })

  it('walls a private recording to non-members', () => {
    expect(canViewRecording({ visibility: 'private' }, false)).toBe(false)
  })

  it('admits a private recording to a Space member', () => {
    expect(canViewRecording({ visibility: 'private' }, true)).toBe(true)
  })
})

describe('isRecordingPublic (RSS / public-page floor)', () => {
  const now = new Date('2026-07-13T00:00:00Z')

  it('is true only for a public recording published in the past', () => {
    expect(isRecordingPublic({ visibility: 'public', publishedAt: '2026-07-01T00:00:00Z' }, now)).toBe(true)
  })

  it('is false for a space or private recording even if published', () => {
    expect(isRecordingPublic({ visibility: 'space', publishedAt: '2026-07-01T00:00:00Z' }, now)).toBe(false)
    expect(isRecordingPublic({ visibility: 'private', publishedAt: '2026-07-01T00:00:00Z' }, now)).toBe(false)
  })

  it('is false when unpublished or scheduled for the future', () => {
    expect(isRecordingPublic({ visibility: 'public', publishedAt: null }, now)).toBe(false)
    expect(isRecordingPublic({ visibility: 'public', publishedAt: '2027-01-01T00:00:00Z' }, now)).toBe(false)
  })
})

describe('priceFromJson', () => {
  it('reads a null / garbage blob as free (a mode, never 0)', () => {
    expect(priceFromJson(null)).toEqual({ mode: 'free' })
    expect(priceFromJson(undefined)).toEqual({ mode: 'free' })
    expect(priceFromJson('nope')).toEqual({ mode: 'free' })
    expect(priceFromJson([])).toEqual({ mode: 'free' })
  })

  it('normalizes a stored fixed price', () => {
    expect(priceFromJson({ mode: 'fixed', amountCents: 4000 })).toEqual({ mode: 'fixed', amountCents: 4000 })
  })

  it('normalizes an unknown mode to fixed (matches the Price primitive)', () => {
    expect(priceFromJson({ mode: 'wat' }).mode).toBe('fixed')
  })
})

describe('effectiveRecordingPrice (override precedence)', () => {
  it('uses the recording price when the attach sets no override', () => {
    expect(effectiveRecordingPrice({ mode: 'fixed', amountCents: 500 }, null)).toEqual({
      mode: 'fixed',
      amountCents: 500,
    })
    expect(effectiveRecordingPrice({ mode: 'free' }, undefined)).toEqual({ mode: 'free' })
  })

  it('the per-attach override wins when present', () => {
    expect(
      effectiveRecordingPrice({ mode: 'fixed', amountCents: 500 }, { mode: 'free' }),
    ).toEqual({ mode: 'free' })
    expect(
      effectiveRecordingPrice({ mode: 'free' }, { mode: 'fixed', amountCents: 999 }),
    ).toEqual({ mode: 'fixed', amountCents: 999 })
  })

  it('normalizes both sides (garbage mode -> fixed)', () => {
    expect(effectiveRecordingPrice({ mode: 'free' }, { mode: 'wat' } as never).mode).toBe('fixed')
  })
})

describe('effectiveRequiredEntitlement (override precedence)', () => {
  it('inherits the recording gate when the attach sets none', () => {
    expect(effectiveRequiredEntitlement('space_airwaves_premium', null)).toBe('space_airwaves_premium')
    expect(effectiveRequiredEntitlement('space_airwaves_premium', '  ')).toBe('space_airwaves_premium')
  })

  it('the per-attach override wins when set', () => {
    expect(effectiveRequiredEntitlement('a', 'b')).toBe('b')
  })

  it('reads a blank / null gate as no gate', () => {
    expect(effectiveRequiredEntitlement(null, null)).toBeNull()
    expect(effectiveRequiredEntitlement('', undefined)).toBeNull()
  })
})

// A tiny compile-time anchor: the canonical Recording shape sibling agents import stays stable.
describe('Recording type', () => {
  it('maps its columns (smoke: a fully-formed row assigns)', () => {
    const r: Recording = {
      id: 'r1',
      spaceId: 's1',
      showId: null,
      loomAssetId: 'a1',
      mediaKind: 'audio',
      title: 'Ep 1',
      slug: 'ep-1',
      description: null,
      transcript: null,
      chapters: null,
      durationSeconds: 1800,
      price: { mode: 'free' },
      requiredEntitlement: null,
      visibility: 'space',
      publishedAt: null,
      sortOrder: 0,
      createdAt: '2026-07-13T00:00:00Z',
      updatedAt: '2026-07-13T00:00:00Z',
    }
    expect(r.mediaKind).toBe('audio')
    expect(canViewRecording(r, false)).toBe(true)
  })
})
