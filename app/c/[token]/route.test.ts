import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_FACE, type CardFace, type CardOwner } from '@/lib/member-cards/face'

// /c/<token>, what a phone tap on a member card opens (LIVE-1125, then LIVE-1282 / ADR-1874). With the
// switch off it keeps its first behaviour (the reader's own rewards). With it on, the card's FACE
// decides: the owner's page, one link, the virtual card, a paused notice, or the owner's own settings.
// It never checks anyone in; a revoked or unknown card lands on /code-unavailable.

let profileId: string | null = 'p-tapper'
let enabled = true
let referrals = true
let card: { cardId: string; cardNumber: number | null; holderProfileId: string; owner: CardOwner; face: CardFace } | null

const resolve = vi.fn(async () => card)
const logTap = vi.fn(async () => {})
const capture = vi.fn(async () => 'contact-1')
const payConnect = vi.fn(async () => null)

vi.mock('@/lib/auth', () => ({ getMyProfileId: async () => profileId }))
vi.mock('@/lib/member-cards/store', () => ({
  memberCardsEnabled: () => enabled,
  resolveTappedCard: resolve,
  logCardTap: logTap,
}))
vi.mock('@/lib/member-cards/rewards', () => ({ payCardConnect: payConnect }))
vi.mock('@/lib/connections/qr-capture', () => ({ captureQrContact: capture }))
vi.mock('@/lib/platform-flags', () => ({ referralsEnabled: async () => referrals }))

const TOKEN = 'abcdefghijklmnopqrstuv'
const MEMBER: CardOwner = { kind: 'member', profileId: 'p-owner', handle: 'maya' }
const SPACE: CardOwner = { kind: 'space', spaceId: 's-1', slug: 'river-studio' }
const memberCard = (face: Partial<CardFace> = {}, owner: CardOwner = MEMBER) => ({
  cardId: 'card-1',
  cardNumber: 42,
  holderProfileId: 'p-owner',
  owner,
  face: { ...DEFAULT_FACE, ...face },
})

const tap = async (token = TOKEN) => {
  const { GET } = await import('./route')
  return GET(new Request(`https://frequencylocal.com/c/${token}`), { params: Promise.resolve({ token }) })
}
const where = (res: Response) => new URL(res.headers.get('location') ?? '')

beforeEach(() => {
  profileId = 'p-tapper'
  enabled = true
  referrals = true
  card = memberCard()
  for (const m of [resolve, logTap, capture, payConnect]) m.mockClear()
})

describe('GET /c/<token> with the switch off', () => {
  it('keeps the first behaviour: the reader’s own rewards, no lookup', async () => {
    enabled = false
    expect(where(await tap()).pathname).toBe('/rewards')
    profileId = null
    const to = where(await tap())
    expect(to.pathname).toBe('/sign-in')
    expect(to.searchParams.get('next')).toBe('/rewards')
    expect(resolve).not.toHaveBeenCalled()
  })
})

describe('GET /c/<token>', () => {
  it('says a revoked or unknown card is not active, and counts nothing', async () => {
    card = null
    expect(where(await tap()).pathname).toBe('/code-unavailable')
    expect(logTap).not.toHaveBeenCalled()
  })

  it('opens the member’s own page by default and counts the tap', async () => {
    expect(where(await tap()).pathname).toBe('/people/maya')
    expect(logTap).toHaveBeenCalledWith(card, 'open', 'p-tapper')
  })

  it('opens a Space card on the Space’s page', async () => {
    card = memberCard({}, SPACE)
    expect(where(await tap()).pathname).toBe('/spaces/river-studio')
    expect(capture).not.toHaveBeenCalled()
    expect(payConnect).not.toHaveBeenCalled()
  })

  it('opens a Frequency link as a temporary redirect', async () => {
    card = memberCard({ mode: 'link', linkUrl: 'https://www.frequencylocal.com/events' })
    const res = await tap()
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://www.frequencylocal.com/events')
  })

  it('opens another site through /card/<token>/go, so closing it lands on Frequency', async () => {
    card = memberCard({ mode: 'link', linkUrl: 'https://maya.example.com/' })
    const res = await tap()
    expect(res.status).toBe(307)
    const url = where(res)
    expect(url.pathname).toBe(`/card/${TOKEN}/go`)
    expect(url.searchParams.get('n')).toMatch(/^[0-9a-f]{8}$/)
  })

  it('opens the virtual card on /card/<token>', async () => {
    card = memberCard({ mode: 'card' })
    expect(where(await tap()).pathname).toBe(`/card/${TOKEN}`)
  })

  it('shows a paused card as paused, with no contact capture, no Zaps and no referral', async () => {
    card = memberCard({ paused: true, mode: 'link', linkUrl: 'https://maya.example.com/' })
    expect(where(await tap()).pathname).toBe(`/card/${TOKEN}`)
    expect(capture).not.toHaveBeenCalled()
    expect(payConnect).not.toHaveBeenCalled()
    profileId = null
    expect((await tap()).headers.get('set-cookie') ?? '').not.toContain('fq_ref')
  })

  it('sends the owner tapping their own new card to their card settings, and counts it', async () => {
    profileId = 'p-owner'
    expect(where(await tap()).pathname).toBe('/crew/card')
    expect(logTap).toHaveBeenCalledTimes(1)
    expect(capture).not.toHaveBeenCalled()
    expect(payConnect).not.toHaveBeenCalled()
  })

  it('keeps the owner as a contact for a signed-in tapper, one way, and pays the connect', async () => {
    await tap()
    expect(capture).toHaveBeenCalledWith('p-tapper', 'p-owner', { via: 'nfc_card' })
    // One way: the tapper lands in the owner's book only through Swap contacts (explicit consent).
    expect(capture).toHaveBeenCalledTimes(1)
    expect(payConnect).toHaveBeenCalledWith('p-tapper', 'p-owner')
  })

  it('still opens the page when the capture fails', async () => {
    capture.mockRejectedValueOnce(new Error('db down'))
    expect(where(await tap()).pathname).toBe('/people/maya')
  })

  it('drops the owner’s referral cookie for a signed-out tapper of a member card', async () => {
    profileId = null
    const res = await tap()
    expect(res.headers.get('set-cookie') ?? '').toMatch(/fq_ref=p-owner/)
    expect(capture).not.toHaveBeenCalled()
    expect(logTap).toHaveBeenCalledWith(card, 'open', null)
  })

  it('drops no referral cookie with referrals off, or for a Space card', async () => {
    profileId = null
    referrals = false
    expect((await tap()).headers.get('set-cookie') ?? '').not.toContain('fq_ref')
    referrals = true
    card = memberCard({}, SPACE)
    expect((await tap()).headers.get('set-cookie') ?? '').not.toContain('fq_ref')
  })
})
