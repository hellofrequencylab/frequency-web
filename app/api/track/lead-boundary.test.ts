import { beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const calls = vi.hoisted(() => ({ session: vi.fn(), record: vi.fn(), send: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: calls.session }))
vi.mock('@/lib/engagement/events', () => ({ recordEngagementEvent: calls.record }))
vi.mock('@/lib/analytics/ga-server', () => ({ gaServerEnabled: () => true, sendGa4Event: calls.send }))
vi.mock('@/lib/consent/consent', () => ({ hasConsent: vi.fn() }))
import { POST } from './route'

beforeEach(() => vi.clearAllMocks())

it.each(['lead.captured', 'generate_lead'])('rejects browser-spoofed %s before auth, ledger or Google transport', async event => {
  const response = await POST(new NextRequest('https://frequency.example/api/track', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ event, props: { source: 'create_space', lead_id: 'forged', ga_client_id: '123.456' } }),
  }))
  expect(response.status).toBe(400)
  expect(calls.session).not.toHaveBeenCalled()
  expect(calls.record).not.toHaveBeenCalled()
  expect(calls.send).not.toHaveBeenCalled()
})
