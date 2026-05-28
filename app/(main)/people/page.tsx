import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Globe } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { InviteMemberCompose } from '@/components/compose/invite-member-compose'

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'janitor'

const ROLE_BADGE: Record<CommunityRole, { label: string; cls: string }> = {
  member:  { label: 'Member',  cls: 'bg-surface-elevated text-muted dark:bg-surface-elevated dark:text-subtle' },
  crew:    { label: 'Crew',    cls: 'bg-signal-bg text-signal-strong' },
  host:    { label: 'Host',    cls: 'bg-success-bg text-success' },
  guide:   { label: 'Guide',   cls: 'bg-signal-bg text-signal-strong' },
  mentor:  { label: 'Mentor',  cls: 'bg-warning-bg text-warning' },
  janitor: { label: 'Janitor', cls: 'bg-signal-bg text-signal-strong' },
}

type Profile = {
  id: string
  display_name: string
  handle: string
  avatar_url: string | null
  community_role: CommunityRole
  nexus_regions: { name: string } | null
}

export default async function DirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; region?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { role: roleFilter, region: regionFilter } = await searchParams

  const admin = createAdminClient()

  // Get viewer's display name for the Invite Member modal
  const { data: viewer } = await admin
    .from('profiles')
    .select('display_name')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const viewerName = (viewer?.display_name as string | undefined) ?? 'A friend'

  let query = admin
    .from('profiles')
    .select('id, display_name, handle, avatar_url, community_role, nexus_regions!nexus_region_id ( name )')
    .eq('is_active', true)
    .order('display_name', { ascending: true })

  if (roleFilter) query = query.eq('community_role', roleFilter)

  const { data: profiles } = await query

  // Fetch all distinct regions for the filter dropdown
  const { data: regions } = await admin
    .from('nexus_regions')
    .select('id, name')
    .order('name')

  const typedProfiles = (profiles ?? []) as unknown as Profile[]

  // Apply region filter client-side (join result)
  const filtered = regionFilter
    ? typedProfiles.filter(p => p.nexus_regions?.name === regionFilter)
    : typedProfiles

  const roles: CommunityRole[] = ['member', 'crew', 'host', 'guide', 'mentor', 'janitor']

  function filterHref(params: Record<string, string | undefined>) {
    const p = new URLSearchParams()
    if (params.role) p.set('role', params.role)
    if (params.region) p.set('region', params.region)
    const s = p.toString()
    return s ? `/people?${s}` : '/people'
  }

  return (
    <div>

      {/* Header */}
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Globe className="w-5 h-5 text-primary-strong" />
            <h1 className="text-2xl font-bold text-text">Directory</h1>
          </div>
          <p className="text-sm text-muted">
            Browse and connect with community members.
          </p>
        </div>
        <InviteMemberCompose inviterName={viewerName} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {/* Role filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted font-medium">Role:</span>
          <Link
            href={filterHref({ region: regionFilter })}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              !roleFilter
                ? 'bg-primary text-on-primary border-primary'
                : 'bg-surface text-muted border-border hover:border-primary'
            }`}
          >
            All
          </Link>
          {roles.map(r => (
            <Link
              key={r}
              href={filterHref({ role: r, region: regionFilter })}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                roleFilter === r
                  ? 'bg-primary text-on-primary border-primary'
                  : 'bg-surface text-muted border-border hover:border-primary'
              }`}
            >
              {ROLE_BADGE[r].label}
            </Link>
          ))}
        </div>

        {/* Region filter */}
        {regions && regions.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted font-medium">Region:</span>
            <Link
              href={filterHref({ role: roleFilter })}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                !regionFilter
                  ? 'bg-primary text-on-primary border-primary'
                  : 'bg-surface text-muted border-border hover:border-primary'
              }`}
            >
              All
            </Link>
            {regions.map((reg: { id: string; name: string }) => (
              <Link
                key={reg.id}
                href={filterHref({ role: roleFilter, region: reg.name })}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  regionFilter === reg.name
                    ? 'bg-primary text-on-primary border-primary'
                    : 'bg-surface text-muted border-border hover:border-primary'
                }`}
              >
                {reg.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Member count */}
      <p className="text-xs text-subtle mb-4">{filtered.length} member{filtered.length !== 1 ? 's' : ''}</p>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface/50 dark:bg-canvas/50 p-12 text-center">
          <Globe className="w-8 h-8 text-subtle/60 mx-auto mb-3" />
          <p className="text-sm text-muted">No members match these filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map(p => {
            const role = (p.community_role ?? 'member') as CommunityRole
            const badge = ROLE_BADGE[role] ?? ROLE_BADGE.member
            return (
              <Link
                key={p.id}
                href={`/people/${p.handle}`}
                className="group flex items-start gap-3 rounded-2xl border border-border bg-surface shadow-sm p-4 hover:border-primary-bg dark:hover:border-primary hover:shadow-md transition-all"
              >
                {p.avatar_url ? (
                  <img
                    src={p.avatar_url}
                    alt={p.display_name}
                    className="w-10 h-10 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-primary-bg text-primary-strong text-sm font-semibold flex items-center justify-center shrink-0 select-none">
                    {getInitials(p.display_name)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text group-hover:text-primary-strong dark:group-hover:text-primary-strong transition-colors truncate">
                    {p.display_name}
                  </p>
                  <p className="text-xs text-subtle truncate">@{p.handle}</p>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${badge.cls}`}>
                      {badge.label}
                    </span>
                    {p.nexus_regions?.name && (
                      <span className="text-[11px] text-subtle">{p.nexus_regions.name}</span>
                    )}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
