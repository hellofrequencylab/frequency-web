import { expect, it } from 'vitest'
import { sponsorMilestoneOwedCents } from './sponsor-milestone-math'

const terms = {
  threshold: 2,
  huntEndsAtMs: 100,
  capCents: BigInt(125),
  pledgeCents: { numerator: BigInt(1009), denominator: BigInt(10) },
}
const snapshot = { frozenAtMs: 99, confirmedQualificationKeys: ['first', 'second'] }

it.each([
  { name: 'no frozen threshold', frozen: null, cap: 125, expected: 0 },
  { name: 'duplicate and empty qualifications', frozen: { ...snapshot, confirmedQualificationKeys: ['first', 'first', ''] }, cap: 125, expected: 0 },
  { name: 'exact threshold before Hunt end rounds down', frozen: snapshot, cap: 125, expected: 100 },
  { name: 'one cap for the Hunt', frozen: snapshot, cap: 75, expected: 75 },
  { name: 'zero cap', frozen: snapshot, cap: 0, expected: 0 },
  { name: 'threshold reached at Hunt end', frozen: { ...snapshot, frozenAtMs: 100 }, cap: 125, expected: 0 },
  { name: 'threshold reached after Hunt end', frozen: { ...snapshot, frozenAtMs: 101 }, cap: 125, expected: 0 },
])('$name', ({ frozen, cap, expected }) => {
  expect(sponsorMilestoneOwedCents(frozen && { ...terms, ...frozen, capCents: BigInt(cap) })).toBe(BigInt(expected))
})

it('returns the same earned amount on replay and carries nothing into another Hunt', () => {
  const earned = sponsorMilestoneOwedCents({ ...terms, ...snapshot })
  expect(sponsorMilestoneOwedCents({ ...terms, ...snapshot })).toBe(earned)
  expect(sponsorMilestoneOwedCents(null)).toBe(BigInt(0))
})

it('floors exact cents above the floating-point safe integer range', () => {
  const cents = BigInt('9007199254740993')
  expect(sponsorMilestoneOwedCents({
    ...terms,
    ...snapshot,
    capCents: cents + BigInt(1),
    pledgeCents: { numerator: cents * BigInt(10) + BigInt(9), denominator: BigInt(10) },
  })).toBe(cents)
})

it.each([
  { ...terms, threshold: 0 },
  { ...terms, huntEndsAtMs: Number.NaN },
  { ...terms, capCents: BigInt(-1) },
  { ...terms, pledgeCents: { ...terms.pledgeCents, numerator: BigInt(-1) } },
  { ...terms, pledgeCents: { ...terms.pledgeCents, denominator: BigInt(0) } },
])('rejects invalid terms rather than pricing them', (invalid) => {
  expect(() => sponsorMilestoneOwedCents({ ...invalid, ...snapshot })).toThrow(RangeError)
})

it('rejects an invalid snapshot time', () => {
  expect(() => sponsorMilestoneOwedCents({ ...terms, ...snapshot, frozenAtMs: Number.NaN })).toThrow(RangeError)
})
