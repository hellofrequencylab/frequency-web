import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { startConversation } from '@/app/(main)/messages/actions'
import { Composer } from '@/components/feed/composer'
import { ProfileFeed } from '@/components/feed/profile-feed'
import { getInitials } from '@/lib/utils'

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'janitor'

const ROLE_BADGE: Record<CommunityRole, { label: string; cls: string }> = {
  member:  { label: 'Member',  cls: 'bg-gray-100 text-gray-600' },
  crew:    { label: 'Crew',    cls: 'bg-blue-100 text-blue-700' },
  host:    { label: 'Host',    cls: 'bg-green-100 text-green-700' },
  guide:   { label: 'Guide',   cls: 'bg-purple-100 text-purple-700' },
  mentor:  { label: 'Mentor',  cls: 'bg-amber-100 text-amber-700' },
  janitor: { label: 'Janitor', cls: 'bg-violet-100 text-violet-700' },
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>
}) {
  const { handle } = await params

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select(`
      id,
      auth_user_id,
      display_name,
      handle,
      bio,
      avatar_url,
      community_role,
      nexus_regions!nexus_region_id ( name )
    `)
    .eq('handle', handle)
    .eq('is_active', true)
    .maybeSingle()

  if (!profile) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const isOwner = !!user && profile.auth_user_id === user.id

  const role = (profile.community_role ?? 'member') as CommunityRole
  const badge = ROLE_BADGE[role] ?? ROLE_BADGE.member
  const initials = getInitials(profile.display_name)
  const regionName = (profile.nexus_regions as unknown as { name: string } | null)?.name

  let myProfileId: string | null = null
  let myRole: CommunityRole = 'member'

  if (user) {
    const { data: viewer } = await admin
      .from('profiles')
      .select('id, community_role')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    if (viewer) {
      myProfileId = viewer.id as string
      myRole = (viewer.community_role ?? 'member') as CommunityRole
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Profile header card */}
      <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900 shadow-sm p-6 mb-6">

        {/* Avatar + identity + edit/message button */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.display_name}
                className="w-20 h-20 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-indigo-100 text-indigo-600 text-2xl font-semibold flex items-center justify-center shrink-0">
                {initials}
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50 leading-tight">
                {profile.display_name}
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">@{profile.handle}</p>
              <span
                className={`inline-block mt-2 px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}
              >
                {badge.label}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isOwner ? (
              <Link
                href="/settings/profile"
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Edit
              </Link>
            ) : user ? (
              <form action={startConversation.bind(null, profile.id as string)}>
                <button
                  type="submit"
                  className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
                >
                  Message
                </button>
              </form>
            ) : null}
          </div>
        </div>

        {/* Bio + region */}
        {(profile.bio || regionName) && (
          <div className="border-t border-gray-100 dark:border-gray-800 pt-5 space-y-3">
            {profile.bio && (
              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                {profile.bio}
              </p>
            )}
            {regionName && (
              <p className="flex items-center gap-1.5 text-xs text-gray-400">
                <svg
                  className="w-3.5 h-3.5 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
                  />
                </svg>
                {regionName}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Wall composer — everyone can post */}
      {myProfileId && (
        <div className="mb-6">
          <Composer
            scopeId={profile.id as string}
            visibility="public"
            placeholder={
              isOwner
                ? 'Share something...'
                : `Write on ${profile.display_name}'s wall...`
            }
          />
        </div>
      )}

      {/* Timeline */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600 mb-4">
          Timeline
        </h2>
        <ProfileFeed
          profileId={profile.id as string}
          profileHandle={profile.handle as string}
          myProfileId={myProfileId}
          viewerRole={myRole}
        />
      </section>
    </div>
  )
}
