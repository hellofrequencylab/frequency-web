import { redirect } from 'next/navigation'
import { Search } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { atLeastRole, isStaff, isJanitor, type CommunityRole } from '@/lib/core/roles'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { demoModeEnabled } from '@/lib/platform-flags'
import { viewerHidesDemo } from '@/lib/demo-preference'
import { ContactsTable, type CrmContactRow } from './contacts-table'

export const dynamic = 'force-dynamic'

// The CRM Contacts tab — the unified roster of people the steward reaches
// (host → circles, guide → hub, mentor → nexus, admin/janitor → community), each
// card a launch point for a message, their profile, or a new pipeline deal.
function scopeLabel(role: CommunityRole, staff: boolean): string {
  if (staff) return 'the community'
  if (role === 'mentor') return 'your nexus'
  if (role === 'guide') return 'your hub'
  return 'your circles'
}


async function circleIdsForScope(
  admin: ReturnType<typeof createAdminClient>,
  callerId: string,
  role: CommunityRole,
): Promise<string[]> {
  if (role === 'host') {
    const { data } = await admin.from('circles').select('id').eq('host_id', callerId)
    return (data ?? []).map((c) => c.id as string)
  }
  if (role === 'guide') {
    const { data: hubs } = await admin.from('hubs').select('id').eq('guide_id', callerId)
    const hubIds = (hubs ?? []).map((h) => h.id as string)
    if (!hubIds.length) return []
    const { data: circles } = await admin.from('circles').select('id').in('hub_id', hubIds)
    return (circles ?? []).map((c) => c.id as string)
  }
  if (role === 'mentor') {
    const { data: nexuses } = await admin.from('nexuses').select('id').eq('mentor_id', callerId)
    const nexusIds = (nexuses ?? []).map((n) => n.id as string)
    if (!nexusIds.length) return []
    const { data: hubs } = await admin.from('hubs').select('id').in('nexus_id', nexusIds)
    const hubIds = (hubs ?? []).map((h) => h.id as string)
    if (!hubIds.length) return []
    const { data: circles } = await admin.from('circles').select('id').in('hub_id', hubIds)
    return (circles ?? []).map((c) => c.id as string)
  }
  return []
}

export default async function CrmContactsPage() {
  const caller = await getCallerProfile()
  if (!caller) redirect('/')
  const admin = createAdminClient()

  const role = caller.community_role
  // Staff (web_role, ADR-208) see the whole community; community leaders see their own scope.
  // The old atLeastRole(community_role,'host') gate locked out Executive Admins (community=member),
  // and the roster bypass below keyed on the RETIRED community 'admin'/'janitor' enum values (no
  // row holds them), so the full-roster path was dead. Both now key on the staff axis.
  const staff = isStaff(caller.webRole)
  if (!(staff || atLeastRole(role, 'host'))) redirect('/feed')

  // Only viewers who can actually WRITE a deal get the Deal action — the SAME predicate
  // createDealForProfile enforces (actions.ts requireCrm -> authorizeAction(caller,'janitor')).
  // Community hosts can see this page but can't start deals, so hide the dead button for them.
  const canStartDeal = isJanitor(caller.webRole)

  const hideDemo = !(await demoModeEnabled()) || (await viewerHidesDemo())

  let profileIds: string[] | null = null
  if (!staff) {
    const circleIds = await circleIdsForScope(admin, caller.id as string, role)
    if (circleIds.length) {
      const { data: memberships } = await admin
        .from('memberships')
        .select('profile_id')
        .in('circle_id', circleIds)
        .eq('status', 'active')
      profileIds = [...new Set((memberships ?? []).map((m) => m.profile_id as string))]
    } else {
      profileIds = []
    }
  }

  let query = admin
    .from('profiles')
    .select('id, auth_user_id, display_name, handle, avatar_url, community_role, bio, website, phone, city, created_at, is_demo')
    .eq('is_system', false)
    .neq('id', caller.id as string)
    .order('display_name', { ascending: true })
    .limit(300)
  if (hideDemo) query = query.eq('is_demo', false)
  if (profileIds !== null) {
    query = query.in('id', profileIds.length ? profileIds : ['00000000-0000-0000-0000-000000000000'])
  }
  const { data: rows } = await query

  // Attach emails by fetching ONLY the users the loaded profiles reference (bounded to ≤300),
  // rather than pulling the whole auth user table — which capped at perPage and silently dropped
  // emails past user #1000. One getUserById per distinct auth_user_id, run in parallel.
  const authUserIds = [
    ...new Set((rows ?? []).map((m) => m.auth_user_id as string | null).filter(Boolean) as string[]),
  ]
  const emailById = new Map<string, string | null>(
    await Promise.all(
      authUserIds.map(async (id) => {
        const { data } = await admin.auth.admin.getUserById(id)
        return [id, data.user?.email ?? null] as [string, string | null]
      }),
    ),
  )

  const members: CrmContactRow[] = (rows ?? []).map((m) => ({
    id: m.id as string,
    displayName: (m.display_name as string) ?? 'Unnamed',
    handle: (m.handle as string) ?? '',
    avatarUrl: (m.avatar_url as string) ?? null,
    role: ((m.community_role as CommunityRole) ?? 'member'),
    email: emailById.get(m.auth_user_id as string) ?? null,
    city: (m.city as string) ?? null,
    joinedAt: (m.created_at as string) ?? null,
    isDemo: Boolean(m.is_demo),
  }))

  return (
    <AdminTemplate
      eyebrow="CRM"
      title="Contacts"
      description={
        <>
          The people in <strong className="text-text">{scopeLabel(role, staff)}</strong>. Message them, open their profile, or start a pipeline deal. Only what members choose to share.
        </>
      }
      width="wide"
    >
      <AdminSection>
        {members.length === 0 ? (
          <EmptyState
            icon={Search}
            variant="first-use"
            title="No contacts in your scope yet"
            description={`As people join ${scopeLabel(role, staff)}, they will appear here.`}
          />
        ) : (
          <ContactsTable rows={members} canStartDeal={canStartDeal} />
        )}
      </AdminSection>
    </AdminTemplate>
  )
}
