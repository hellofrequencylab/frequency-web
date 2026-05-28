import Link from 'next/link'
import { Suspense } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { Composer } from '@/components/feed/composer'
import { FeedList } from '@/components/feed/feed-list'
import { CreateMenu } from '@/components/feed/create-menu'
import { Skeleton } from '@/components/ui/skeleton'

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

        {/* The post list runs the feed's heaviest queries. Streaming it lets
            the header, composer, and sort toggle paint immediately while the
            posts resolve and stream in behind a skeleton. */}
        <Suspense fallback={<FeedListSkeleton />}>
          <FeedList
            myProfileId={myProfileId}
            sort={sort}
            viewerRole={myRole}
          />
        </Suspense>
      </section>
    </div>
  )
}

function FeedListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-surface p-4">
          <div className="flex gap-3">
            <Skeleton className="w-9 h-9 rounded-full shrink-0" />
            <div className="flex-1 space-y-2 min-w-0">
              <div className="flex items-center gap-2">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3.5 w-12 rounded-full" />
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-3/5" />
              <div className="flex gap-3 pt-1">
                <Skeleton className="h-3 w-10" />
                <Skeleton className="h-3 w-10" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
