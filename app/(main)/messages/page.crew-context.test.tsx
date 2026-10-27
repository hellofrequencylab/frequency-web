import { beforeEach, expect, it, vi } from 'vitest'
const s = vi.hoisted(() => ({ user: { id: 'auth-A' } as { id: string } | null, profile: { id: 'profile-A', is_crew_lead: true } as { id: string; is_crew_lead: boolean } | null, selects: [] as string[], scopes: [] as [string, unknown][] }))
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`) } }))
vi.mock('@/lib/page-content', () => ({ pageContentMetadata: () => ({}) }))
vi.mock('./inbox-data', () => ({ noteFailedRead: vi.fn(), CONTENT_FALLBACK: {} }))
vi.mock('@/components/frequency/members/messages/messages-body', () => ({ FrequencyMessages: () => null }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: s.user } }) }, from: () => { const q = { select: (cols: string) => { s.selects.push(cols); return q }, eq: (col: string, value: unknown) => { s.scopes.push([col, value]); return q }, maybeSingle: async () => ({ data: s.profile, error: null }) }; return q } }) }))
import MessagesPage from './page'
beforeEach(() => { s.user = { id: 'auth-A' }; s.profile = { id: 'profile-A', is_crew_lead: true }; s.selects.length = 0; s.scopes.length = 0 })
it('the real inbox reuses its one own-profile read for the trusted crew flag', async () => {
  const result = await MessagesPage()
  expect(s.selects).toHaveLength(1); expect(s.selects[0]).toContain('is_crew_lead')
  expect(s.scopes).toEqual([['auth_user_id', 'auth-A']])
  expect(result.props).toMatchObject({ myProfileId: 'profile-A', isCrewLead: true })
})
it('ordinary members pass false and signed-out viewers never reach the profile read', async () => {
  s.profile!.is_crew_lead = false
  expect((await MessagesPage()).props.isCrewLead).toBe(false)
  s.user = null; s.selects.length = 0
  await expect(MessagesPage()).rejects.toThrow('redirect:/sign-in'); expect(s.selects).toHaveLength(0)
})
