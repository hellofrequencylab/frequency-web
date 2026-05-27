import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { Composer } from '@/components/feed/composer'
import { FeedList } from '@/components/feed/feed-list'

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'janitor'

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>
}) {
  const { sort: sortParam } = await searchParams
  const sort: 'recent' | 'relevant' = sortParam === 'recent' ? 'recent' : 'relevant'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = createAdminClient()
  let myProfileId: string | null = null
  let myRole: CommunityRole = 'member'
  let myCircleIds: string[] = []
  let primaryCircleId: string | null = null
  let canAnnounce = false
  let communityProfileIds: string[] = []
  let isAdmin = false

  if (user) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id, community_role')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (profile) {
      myProfileId = profile.id
      myRole = (profile.community_role ?? 'member') as CommunityRole
      canAnnounce = ['host', 'guide', 'mentor', 'janitor'].includes(myRole)
      isAdmin = myRole === 'janitor'

      const { data: memberships } = await admin
        .from('memberships')
        .select('circle_id')
        .eq('profile_id', profile.id)
        .eq('status', 'active')
        .order('joined_at', { ascending: true })

      myCircleIds = (memberships ?? []).map((m: any) => m.circle_id as string)
      primaryCircleId = myCircleIds[0] ?? null

      // Build community profile ID list for Host/Guide/Mentor so their feeds
      // include all posts by people in their managed community.
      if (!isAdmin) {
        if (myRole === 'host') {
          const { data: hostedCircles } = await admin
            .from('circles').select('id').eq('host_id', profile.id)
          const ids = (hostedCircles ?? []).map((c: any) => c.id)
          if (ids.length > 0) {
            const { data: ms } = await admin
              .from('memberships').select('profile_id').in('circle_id', ids).eq('status', 'active')
            communityProfileIds = [...new Set((ms ?? []).map((m: any) => m.profile_id as string))]
          }
        } else if (myRole === 'guide') {
          const { data: guidedHubs } = await admin
            .from('hubs').select('id').eq('guide_id', profile.id)
          const hubIds = (guidedHubs ?? []).map((h: any) => h.id)
          if (hubIds.length > 0) {
            const { data: circles } = await admin
              .from('circles').select('id').in('hub_id', hubIds)
            const cids = (circles ?? []).map((c: any) => c.id)
            if (cids.length > 0) {
              const { data: ms } = await admin
                .from('memberships').select('profile_id').in('circle_id', cids).eq('status', 'active')
              communityProfileIds = [...new Set((ms ?? []).map((m: any) => m.profile_id as string))]
            }
          }
        } else if (myRole === 'mentor') {
          const { data: nexuses } = await admin
            .from('nexuses').select('id').eq('mentor_id', profile.id)
          const nexusIds = (nexuses ?? []).map((n: any) => n.id)
          if (nexusIds.length > 0) {
            const { data: hubs } = await admin
              .from('hubs').select('id').in('nexus_id', nexusIds)
            const hubIds = (hubs ?? []).map((h: any) => h.id)
            if (hubIds.length > 0) {
              const { data: circles } = await admin
                .from('circles').select('id').in('hub_id', hubIds)
              const cids = (circles ?? []).map((c: any) => c.id)
              if (cids.length > 0) {
                const { data: ms } = await admin
                  .from('memberships').select('profile_id').in('circle_id', cids).eq('status', 'active')
                communityProfileIds = [...new Set((ms ?? []).map((m: any) => m.profile_id as string))]
              }
            }
          }
        }
      }
    }
  }

  const composerScopeId = primaryCircleId ?? myProfileId
  const composerVisibility: 'public' | 'group' = primaryCircleId ? 'group' : 'public'

  return (
    <div>

      {/* Header */}
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Feed</h1>
        <p className="text-sm text-gray-400 mt-1">
          {myCircleIds.length > 0 ? "What's happening in your circles" : "What's happening"}
        </p>
      </div>

      {/* Composer */}
      {composerScopeId && (
        <div className="mb-6">
          <Composer
            scopeId={composerScopeId}
            visibility={composerVisibility}
            placeholder={primaryCircleId ? 'Share something with your circle…' : 'Share something…'}
            canAnnounce={canAnnounce}
          />
          {!primaryCircleId && (
            <p className="text-xs text-gray-400 -mt-2 px-1">
              <Link href="/circles" className="text-indigo-500 hover:underline">
                Join a circle
              </Link>{' '}
              to post to your group instead.
            </p>
          )}
        </div>
      )}

      {/* Sort toggle + feed */}
      <section className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600">
            {sort === 'relevant' ? 'For You' : 'Recent'}
          </h2>
          <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
            <Link
              href="?sort=relevant"
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                sort === 'relevant'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-50 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              For You
            </Link>
            <Link
              href="?sort=recent"
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                sort === 'recent'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-50 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              Recent
            </Link>
          </div>
        </div>

        <FeedList
          circleIds={myCircleIds}
          communityProfileIds={communityProfileIds}
          isAdmin={isAdmin}
          myProfileId={myProfileId}
          sort={sort}
          viewerRole={myRole}
        />
      </section>
    </div>
  )
}
