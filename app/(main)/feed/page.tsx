import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { Composer } from '@/components/feed/composer'
import { FeedList } from '@/components/feed/feed-list'
import { UpcomingEventsWidget } from '@/components/events/upcoming-widget'

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

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto">
      {primaryCircleId ? (
        <Composer scopeId={primaryCircleId} visibility="group" />
      ) : (
        <div className="rounded-xl border border-dashed border-gray-200 p-4 mb-4 text-center">
          <p className="text-sm text-gray-500">
            <Link href="/circles" className="text-indigo-600 hover:underline">
              Join a circle
            </Link>{' '}
            to start posting.
          </p>
        </div>
      )}

      <UpcomingEventsWidget scopeIds={myCircleIds} />

      <FeedList
        scopeIds={myCircleIds}
        myProfileId={myProfileId}
      />
    </div>
  )
}
