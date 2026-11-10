// FH-046: the separate donation ask. Totals count settled money only; giving never changes progression.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decideDonationAsk, giftStatusFromDonation, publicDonorLabel, settledDonationTotals, type DonationAsk } from './donation-ask'

const ask: DonationAsk = { huntId: 'h', beneficiarySpaceId: 's', enabled: true, approvedAt: '2026-11-10T00:00:00Z', approvedBy: 'p' }
const open = { commerceSwitchOn: true, ask, huntStatus: 'live' as const, beneficiaryPayeeReady: true }

describe('decideDonationAsk', () => {
  it('shows only when every gate is open', () => {
    expect(decideDonationAsk(open)).toEqual({ show: true })
  })
  it.each([
    ['switch_off', { commerceSwitchOn: false }],
    ['not_enabled', { ask: null }],
    ['not_enabled', { ask: { ...ask, enabled: false } }],
    ['not_approved', { ask: { ...ask, approvedBy: null } }],
    ['hunt_not_open', { huntStatus: 'draft' as const }],
    ['payee_not_ready', { beneficiaryPayeeReady: false }],
  ])('hides with %s', (reason, patch) => {
    expect(decideDonationAsk({ ...open, ...patch })).toEqual({ show: false, reason })
  })
})

describe('giftStatusFromDonation', () => {
  it('maps success, abandonment, full and partial refunds', () => {
    expect(giftStatusFromDonation({ status: 'pending', refundedMinor: 0, amountMinor: 1000 })).toEqual({ status: 'started', refundedMinor: 0 })
    expect(giftStatusFromDonation({ status: 'abandoned', refundedMinor: 0, amountMinor: 1000 }).status).toBe('abandoned')
    expect(giftStatusFromDonation({ status: 'succeeded', refundedMinor: 0, amountMinor: 1000 })).toEqual({ status: 'settled', refundedMinor: 0 })
    expect(giftStatusFromDonation({ status: 'succeeded', refundedMinor: 400, amountMinor: 1000 })).toEqual({ status: 'settled', refundedMinor: 400 })
    expect(giftStatusFromDonation({ status: 'succeeded', refundedMinor: 1000, amountMinor: 1000 })).toEqual({ status: 'refunded', refundedMinor: 1000 })
    expect(giftStatusFromDonation({ status: 'refunded', refundedMinor: 0, amountMinor: 1000 })).toEqual({ status: 'refunded', refundedMinor: 1000 })
  })
})

describe('settledDonationTotals', () => {
  it('counts settled money net of refunds, and started gifts only as started', () => {
    const totals = settledDonationTotals([
      { currency: 'USD', amountMinor: 1000, refundedMinor: 0, status: 'settled' },
      { currency: 'USD', amountMinor: 2000, refundedMinor: 500, status: 'settled' },
      { currency: 'USD', amountMinor: 700, refundedMinor: 700, status: 'refunded' },
      { currency: 'USD', amountMinor: 900, refundedMinor: 0, status: 'started' },
      { currency: 'USD', amountMinor: 5000, refundedMinor: 0, status: 'abandoned' },
      { currency: 'EUR', amountMinor: 300, refundedMinor: 0, status: 'settled' },
    ])
    expect(totals).toEqual([
      { currency: 'EUR', raisedMinor: 300, refundedMinor: 0, startedMinor: 0, settledCount: 1 },
      { currency: 'USD', raisedMinor: 2500, refundedMinor: 1200, startedMinor: 900, settledCount: 2 },
    ])
  })
})

describe('consent and progression', () => {
  it('names a donor only with their own consent', () => {
    expect(publicDonorLabel(true, ' Ada ')).toBe('Ada')
    expect(publicDonorLabel(false, 'Ada')).toBe('A neighbor')
    expect(publicDonorLabel(true, null)).toBe('A neighbor')
  })
  it('is never read by the progression graph', () => {
    const dir = join('lib', 'hunts', 'graph')
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts'))) {
      expect(readFileSync(join(dir, f), 'utf8')).not.toMatch(/donation|sponsor-milestone|hunt_donation|hunt_sponsor/)
    }
  })
})
