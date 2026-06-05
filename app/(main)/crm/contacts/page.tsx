import Link from 'next/link'
import { redirect } from 'next/navigation'
import { MessageSquare, Globe, Search, Mail, Phone, MapPin, Calendar } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { atLeastRole, type CommunityRole } from '@/lib/core/roles'
import { RoleBadge } from '@/lib/community-roles'
import { getInitials } from '@/lib/utils'
import { DashboardTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { DemoBadge } from '@/components/ui/demo-badge'
import { demoModeEnabled } from '@/lib/platform-flags'
import { viewerHidesDemo } from '@/lib/demo-preference'
import { CrmTabs } from '../crm-tabs'
import { StartDealButton } from './start-deal-button'

export const dynamic = 'force-dynamic'

// The CRM Contacts tab — the unified roster of people the steward reaches
// (host → circles, guide → hub, mentor → nexus, admin/janitor → community), each
// card a launch point for a message, their profile, or a new pipeline deal.
function scopeLabel(role: CommunityRole): string {
  if (role === 'admin' || role === 'janitor') return 'the community'
  if (role === 'mentor') return 'your nexus'
  if (role === 'guide') return 'your hub'
  return 'your circles'
}

type CrmMember = {
  id: string
  displayName: string
  handle: string
  avatarUrl: string | null
  role: CommunityRole
  bio: string | null
  website: string | null
  email: string | null
  phone: string | null
  city: string | null
  joinedAt: string | null
  isDemo: boolean
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const admin = createAdminClient()
  const { data: caller } = await admin
    .from('profiles')
    .select('id, community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const role = ((caller?.community_role as CommunityRole) ?? 'member')
  if (!caller || !atLeastRole(role, 'host')) redirect('/feed')

  const hideDemo = !(await demoModeEnabled()) || (await viewerHidesDemo())

  let profileIds: string[] | null = null
  if (role !== 'admin' && role !== 'janitor') {
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

  const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const emailById = new Map<string, string | null>(
    (authList?.users ?? []).map((u) => [u.id, u.email ?? null]),
  )

  const members: CrmMember[] = (rows ?? []).map((m) => ({
    id: m.id as string,
    displayName: (m.display_name as string) ?? 'Unnamed',
    handle: (m.handle as string) ?? '',
    avatarUrl: (m.avatar_url as string) ?? null,
    role: ((m.community_role as CommunityRole) ?? 'member'),
    bio: (m.bio as string) ?? null,
    website: (m.website as string) ?? null,
    email: emailById.get(m.auth_user_id as string) ?? null,
    phone: (m.phone as string) ?? null,
    city: (m.city as string) ?? null,
    joinedAt: (m.created_at as string) ?? null,
    isDemo: Boolean(m.is_demo),
  }))

  return (
    <DashboardTemplate
      eyebrow="CRM"
      title="Contacts"
      description={
        <>
          The people in <strong className="text-text">{scopeLabel(role)}</strong> — message them, open their profile, or start a pipeline deal. Only what members choose to share.
        </>
      }
      width="wide"
    >
      <CrmTabs />

      {members.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No contacts in your scope yet"
          description={`As people join ${scopeLabel(role)}, their cards will appear here.`}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((m) => (
            <li
              key={m.id}
              className={`group flex h-full flex-col rounded-2xl border border-border bg-surface p-5 shadow-sm transition-colors hover:border-primary-bg hover:shadow-md motion-reduce:transition-none ${
                m.isDemo ? 'opacity-[0.72]' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <Link href={`/people/${m.handle}`} className={`shrink-0 ${m.isDemo ? 'grayscale-[0.5]' : ''}`}>
                  {m.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.avatarUrl} alt="" className="h-11 w-11 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-bg text-sm font-semibold text-primary-strong select-none">
                      {getInitials(m.displayName)}
                    </span>
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link
                      href={`/people/${m.handle}`}
                      className="truncate text-base font-bold leading-tight text-text hover:underline"
                    >
                      {m.displayName}
                    </Link>
                    {m.role !== 'member' && <RoleBadge role={m.role} />}
                    {m.isDemo && <DemoBadge />}
                  </div>
                  {m.handle && <p className="mt-0.5 truncate text-xs text-subtle">@{m.handle}</p>}
                </div>
              </div>

              {m.bio && <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted">{m.bio}</p>}

              {(m.email || m.phone || m.city || m.website || m.joinedAt) && (
                <dl className="mt-3 space-y-1 text-xs text-subtle">
                  {m.email && (
                    <div className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      <a href={`mailto:${m.email}`} className="truncate text-primary hover:underline">
                        {m.email}
                      </a>
                    </div>
                  )}
                  {m.phone && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      <a href={`tel:${m.phone}`} className="truncate text-text hover:underline">
                        {m.phone}
                      </a>
                    </div>
                  )}
                  {m.city && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{m.city}</span>
                    </div>
                  )}
                  {m.website && (
                    <div className="flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5 shrink-0" />
                      <a
                        href={m.website.startsWith('http') ? m.website : `https://${m.website}`}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate text-primary hover:underline"
                      >
                        {m.website.replace(/^https?:\/\//, '')}
                      </a>
                    </div>
                  )}
                  {m.joinedAt && (
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 shrink-0" />
                      Joined {new Date(m.joinedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                    </div>
                  )}
                </dl>
              )}

              <div className="mt-auto flex items-center gap-2 pt-4">
                <Link
                  href="/messages"
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
                >
                  <MessageSquare className="h-4 w-4" /> Message
                </Link>
                <StartDealButton profileId={m.id} name={m.displayName} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </DashboardTemplate>
  )
}
