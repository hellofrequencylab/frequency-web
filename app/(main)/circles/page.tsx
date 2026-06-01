import Link from 'next/link'
import { Users, Compass, ArrowRight } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NewCircleCompose } from '@/components/compose/new-circle-compose'
import { IndexTemplate } from '@/components/templates/index-template'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { CircleCard } from '@/components/circles/circle-card'
import { CIRCLE_SELECT, type CircleRow, toCardData } from '@/components/circles/circle-data'

// The calm, belonging-first Circles home: what you belong to, a short curated
// set worth joining, and one clear door to the full discovery surface
// (/circles/browse). Power tools (search, filters, map, region browse) live
// there, not here, to keep the front door low-anxiety (Hick's law).
export default async function CirclesPage() {
  const admin = createAdminClient()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let myCircleIds: string[] = []
  let isAdmin = false
  if (user) {
    const { data: profile } = await admin
      .from('profiles').select('id, community_role').eq('auth_user_id', user.id).maybeSingle()
    if (profile) {
      isAdmin = ['host', 'guide', 'mentor', 'janitor'].includes(profile.community_role ?? '')
      const { data: mems } = await admin
        .from('memberships').select('circle_id').eq('profile_id', profile.id).eq('status', 'active')
      myCircleIds = (mems ?? []).map((m) => m.circle_id as string)
    }
  }

  const { data: rawCircles } = await admin
    .from('circles').select(CIRCLE_SELECT).neq('status', 'archived').order('name', { ascending: true })
  const all = (rawCircles ?? []) as unknown as CircleRow[]

  const { data: interestRows } = await admin.from('topical_channels').select('id, name').order('name')
  const interests = (interestRows ?? []) as { id: string; name: string }[]

  const myCircles = all.filter((c) => myCircleIds.includes(c.id))
  const candidates = all.filter((c) => !myCircleIds.includes(c.id))

  // "For you" — a short, relevance-ranked set: shares an interest with your
  // circles (+3), in the same nexus (+2), has open spots (+1); then by size.
  const myInterests = new Set(myCircles.map((c) => c.topical_channel_id).filter(Boolean) as string[])
  const myNexuses = new Set(myCircles.map((c) => c.hub?.nexus?.id).filter(Boolean) as string[])
  const score = (c: CircleRow) => {
    let s = 0
    if (c.topical_channel_id && myInterests.has(c.topical_channel_id)) s += 3
    if (c.hub?.nexus?.id && myNexuses.has(c.hub.nexus.id)) s += 2
    if (c.member_count < c.member_cap) s += 1
    return s
  }
  const forYou = [...candidates]
    .sort((a, b) => score(b) - score(a) || b.member_count - a.member_count)
    .slice(0, 6)

  const browseAll = (
    <Link
      href="/circles/browse"
      className="inline-flex items-center gap-1 text-sm font-semibold text-primary-strong transition-colors hover:text-primary-hover"
    >
      Browse all <ArrowRight className="h-4 w-4" />
    </Link>
  )

  return (
    <IndexTemplate
      title="Circles"
      description="Your people — the crew you show up with. Here's where you belong, and a few worth joining."
      action={user ? <NewCircleCompose interests={interests} buttonLabel="Start a circle" /> : undefined}
      toolbar={
        isAdmin ? (
          <Link href="/admin/circles" className="text-sm font-medium text-muted transition-colors hover:text-primary-strong">
            Manage circles →
          </Link>
        ) : undefined
      }
    >
      <div className="space-y-10">
        {/* Your circles */}
        <section>
          <SectionHeader title="Your circles" count={myCircles.length || undefined} />
          {myCircles.length === 0 ? (
            <EmptyState
              icon={Users}
              title="You're not in a circle yet"
              description="A circle is your local crew — the people you show up with week to week. Join one below, or start your own."
              action={user ? <NewCircleCompose interests={interests} buttonLabel="Start a circle" /> : undefined}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {myCircles.map((c) => <CircleCard key={c.id} circle={toCardData(c)} isMember />)}
            </div>
          )}
        </section>

        {/* For you — short curated set */}
        {forYou.length > 0 && (
          <section>
            <SectionHeader title="For you" action={browseAll} />
            <div className="grid gap-3 sm:grid-cols-2">
              {forYou.map((c) => <CircleCard key={c.id} circle={toCardData(c)} isMember={false} />)}
            </div>
          </section>
        )}

        {/* The single door to the full discovery surface */}
        <Link
          href="/circles/browse"
          className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm transition-all hover:border-primary-bg hover:shadow-md"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
              <Compass className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-base font-semibold text-text">Browse all circles</p>
              <p className="text-sm text-muted">Search, filter by interest, see the map, explore by region.</p>
            </div>
          </div>
          <ArrowRight className="h-5 w-5 shrink-0 text-muted" />
        </Link>
      </div>
    </IndexTemplate>
  )
}
