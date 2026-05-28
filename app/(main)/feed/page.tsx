import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { Composer } from '@/components/feed/composer'
import { FeedList } from '@/components/feed/feed-list'
import { CreateMenu } from '@/components/feed/create-menu'

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
  let primaryCircleId: string | null = null
  let canAnnounce = false

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

      const { data: membership } = await admin
        .from('memberships')
        .select('circle_id')
        .eq('profile_id', profile.id)
        .eq('status', 'active')
        .order('joined_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      primaryCircleId = (membership?.circle_id as string) ?? null
    }
  }

  const composerScopeId = primaryCircleId ?? myProfileId
  const composerVisibility: 'public' | 'group' = primaryCircleId ? 'group' : 'public'
  const hasCircle = !!primaryCircleId

  return (
    <div className="max-w-2xl mx-auto w-full">

      {/* Header */}
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text mb-1">Feed</h1>
          <p className="text-sm text-muted leading-relaxed max-w-2xl">
            {hasCircle ? "Here's what your circles are up to right now." : "What's happening across the community."}
          </p>
        </div>
        <CreateMenu role={myRole} />
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
            <p className="text-xs text-subtle -mt-2 px-1">
              <Link href="/circles" className="text-primary-strong hover:underline">
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
          <h2 className="text-xs font-semibold uppercase tracking-widest text-subtle">
            {sort === 'relevant' ? 'For You' : 'Recent'}
          </h2>
          <div className="flex items-center gap-0.5 bg-surface-elevated rounded-lg p-0.5">
            <Link
              href="?sort=relevant"
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                sort === 'relevant'
                  ? 'bg-white text-text shadow-sm'
                  : 'text-muted hover:text-text'
              }`}
            >
              For You
            </Link>
            <Link
              href="?sort=recent"
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                sort === 'recent'
                  ? 'bg-white text-text shadow-sm'
                  : 'text-muted hover:text-text'
              }`}
            >
              Recent
            </Link>
          </div>
        </div>

        <FeedList
          myProfileId={myProfileId}
          sort={sort}
          viewerRole={myRole}
        />
      </section>
    </div>
  )
}
