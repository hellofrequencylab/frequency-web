// FH-046S, FH-047S: the Trail giving section. Nothing renders without an approved record, and an unpaid
// sponsor pledge is worded apart from gifts received.
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const data = vi.hoisted(() => ({ ask: null as unknown, totals: [] as unknown[], sponsor: null as unknown, calls: 0 }))
vi.mock('@/lib/hunts/donation-sync', () => ({
  openDonationAsk: async () => { data.calls += 1; return data.ask },
  huntGiftTotals: async () => data.totals,
}))
vi.mock('@/lib/hunts/sponsor-settlement', () => ({ sponsorMoneyLines: async () => { data.calls += 1; return data.sponsor } }))
vi.mock('@/components/spaces/donations/donate-form', () => ({ DonateForm: (p: { spaceId: string; huntId?: string }) => <form data-space={p.spaceId} data-hunt={p.huntId} /> }))

import { HuntFundraising } from './hunt-fundraising'

const ask = { askId: 'a1', beneficiarySpaceId: 's1', beneficiaryName: 'Community Food Pantry', purpose: 'Stock the pantry.', suggestedAmountsCents: [500] }
const lines = { sponsorLabel: 'Harbor Hardware', currency: 'USD', donationsRaisedCents: 1750, sponsorPledgedCents: 50_000, sponsorPaidCents: 0 }
// The open half is an async Server Component: resolve it by hand, the way the server renderer would.
async function render(): Promise<string> {
  const outer = HuntFundraising({ huntId: 'h1' })
  if (!outer) return ''
  const inner = await (outer.type as (p: { huntId: string }) => Promise<React.ReactElement | null>)(outer.props)
  return inner ? renderToStaticMarkup(inner) : ''
}

beforeEach(() => {
  vi.stubEnv('HUNTS_ENABLED', 'on')
  vi.stubEnv('HUNTS_COMMERCE_ENABLED', 'on')
  Object.assign(data, { ask: null, totals: [], sponsor: null, calls: 0 })
})
afterEach(() => vi.unstubAllEnvs())

it('renders nothing and asks nothing while the commerce switch is off', async () => {
  vi.stubEnv('HUNTS_COMMERCE_ENABLED', '')
  Object.assign(data, { ask, sponsor: lines })
  expect(HuntFundraising({ huntId: 'h1' })).toBeNull()
  expect(data.calls).toBe(0)
})

it('renders nothing when no approved ask and no approved sponsor agreement exist', async () => {
  expect(await render()).toBe('')
})

it('mounts the Space donation form for the beneficiary and shows settled gifts only', async () => {
  Object.assign(data, { ask, totals: [{ currency: 'USD', raisedMinor: 1750, refundedMinor: 1250, startedMinor: 900, settledCount: 2 }] })
  const html = await render()
  expect(html).toContain('data-space="s1"')
  expect(html).toContain('data-hunt="h1"')
  expect(html).toContain('$17.50 received from 2 gifts so far, after refunds.')
  expect(html).not.toContain('Donations aren’t open yet')
  expect(html).not.toContain('Sponsor pledge</h2>')
})

it('words an unpaid pledge apart from gifts received and never adds them', async () => {
  Object.assign(data, { ask, totals: [{ currency: 'USD', raisedMinor: 1750, refundedMinor: 0, startedMinor: 0, settledCount: 1 }], sponsor: lines })
  const html = await render()
  expect(html).toContain('$17.50 received from 1 gift so far')
  expect(html).toContain('Harbor Hardware has pledged $500. It is not paid yet, so it is not counted in gifts received.')
  expect(html).not.toContain('$517.50')
  expect(html).not.toContain('has paid')
})

it('shows a paid pledge as paid, still on its own line', async () => {
  Object.assign(data, { sponsor: { ...lines, sponsorPledgedCents: 0, sponsorPaidCents: 50_000 } })
  const html = await render()
  expect(html).toContain('Harbor Hardware has paid $500.')
  expect(html).not.toContain('has pledged')
})
