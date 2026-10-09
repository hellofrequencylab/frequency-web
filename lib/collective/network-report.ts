// LIVE-766. Private owner report. All reads are server-side and bounded; no partial total is shown.
import { createAdminClient } from '@/lib/supabase/admin'
import { completeEarningsRead } from '@/lib/commerce/complete-read'
import { spaceEarningsSummary } from '@/lib/commerce/orders'
import { buildNetworkReport, type ReportSpace } from './network-report-policy'
const SPACE_COLS = 'id, name, slug, parent_id, owner_profile_id, status, plan, type'
export async function readCollectiveNetworkReport(parentId: string, callerProfileId: string | null) {
  return buildNetworkReport(parentId, callerProfileId, {
    space: async id => {
      const { data, error } = await createAdminClient().from('spaces').select(SPACE_COLS).eq('id', id).maybeSingle()
      if (error) throw new Error('report ownership unreadable')
      return data as ReportSpace | null
    },
    children: async parent => {
      const { data, error } = await createAdminClient().from('spaces').select(SPACE_COLS).eq('parent_id', parent).limit(101)
      if (error || !data || data.length > 100) throw new Error('report Space set incomplete')
      return data as ReportSpace[]
    },
    members: async ids => {
      const { data } = await completeEarningsRead(createAdminClient().from('space_members').select('id, profile_id, status').in('space_id', ids).eq('status', 'active').in('role', ['viewer', 'editor', 'moderator', 'admin']))
      const memberships = data as { profile_id: string; status: string }[]
      const profiles = [...new Set([...memberships.map(row => row.profile_id), callerProfileId!])]
      const active = new Set<string>()
      for (let start = 0; start < profiles.length; start += 100) {
        const { data: real, error } = await createAdminClient().from('profiles').select('id')
          .in('id', profiles.slice(start, start + 100)).eq('is_active', true).eq('is_demo', false).eq('is_system', false).limit(100)
        if (error || !real) throw new Error('report member profiles unreadable')
        for (const profile of real) active.add(profile.id)
      }
      return [...memberships.filter(row => active.has(row.profile_id)), ...(active.has(callerProfileId!) ? [{ profile_id: callerProfileId!, status: 'active' }] : [])]
    },
    events: async ids => {
      const joined = ids.join(',')
      const { data } = await completeEarningsRead(createAdminClient().from('events').select('id, space_id, host_space_id')
        .or(`host_space_id.in.(${joined}),and(host_space_id.is.null,space_id.in.(${joined}))`).is('removed_at', null).eq('is_demo', false))
      return data as { id: string; space_id: string | null; host_space_id: string | null }[]
    },
    earnings: id => spaceEarningsSummary(id, undefined, true),
  })
}
