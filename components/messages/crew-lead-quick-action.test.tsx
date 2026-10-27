import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('@/components/compose/new-group-dm-compose', () => ({ NewGroupDMCompose: ({ buttonLabel, defaultRecipients }: { buttonLabel: string; defaultRecipients: { id: string }[] }) => <button data-recipients={defaultRecipients.map(r => r.id).join(',')}>{buttonLabel}</button> }))
import { CrewLeadQuickAction } from './crew-lead-quick-action'
const s = { friends: ['friend', 'host'], others: ['friend', 'stranger', 'host', 'me'], query: [] as { table: string; filters: [string, unknown][] }[] }
const client = { from: (table: string) => {
  let cols = ''; const filters: [string, unknown][] = []; s.query.push({ table, filters })
  const q = { select: (c: string) => { cols = c; return q }, eq: (k: string, v: unknown) => { filters.push([k, v]); return q }, neq: () => q, limit: () => q, or: (filter: string) => { filters.push(['or', filter]); return q }, then: (resolve: (v: unknown) => unknown) => {
    const data = table === 'friendships' ? s.friends.map(id => ({ user_a_id: 'me', user_b_id: id })) : cols.includes('circles!') ? [{ circle_id: 'circle-A', circles: { id: 'circle-A', name: 'Our circle', host_id: 'host' } }] : s.others.map(id => ({ profile_id: id, profiles: { id, display_name: id, handle: id, avatar_url: null } }))
    return Promise.resolve({ data, error: null }).then(resolve)
  } }; return q
} } as unknown as Parameters<typeof CrewLeadQuickAction>[0]['supabase']
beforeEach(() => { s.friends = ['friend', 'host']; s.others = ['friend', 'stranger', 'host', 'me']; s.query.length = 0 })
it('does no extra read without the trusted crew-lead flag or profile', async () => {
  expect(await CrewLeadQuickAction({ supabase: client, myProfileId: 'me', isCrewLead: false })).toBeNull()
  expect(await CrewLeadQuickAction({ supabase: client, myProfileId: '', isCrewLead: true })).toBeNull()
  expect(s.query).toHaveLength(0)
})
it('prefills only accepted Circle friends, excluding self and host, using the RLS user client', async () => {
  const html = renderToStaticMarkup((await CrewLeadQuickAction({ supabase: client, myProfileId: 'me', isCrewLead: true }))!)
  expect(html).toContain('data-recipients="friend"'); expect(html).toContain('Message circle friends')
  expect(s.query.find(q => q.table === 'memberships')?.filters).toContainEqual(['profile_id', 'me'])
  expect(s.query.some(q => q.filters.some(([k,v]) => k === 'circle_id' && v === 'circle-A'))).toBe(true)
  expect(s.query.find(q => q.table === 'friendships')?.filters).toContainEqual(['status', 'accepted'])
  expect(s.query.find(q => q.table === 'friendships')?.filters).toContainEqual(['or', 'user_a_id.eq.me,user_b_id.eq.me'])
  expect(s.query.some(q => q.table === 'profiles')).toBe(false)
})
it('offers no shortcut when there are no eligible friend recipients', async () => {
  s.friends = ['host']; expect(await CrewLeadQuickAction({ supabase: client, myProfileId: 'me', isCrewLead: true })).toBeNull()
})
