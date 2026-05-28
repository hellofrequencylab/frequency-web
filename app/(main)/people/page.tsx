import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Globe } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { InviteMemberCompose } from '@/components/compose/invite-member-compose'

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'janitor'

const ROLE_BADGE: Record<CommunityRole, { label: string; cls: string }> = {
  member:  { label: 'Member',  cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
  crew:    { label: 'Crew',    cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400' },
  host:    { label: 'Host',    cls: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400' },
  guide:   { label: 'Guide',   cls: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400' },
  mentor:  { label: 'Mentor',  cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400' },
  janitor: { label: 'Janitor', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-400' },
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
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Globe className="w-5 h-5 text-indigo-500" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Directory</h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Browse and connect with community members.
          </p>
        </div>
        <InviteMemberCompose inviterName={viewerName} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {/* Role filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Role:</span>
          <Link
            href={filterHref({ region: regionFilter })}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              !roleFilter
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-indigo-300'
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
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-indigo-300'
              }`}
            >
              {ROLE_BADGE[r].label}
            </Link>
          ))}
        </div>

        {/* Region filter */}
        {regions && regions.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Region:</span>
            <Link
              href={filterHref({ role: roleFilter })}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                !regionFilter
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-indigo-300'
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
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-indigo-300'
                }`}
              >
                {reg.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Member count */}
      <p className="text-xs text-gray-400 mb-4">{filtered.length} member{filtered.length !== 1 ? 's' : ''}</p>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200/60 dark:border-gray-800/60 bg-gray-50/50 dark:bg-gray-900/50 p-12 text-center">
          <Globe className="w-8 h-8 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No members match these filters.</p>
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
                className="group flex items-start gap-3 rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900 shadow-sm p-4 hover:border-indigo-200 dark:hover:border-indigo-800 hover:shadow-md transition-all"
              >
                {p.avatar_url ? (
                  <img
                    src={p.avatar_url}
                    alt={p.display_name}
                    className="w-10 h-10 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 text-sm font-semibold flex items-center justify-center shrink-0 select-none">
                    {getInitials(p.display_name)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-50 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
                    {p.display_name}
                  </p>
                  <p className="text-xs text-gray-400 truncate">@{p.handle}</p>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${badge.cls}`}>
                      {badge.label}
                    </span>
                    {p.nexus_regions?.name && (
                      <span className="text-[11px] text-gray-400">{p.nexus_regions.name}</span>
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
