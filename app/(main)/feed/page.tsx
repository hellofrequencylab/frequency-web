import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { Composer } from '@/components/feed/composer'
import { FeedList } from '@/components/feed/feed-list'

export default async function FeedPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const admin = createAdminClient()
  let myProfileId: string | null = null
  let myCircleIds: string[] = []
  let primaryCircleId: string | null = null

  if (user) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (profile) {
      myProfileId = profile.id

      const { data: memberships } = await admin
        .from('memberships')
        .select('circle_id')
        .eq('profile_id', profile.id)
        .eq('status', 'active')
        .order('joined_at', { ascending: true })

      myCircleIds = (memberships ?? []).map((m) => m.circle_id as string)
      primaryCircleId = myCircleIds[0] ?? null
    }
  }

  // When not in any circle yet, scope posts to the user's own profile ID
  // with public visibility so they still show in this feed.
  const composerScopeId = primaryCircleId ?? myProfileId
  const composerVisibility: 'group' | 'public' = primaryCircleId ? 'group' : 'public'

  // FeedList scope: circle IDs + profile-scoped public posts as fallback
  const feedScopeIds =
    myCircleIds.length > 0
      ? myCircleIds
      : myProfileId
      ? [myProfileId]
      : []

  return (
    <div className="px-6 py-8 max-w-2xl mx-auto">

      {/* ── Page header ──────────────────────────────────────── */}
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Feed</h1>
        <p className="text-sm text-gray-400 mt-1">
          {myCircleIds.length > 0
            ? "What's happening in your circles"
            : "Share what's on your mind"}
        </p>
      </div>

      {/* ── Composer ─────────────────────────────────────────── */}
      {composerScopeId ? (
        <div className="mb-6">
          <Composer
            scopeId={composerScopeId}
            visibility={composerVisibility}
            placeholder={
              primaryCircleId
                ? 'Share something with your circle…'
                : 'Share something…'
            }
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
      ) : null}

      {/* ── Posts ────────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600 mb-4">
          Recent
        </h2>
        <FeedList
          scopeIds={feedScopeIds}
          myProfileId={myProfileId}
        />
      </section>

    </div>
  )
}
