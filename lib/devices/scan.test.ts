import { beforeEach, describe, expect, it, vi } from 'vitest'

// LIVE-1125: a card scan resolves device → Space → member and hands the Space's own check-in to
// captureNode with a freshly signed code and the Space's pin. Everything downstream (ledger, stamps,
// Zaps, hunts, CRM) is captureNode's, so this pins the hand-off and the card checks around it.

process.env.UNSUBSCRIBE_SECRET = 'test-signing-key-for-card-uids-000'

const SPACE = 's-1'
const NODE = 'node-1'
const device = { id: 'd-1', spaceId: SPACE, label: 'Front counter' }

type Card = { id: string; profileId: string; spaceId: string | null; uidHash: string | null; cardNumber: number | null; faceSpaceId: string | null }
let card: Card | null
const face = (over: Partial<{ paused: boolean; cardholderPerk: string | null }> = {}) => ({
  mode: 'page',
  linkUrl: null,
  showPhone: false,
  showEmail: false,
  showLinks: true,
  swapBack: true,
  paused: false,
  cardholderPerk: null,
  ...over,
})
let memberFace = face()
let spaceFaces: Record<string, ReturnType<typeof face>> = {}
const readMemberFace = vi.fn(async () => memberFace)
const readSpaceFace = vi.fn(async (id: string) => spaceFaces[id] ?? face())
let node: { id: string; space_id: string | null; kind: string } | null
const capture = vi.fn()
const bind = vi.fn(async () => {})
const touch = vi.fn(async () => {})

vi.mock('./store', () => ({
  findActiveCard: async () => card,
  bindCardUid: bind,
  touchCard: touch,
  readMemberName: async () => 'Maya',
  readSpacePin: async () => ({ lat: 33.1, lng: -117.2 }),
}))
vi.mock('@/lib/spaces/checkin', () => ({ readCheckinNode: async () => node }))
vi.mock('@/lib/qr/node-code', () => ({ signNodeCode: (id: string) => `v1.signed.${id}` }))
vi.mock('@/lib/engagement/capture', () => ({ captureNode: capture }))
vi.mock('@/lib/member-cards/store', () => ({ readMemberFace, readSpaceFace }))

const { scanCard } = await import('./scan')
const { hashUid } = await import('./credentials')

beforeEach(() => {
  card = { id: 'c-1', profileId: 'p-1', spaceId: SPACE, uidHash: null, cardNumber: null, faceSpaceId: null }
  memberFace = face()
  spaceFaces = {}
  readMemberFace.mockClear()
  readSpaceFace.mockClear()
  node = { id: NODE, space_id: SPACE, kind: 'checkin' }
  capture.mockReset()
  capture.mockResolvedValue({
    ok: true,
    zapsAwarded: 25,
    loyalty: { stamps: 6, required: 6, rewardTitle: 'Free coffee', earnedCode: 'K7Q2MX', surprise: false, standing: { regular: true, streakWeeks: 2 } },
  })
  bind.mockClear()
  touch.mockClear()
})

describe('scanCard', () => {
  it('checks the card holder in on the Space node through captureNode', async () => {
    const out = await scanCard(device, { cardToken: 'tok', uid: '04A21F9C' })
    expect(capture).toHaveBeenCalledWith({
      nodeId: NODE,
      actorProfileId: 'p-1',
      presentedSecret: `v1.signed.${NODE}`,
      location: { lat: 33.1, lng: -117.2 },
      medium: 'device',
    })
    expect(out).toEqual({
      ok: true,
      member: { display_name: 'Maya' },
      zapsAwarded: 25,
      loyalty: { stamps: 6, required: 6, earned: true, reward_code: 'K7Q2MX' },
      greeting: 'Welcome back, Maya',
    })
    expect(bind).toHaveBeenCalledWith('c-1', hashUid('04A21F9C'))
    expect(touch).toHaveBeenCalledWith('c-1')
  })

  it('omits reward_code until the card fills, and sends null loyalty when the Space runs none', async () => {
    capture.mockResolvedValueOnce({ ok: true, zapsAwarded: 25, loyalty: { stamps: 3, required: 6, earnedCode: null } })
    expect((await scanCard(device, { cardToken: 'tok', uid: null })).loyalty).toEqual({ stamps: 3, required: 6, earned: false })
    capture.mockResolvedValueOnce({ ok: true, zapsAwarded: 0, loyalty: null })
    expect((await scanCard(device, { cardToken: 'tok', uid: null })).loyalty).toBeNull()
  })

  it('passes a second same-day tap through as already_captured, with the name', async () => {
    capture.mockResolvedValueOnce({ ok: false, reason: 'already_captured' })
    expect(await scanCard(device, { cardToken: 'tok', uid: null })).toEqual({
      ok: false,
      reason: 'already_captured',
      member: { display_name: 'Maya' },
      zapsAwarded: 0,
      loyalty: null,
    })
  })

  it('refuses an unknown card and a card from another Space without checking anyone in', async () => {
    card = null
    expect((await scanCard(device, { cardToken: 'tok', uid: null })).reason).toBe('unknown_card')
    card = { id: 'c-2', profileId: 'p-1', spaceId: 'other-space', uidHash: null, cardNumber: null, faceSpaceId: null }
    const out = await scanCard(device, { cardToken: 'tok', uid: null })
    expect(out).toMatchObject({ ok: false, reason: 'unknown_card', member: null })
    expect(capture).not.toHaveBeenCalled()
  })

  it('takes a Frequency-wide card (no space_id) at any Space', async () => {
    card = { id: 'c-3', profileId: 'p-1', spaceId: null, uidHash: null, cardNumber: 42, faceSpaceId: null }
    expect((await scanCard(device, { cardToken: 'tok', uid: null })).ok).toBe(true)
  })

  it('refuses a bound card on a different chip, or with no UID', async () => {
    card = { id: 'c-1', profileId: 'p-1', spaceId: SPACE, uidHash: hashUid('04A21F9C'), cardNumber: null, faceSpaceId: null }
    expect((await scanCard(device, { cardToken: 'tok', uid: '04A21F9D' })).reason).toBe('card_mismatch')
    expect((await scanCard(device, { cardToken: 'tok', uid: null })).reason).toBe('card_mismatch')
    expect(capture).not.toHaveBeenCalled()
    expect((await scanCard(device, { cardToken: 'tok', uid: '04A21F9C' })).ok).toBe(true)
    expect(bind).not.toHaveBeenCalled()
  })

  it('says so when the Space has no door node yet', async () => {
    node = null
    expect(await scanCard(device, { cardToken: 'tok', uid: null })).toMatchObject({ ok: false, reason: 'checkin_not_set_up' })
    expect(capture).not.toHaveBeenCalled()
  })
  // LIVE-1282: member cards.
  it('adds the cardholder perk line for a numbered member card at a Space that set one', async () => {
    card = { id: 'c-4', profileId: 'p-1', spaceId: null, uidHash: null, cardNumber: 42, faceSpaceId: null }
    spaceFaces[SPACE] = face({ cardholderPerk: 'free oat milk upgrade' })
    const out = await scanCard(device, { cardToken: 'tok', uid: null })
    expect(out).toMatchObject({ ok: true, greeting: 'Welcome back, Maya', perk: 'Cardholder perk: free oat milk upgrade' })
    expect(readSpaceFace).toHaveBeenCalledWith(SPACE)
  })

  it('leaves the perk off an unnumbered card, a Space card, and a Space with no perk', async () => {
    spaceFaces[SPACE] = face({ cardholderPerk: 'free oat milk upgrade' })
    expect(await scanCard(device, { cardToken: 'tok', uid: null })).not.toHaveProperty('perk')
    card = { id: 'c-5', profileId: 'p-1', spaceId: SPACE, uidHash: null, cardNumber: 7, faceSpaceId: SPACE }
    expect(await scanCard(device, { cardToken: 'tok', uid: null })).not.toHaveProperty('perk')
    spaceFaces = {}
    card = { id: 'c-6', profileId: 'p-1', spaceId: null, uidHash: null, cardNumber: 8, faceSpaceId: null }
    expect(await scanCard(device, { cardToken: 'tok', uid: null })).not.toHaveProperty('perk')
  })

  it('refuses a card whose holder paused their face, with the name, and checks nobody in', async () => {
    memberFace = face({ paused: true })
    expect(await scanCard(device, { cardToken: 'tok', uid: null })).toEqual({
      ok: false,
      reason: 'card_paused',
      member: { display_name: 'Maya' },
      zapsAwarded: 0,
      loyalty: null,
    })
    expect(capture).not.toHaveBeenCalled()
  })

  it('reads a Space card against its Space face, not the holder face', async () => {
    card = { id: 'c-7', profileId: 'p-1', spaceId: SPACE, uidHash: null, cardNumber: 9, faceSpaceId: SPACE }
    memberFace = face({ paused: true })
    expect((await scanCard(device, { cardToken: 'tok', uid: null })).ok).toBe(true)
    expect(readMemberFace).not.toHaveBeenCalled()
    spaceFaces[SPACE] = face({ paused: true })
    expect((await scanCard(device, { cardToken: 'tok', uid: null })).reason).toBe('card_paused')
  })

  it('keeps the greeting plain when the holder has no display name', async () => {
    const { greetingFor, perkLine } = await import('./scan')
    expect(greetingFor('Member')).toBe('Welcome back')
    expect(perkLine('  ')).toBeNull()
  })
})
