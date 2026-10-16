import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FqEventCountdown } from './event-countdown'
vi.mock('@/app/(main)/events/actions', () => ({ checkInEvent: vi.fn() }))
vi.mock('@/components/zap-toast', () => ({ showZapToast: vi.fn() }))
const now = Date.UTC(2026, 9, 15, 18)
const gates = { eventId:'example', startsAtMs:now + 3600000, endsAtMs:now + 7200000, renderedAtMs:now, windowOpen:false, cancelled:false, checkInEnabled:true, signedIn:true, isGoing:true, alreadyCheckedIn:false, zaps:25 }
describe('Frequency event clock first frame', () => {
 it('already shows the real countdown before client effects', () => {
  const html=renderToStaticMarkup(<FqEventCountdown {...gates} />)
  expect(html).toContain('Starts in')
  expect(html).toContain('1 hrs')
  expect(html).not.toContain('aria-live="polite"')
 })
 it('shows check-in during the canonical window despite a stale server window snapshot', () => {
  const html=renderToStaticMarkup(<FqEventCountdown {...gates} renderedAtMs={now+3600000}/>)
  expect(html).toContain('Check in')
  expect(html).not.toContain('Starts in')
 })
})
