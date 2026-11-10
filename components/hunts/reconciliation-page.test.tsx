import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import type { HuntReconciliationReader, HuntReconciliationScope } from '@/lib/hunts/reconciliation-reader'
import { HuntReconciliationPage } from './reconciliation-page'

const scopes = [
  { role: 'platform-admin' },
  { role: 'space-owner', spaceId: 'space-a' },
] satisfies HuntReconciliationScope[]

it.each(scopes)('passes only the supplied $role scope to the reader and renders redacted fields', async (scope) => {
  const reader = vi.fn<HuntReconciliationReader>().mockResolvedValue([{
    amountMinor: 1250, currency: 'USD', status: 'pending', ageMinutes: 42,
    sourceType: 'event-ticket', sourceHash: 'a1b2c3d4',
  }])
  const html = renderToStaticMarkup(await HuntReconciliationPage({ scope, reader }))

  expect(reader).toHaveBeenCalledExactlyOnceWith(scope)
  for (const value of ['USD', '12.50', 'Pending', '42 min', 'Event ticket', 'a1b2c3d4']) {
    expect(html).toContain(value)
  }
})

it('does not read without an authorized scope', async () => {
  const reader = vi.fn<HuntReconciliationReader>()
  const html = renderToStaticMarkup(await HuntReconciliationPage({ scope: null, reader }))
  expect(reader).not.toHaveBeenCalled()
  expect(html).toContain('Access required')
})

it('omits an unexpected raw source and buyer fields from an adapter response', async () => {
  const row = {
    amountMinor: 2000, currency: 'JPY', status: 'exception', ageMinutes: 5,
    sourceType: 'store-order', sourceHash: 'internal_order_123',
    buyerName: 'Private Buyer', buyerEmail: 'buyer@example.test',
  } as const
  const html = renderToStaticMarkup(await HuntReconciliationPage({
    scope: scopes[0],
    reader: async () => [row],
  }))
  expect(html).toContain('Needs review')
  expect(html).toContain('2,000')
  for (const privateValue of [row.sourceHash, row.buyerName, row.buyerEmail]) {
    expect(html).not.toContain(privateValue)
  }
})

it('shows a safe error without echoing reader failure details', async () => {
  const reader = vi.fn<HuntReconciliationReader>().mockRejectedValue(new Error('internal_order_123'))
  const html = renderToStaticMarkup(await HuntReconciliationPage({ scope: scopes[0], reader }))
  expect(html).toContain('Records unavailable')
  expect(html).not.toContain('internal_order_123')
})
