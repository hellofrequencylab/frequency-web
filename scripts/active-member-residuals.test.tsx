import { expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { RETIRED_MEMBER_RESIDUALS } from './lib/retired-member-residuals.mjs'
import { retiredModuleEdges } from './lib/retired-member-shell.mjs'
import { bellReadOrdering } from './probes/active-notification-bell.mjs'
// Unrelated async access chrome is isolated; actual classifieds mapping and item grid render below.
vi.mock('@/components/frequency/members/marketplace/areas', () => ({ FqHiddenAreaNote: () => null }))
vi.mock('@/components/frequency/members/shared/hub-links', () => ({ HubLinks: () => null }))
import { FqClassifiedsBody } from '@/components/frequency/members/marketplace/marketplace-body'
it.each(RETIRED_MEMBER_RESIDUALS)('rejects reintroducing retired %s into the actual member root', target => {
  const file = 'app/(main)/layout.tsx'; const source = readFileSync(file, 'utf8')
  expect(retiredModuleEdges(file, source, RETIRED_MEMBER_RESIDUALS)).toEqual([])
  expect(retiredModuleEdges(file, `${source}\nimport X from '@/${target.replace(/\.tsx$/, '')}'`, RETIRED_MEMBER_RESIDUALS)).toHaveLength(1)
})
it('actual bell ordering guard rejects pre-load marking and lost failed-read return', () => {
  const source = readFileSync('components/frequency/members/shell/bell.tsx', 'utf8')
  expect(bellReadOrdering(source)).toBe(true)
  expect(bellReadOrdering(source.replace('const res = await getMyNotifications()', 'await markAllRead(); const res = await getMyNotifications()'))).toBe(false)
  expect(bellReadOrdering(source.replace("if (res.kind === 'error') { setFailed(true); return }", "if (res.kind === 'error') { setFailed(true) }"))).toBe(false)
})
it.each([true, false])('actual classified card shows Unclaimed only for seeded unclaimed=%s', unclaimed => {
  const html = renderToStaticMarkup(<FqClassifiedsBody listings={[{ id: 'listing', title: 'Test listing', kind: 'free', priceNote: null, image: null, seller: 'Pat', place: null, description: null, lat: null, lng: null, unclaimed }]} activeKind={null} signedIn subtitle="Nearby" stats={{ total: 1, free: 1, lend: 0, request: 0 }} intro={{ body: null, ctaLabel: null, ctaHref: null }} />)
  expect(html.includes('Unclaimed')).toBe(unclaimed)
  expect(html).toContain('Test listing')
})
