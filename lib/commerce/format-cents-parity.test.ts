import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { formatPriceCents } from './types'
import { formatCents as formatDisplayCents } from '@/lib/pricing/display'
import { formatLoadoutCents } from '@/lib/pricing/loadout'
import { formatLedgerCents } from '@/lib/finance/dashboard'

// ONE PRICE FORMAT (B5 dead-code sweep D1, 2026-09-04).
//
// Two exported functions were named `formatCents` and answered differently: lib/pricing/display.ts
// rendered 2500 as "$25" and lib/finance/dashboard.ts rendered it as "$25.00". Six further
// byte-identical copies of the first body lived under five names (formatLoadoutCents, formatPrice,
// formatCentsLabel, formatAmount, two local formatCents). They agreed only because nobody had
// touched one. Every price surface now delegates to lib/commerce/types.ts formatPriceCents, the one
// body that also carries a currency code and survives an unknown one.
//
// Two things are pinned here, and they pull in opposite directions on purpose:
//   1. Every delegate renders EXACTLY what the copied body rendered, for every cent value a price can
//      take. A member must not see a single label change because a function was consolidated.
//   2. The finance ledger is NOT a delegate. Its always-two-decimals rule is the accounting
//      convention for a tabular column, and it stays different by decision, not drift.

// The body every copy carried, frozen verbatim, so the delegates are measured against what shipped
// rather than against each other.
function legacyCopy(cents: number): string {
  const dollars = cents / 100
  const whole = Number.isInteger(dollars)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(dollars)
}

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8')

describe('every price surface renders the rendered form the copies shipped', () => {
  const rendered: Array<[number, string]> = [
    [0, '$0'],
    [1, '$0.01'],
    [99, '$0.99'],
    [900, '$9'],
    [950, '$9.50'],
    [2500, '$25'],
    [2550, '$25.50'],
    [39000, '$390'],
    [200000, '$2,000'],
    [129900, '$1,299'],
    [129950, '$1,299.50'],
    [1234567, '$12,345.67'],
  ]

  for (const [cents, label] of rendered) {
    it(`${cents} -> ${label} on the canonical, the pricing display and the loadout picker`, () => {
      expect(formatPriceCents(cents)).toBe(label)
      expect(formatDisplayCents(cents)).toBe(label)
      expect(formatLoadoutCents(cents)).toBe(label)
      expect(legacyCopy(cents)).toBe(label)
    })
  }

  it('is byte-identical to the frozen copy across every cent value under $100 and a spread above', () => {
    // Every value to $100 covers the whole/fraction split exhaustively; the spread covers grouping.
    // (A full sweep to $1,000 costs ~25s of Intl construction on the shared 4-core box; not worth it.)
    for (let cents = 0; cents <= 10_000; cents++) {
      const expected = legacyCopy(cents)
      expect(formatPriceCents(cents)).toBe(expected)
      expect(formatDisplayCents(cents)).toBe(expected)
      expect(formatLoadoutCents(cents)).toBe(expected)
    }
    for (const cents of [12_345, 99_999, 100_000, 100_001, 123_456, 999_999, 1_000_000, 1_299_950, 12_345_678, 99_999_999]) {
      const expected = legacyCopy(cents)
      expect(formatPriceCents(cents)).toBe(expected)
      expect(formatDisplayCents(cents)).toBe(expected)
      expect(formatLoadoutCents(cents)).toBe(expected)
    }
  })
})

describe('the copies are gone: each former owner delegates instead of carrying the body', () => {
  // The fingerprint of the copied body. A file that still carries it has re-grown a copy.
  const COPY_FINGERPRINT = /minimumFractionDigits:\s*whole \? 0 : 2/

  const DELEGATES = [
    'lib/pricing/display.ts',
    'lib/pricing/loadout.ts',
    'lib/marketplace/listing-offers.ts',
    'components/spaces/membership-join-card.tsx',
    'components/marketplace/listing-contact-dialog.tsx',
    'components/spaces/donations/donate-member.tsx',
  ]

  for (const file of DELEGATES) {
    it(`${file} imports formatPriceCents and carries no Intl body of its own`, () => {
      const src = read(file)
      expect(src).toMatch(/import \{[^}]*\bformatPriceCents\b[^}]*\} from '@\/lib\/commerce\/types'/)
      expect(src).not.toMatch(COPY_FINGERPRINT)
      expect(src).not.toContain('Intl.NumberFormat')
    })
  }

  it('the pricing console reads through the shared formatCents and lost its private label copy', () => {
    const src = read('app/(main)/admin/pricing/pricing-console.tsx')
    expect(src).toMatch(/import \{[^}]*\bformatCents\b[^}]*\} from '@\/lib\/pricing\/display'/)
    expect(src).not.toContain('formatCentsLabel')
    expect(src).not.toMatch(COPY_FINGERPRINT)
  })

  it('the canonical body lives in exactly one place', () => {
    // Positive control for the fingerprint: the canonical carries the two-arm rule in its own shape.
    const canonical = read('lib/commerce/types.ts')
    expect(canonical).toContain('Number.isInteger(dollars) ? 0 : 2')
    expect(canonical).toContain('Intl.NumberFormat')
  })
})

describe('the finance ledger is a different rule by decision, not by drift', () => {
  it('always shows two decimals, and the comment above it says why', () => {
    expect(formatLedgerCents(2500)).toBe('$25.00')
    expect(formatLedgerCents(1234)).toBe('$12.34')
    expect(formatPriceCents(2500)).toBe('$25')
    // The disagreement must stay documented at the definition, so the next sweep does not "fix" it.
    const src = read('lib/finance/dashboard.ts')
    expect(src).toContain('SAME NAME, DIFFERENT RULE')
  })
})
