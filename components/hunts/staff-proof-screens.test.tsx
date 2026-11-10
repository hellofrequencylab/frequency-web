import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { HuntHeldClaimsScreen, HuntStaffScanScreen } from './staff-proof-screens'

vi.mock('@/components/layout/page-admin-bar', () => ({ PageAdminBar: () => null }))

it('renders the venue and inert scan and entry controls until the route supplies controls', () => {
  const html = renderToStaticMarkup(<HuntStaffScanScreen venueName="North Park Shop" />)
  expect(html).toContain('North Park Shop')
  expect(html).toContain('Player code')
  expect(html.match(/disabled=""/g)).toHaveLength(3)
  expect(html).not.toContain('<form')
})

it('renders only the supplied scan controls when the route provides them', () => {
  const html = renderToStaticMarkup(<HuntStaffScanScreen venueName="North Park Shop" controls={<span>Route controls</span>} />)
  expect(html).toContain('Route controls')
  expect(html).not.toContain('Check code')
})

it('renders empty and populated queues without review actions by default', () => {
  expect(renderToStaticMarkup(<HuntHeldClaimsScreen claims={[]} />)).toContain('No claims to review')
  const html = renderToStaticMarkup(<HuntHeldClaimsScreen claims={[{
    reference: 'A19C', reason: 'Proof needs a second look', ageLabel: '12 minutes ago',
  }]} />)
  expect(html).toContain('Claim A19C')
  expect(html).toContain('Proof needs a second look')
  expect(html).toContain('12 minutes ago')
  expect(html).toMatch(/<button[^>]+disabled/)
  expect(html).not.toContain('<form')
})
