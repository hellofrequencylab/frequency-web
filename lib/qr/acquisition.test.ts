import { describe, it, expect } from 'vitest'
import { summarizeAcquisition, type AcquisitionRow } from './acquisition'

const rows: AcquisitionRow[] = [
  { channel: 'qr_scan', source: 'qr_scan', campaign: 'poster-a', code: 'abc' },
  { channel: 'qr_scan', source: 'qr_scan', campaign: 'poster-a', code: 'abc' },
  { channel: 'qr_scan', source: 'qr_scan', campaign: 'poster-b', code: 'def' },
  { channel: 'referral', source: null, campaign: null, code: null },
  { channel: null, source: null, campaign: null, code: null }, // empty everywhere
]

describe('summarizeAcquisition', () => {
  it('counts total rows regardless of completeness', () => {
    expect(summarizeAcquisition(rows).total).toBe(5)
  })

  it('tallies channel, dropping blanks, sorted desc', () => {
    const s = summarizeAcquisition(rows)
    expect(s.byChannel).toEqual([
      { key: 'qr_scan', count: 3 },
      { key: 'referral', count: 1 },
    ])
  })

  it('prefers campaign over source for the "where from" bucket', () => {
    const s = summarizeAcquisition(rows)
    expect(s.bySource[0]).toEqual({ key: 'poster-a', count: 2 })
    expect(s.bySource.some((b) => b.key === 'poster-b')).toBe(true)
  })

  it('tallies by code slug', () => {
    const s = summarizeAcquisition(rows)
    expect(s.byCode).toEqual([
      { key: 'abc', count: 2 },
      { key: 'def', count: 1 },
    ])
  })
})
