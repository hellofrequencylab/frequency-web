import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { member } from './member-profile-modules.fixture'
import { toMemberEntity, resolveMemberBlockData } from '@/lib/entity-blocks/member-adapter'
import { TipBlock } from './tip'

const mocks = vi.hoisted(() => ({ live: vi.fn(), status: vi.fn() }))
vi.mock('@/lib/billing/connect', () => ({ payoutsLive: mocks.live, getConnectStatus: mocks.status }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

function html(canTip: boolean) {
  const m = { ...member(), canTip }
  return renderToStaticMarkup(<TipBlock member={toMemberEntity(m)} data={resolveMemberBlockData(m)} />)
}

describe('TipBlock', () => {
  it('renders nothing when the member cannot receive tips', () => {
    expect(html(false)).toBe('')
  })

  it('links to the in-app tip door and states the 0% fee when they can', () => {
    const out = html(true)
    expect(out).toContain('href="/people/ada#tip"')
    expect(out).toContain('Send a tip')
    expect(out).toContain('0% platform fee')
  })
})

describe('readCanTip', () => {
  beforeEach(() => {
    mocks.live.mockReset()
    mocks.status.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('is true only when payouts are live and the member is ready', async () => {
    const { readCanTip } = await import('@/lib/spotlight/data')
    mocks.live.mockResolvedValue(true)
    mocks.status.mockResolvedValue({ ready: true })
    expect(await readCanTip('p1')).toBe(true)
    mocks.status.mockResolvedValue({ ready: false })
    expect(await readCanTip('p1')).toBe(false)
    mocks.live.mockResolvedValue(false)
    mocks.status.mockResolvedValue({ ready: true })
    expect(await readCanTip('p1')).toBe(false)
  })

  it('fails closed when a read throws', async () => {
    const { readCanTip } = await import('@/lib/spotlight/data')
    mocks.live.mockRejectedValue(new Error('boom'))
    expect(await readCanTip('p1')).toBe(false)
  })
})
