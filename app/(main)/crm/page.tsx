import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Contact, MessageSquare, Globe, Cake, Sparkles, HeartPulse, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { atLeastRole, type CommunityRole } from '@/lib/core/roles'
import { RoleBadge } from '@/lib/community-roles'
import { getInitials } from '@/lib/utils'

export const dynamic = 'force-dynamic'

// What a steward "reaches", by role. Hosts see their circles' members; guides
// their hub; mentors their nexus; admin/janitor the whole community.
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
  joinedAt: string | null
}

// Resolve the circle ids this steward oversees (host/guide/mentor). Admin and
// janitor bypass this and read the whole roster.
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

export default async function CrmPage() {
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
  // CRM is a steward tool — hosts and up.
  if (!caller || !atLeastRole(role, 'host')) redirect('/feed')

  // Resolve which profiles this steward can see.
  let profileIds: string[] | null = null // null = whole community (admin/janitor)
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
    .select('id, display_name, handle, avatar_url, community_role, bio, website, created_at')
    .eq('is_system', false)
    .neq('id', caller.id as string)
    .order('display_name', { ascending: true })
    .limit(300)
  if (profileIds !== null) {
    // Steward scope: restrict to the resolved member ids (empty → no rows).
    query = query.in('id', profileIds.length ? profileIds : ['00000000-0000-0000-0000-000000000000'])
  }
  const { data: rows } = await query

  const members: CrmMember[] = (rows ?? []).map((m) => ({
    id: m.id as string,
    displayName: (m.display_name as string) ?? 'Unnamed',
    handle: (m.handle as string) ?? '',
    avatarUrl: (m.avatar_url as string) ?? null,
    role: ((m.community_role as CommunityRole) ?? 'member'),
    bio: (m.bio as string) ?? null,
    website: (m.website as string) ?? null,
    joinedAt: (m.created_at as string) ?? null,
  }))

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-1 flex items-center gap-2">
        <Contact className="h-5 w-5 text-primary-strong" />
        <h1 className="text-2xl font-bold text-text">CRM</h1>
      </div>
      <p className="mb-6 text-sm text-muted">
        The people in <strong className="text-text">{scopeLabel(role)}</strong> — get to know them and
        reach out. No sensitive data: only what members choose to share.
      </p>

      {members.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-8 text-center">
          <Search className="mx-auto h-6 w-6 text-subtle" />
          <p className="mt-3 text-sm font-medium text-text">No members in your scope yet</p>
          <p className="mt-1 text-sm text-muted">
            As people join {scopeLabel(role)}, their cards will appear here.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((m) => (
            <li key={m.id} className="flex flex-col rounded-2xl border border-border bg-surface p-4 shadow-sm">
              <div className="flex items-start gap-3">
                {m.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.avatarUrl} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-sm font-semibold text-muted">
                    {getInitials(m.displayName)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/people/${m.handle}`}
                      className="truncate text-sm font-semibold text-text hover:underline"
                    >
                      {m.displayName}
                    </Link>
                    <RoleBadge role={m.role} />
                  </div>
                  {m.handle && <p className="truncate text-xs text-subtle">@{m.handle}</p>}
                </div>
              </div>

              {m.bio && <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted">{m.bio}</p>}

              <dl className="mt-3 space-y-1 text-xs text-subtle">
                {m.website && (
                  <div className="flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5" />
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
                    <Cake className="h-3.5 w-3.5" />
                    Joined {new Date(m.joinedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                  </div>
                )}
              </dl>

              {/* Opt-in data channels — coming soon. Shows the shape of what
                  members will be able to share with their leaders. */}
              <div className="mt-3 rounded-lg border border-dashed border-border bg-marketing-canvas/50 px-3 py-2">
                <p className="text-sm font-bold text-text">Opt-in channels — soon</p>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-subtle">
                  <span className="inline-flex items-center gap-1"><Cake className="h-3 w-3" /> Birthday</span>
                  <span className="inline-flex items-center gap-1"><Sparkles className="h-3 w-3" /> Astro / HD</span>
                  <span className="inline-flex items-center gap-1"><HeartPulse className="h-3 w-3" /> Wellbeing</span>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <Link
                  href="/messages"
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
                >
                  <MessageSquare className="h-4 w-4" /> Message
                </Link>
                <Link
                  href={`/people/${m.handle}`}
                  className="inline-flex items-center justify-center rounded-xl border border-border px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-elevated"
                >
                  Profile
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
