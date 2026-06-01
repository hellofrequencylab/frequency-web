import Link from 'next/link'
import { Users, Compass, ArrowLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NewCircleCompose } from '@/components/compose/new-circle-compose'
import { IndexTemplate } from '@/components/templates/index-template'
import { Nearby } from '@/components/circles/nearby'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { CircleCard } from '@/components/circles/circle-card'
import { CirclesToolbar } from '@/components/circles/circles-toolbar'
import { CIRCLE_SELECT, type CircleRow, toCardData } from '@/components/circles/circle-data'

export default async function BrowseCirclesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; interest?: string; sort?: string; q?: string }>
}) {
  const { type, interest, sort = 'nearest', q } = await searchParams
  const admin = createAdminClient()
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  let myCircleIds: string[] = []
  if (user) {
    const { data: profile } = await admin
      .from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle()
    if (profile) {
      const { data: mems } = await admin
        .from('memberships').select('circle_id').eq('profile_id', profile.id).eq('status', 'active')
      myCircleIds = (mems ?? []).map((m) => m.circle_id as string)
    }
  }

  const { data: rawCircles } = await admin
    .from('circles').select(CIRCLE_SELECT).neq('status', 'archived').order('name', { ascending: true })
  const all = (rawCircles ?? []) as unknown as CircleRow[]

  const { data: interestRows } = await admin
    .from('topical_channels').select('id, name, category').order('name')
  const interests = (interestRows ?? []) as { id: string; name: string; category: string }[]

  const qLower = (q ?? '').trim().toLowerCase()
  let filtered = all.filter((c) => {
    if (type === 'in-person' && c.type !== 'in-person') return false
    if (type === 'online' && c.type !== 'online') return false
    if (interest && c.topical_channel_id !== interest) return false
    if (qLower) {
      const hay = `${c.name} ${c.about ?? ''} ${c.neighborhood ?? ''} ${c.channel?.name ?? ''}`.toLowerCase()
      if (!hay.includes(qLower)) return false
    }
    return true
  })

  if (sort === 'active') filtered = [...filtered].sort((a, b) => b.member_count - a.member_count)
  else if (sort === 'new') filtered = [...filtered].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
  else if (sort === 'open') filtered = [...filtered].sort((a, b) => (b.member_cap - b.member_count) - (a.member_cap - a.member_count))
  else filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name))

  const discover = filtered.filter((c) => !myCircleIds.includes(c.id))
  const filtering = !!(type || interest || qLower)

  const locatableCircles = all
    .filter((c) => c.type === 'in-person' && c.latitude != null && c.longitude != null)
    .map((c) => ({ id: c.id, name: c.name, slug: c.slug, latitude: c.latitude as number, longitude: c.longitude as number, neighborhood: c.neighborhood }))

  const interestCount = new Map<string, number>()
  for (const c of all) if (c.topical_channel_id) interestCount.set(c.topical_channel_id, (interestCount.get(c.topical_channel_id) ?? 0) + 1)
  const interestChips = interests
    .map((i) => ({ ...i, count: interestCount.get(i.id) ?? 0 }))
    .filter((i) => i.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)

  const nexusMap = new Map<string, { name: string; slug: string; count: number }>()
  for (const c of all) {
    const nx = c.hub?.nexus
    if (nx) nexusMap.set(nx.id, { name: nx.name, slug: nx.slug, count: (nexusMap.get(nx.id)?.count ?? 0) + 1 })
  }
  const nexuses = [...nexusMap.values()].sort((a, b) => b.count - a.count).slice(0, 8)

  return (
    <IndexTemplate
      title="Browse circles"
      description="The whole network — search, filter by interest, see what's near you on the map, and explore by region."
      action={user ? <NewCircleCompose interests={interests} buttonLabel="Start a circle" /> : undefined}
      toolbar={
        <Link href="/circles" className="inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-primary-strong">
          <ArrowLeft className="h-4 w-4" /> Back to Circles
        </Link>
      }
    >
      <CirclesToolbar interests={interests} />

      <div className="mt-6 space-y-10">
        {!filtering && locatableCircles.length > 0 && (
          <section>
            <Nearby circles={locatableCircles} />
          </section>
        )}

        <section>
          <SectionHeader title={filtering ? 'Results' : 'All circles'} count={discover.length} />
          {discover.length === 0 ? (
            <EmptyState
              icon={Users}
              title={filtering ? 'No circles match these filters' : 'No circles yet'}
              description={filtering ? 'Try a wider search, or start the first one for this corner of the network.' : 'Be the first — start a circle for your neighborhood or an interest.'}
              action={user ? <NewCircleCompose interests={interests} buttonLabel="Start a circle" /> : undefined}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {discover.map((c) => <CircleCard key={c.id} circle={toCardData(c)} isMember={false} />)}
            </div>
          )}
        </section>

        {interestChips.length > 0 && (
          <section>
            <SectionHeader title="Browse by interest" />
            <div className="flex flex-wrap gap-2">
              {interestChips.map((i) => {
                const active = interest === i.id
                return (
                  <Link
                    key={i.id}
                    href={`/circles/browse?interest=${active ? '' : i.id}`}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                      active ? 'border-primary-bg bg-primary-bg text-primary-strong' : 'border-border bg-surface text-muted hover:border-primary-bg hover:text-text'
                    }`}
                  >
                    {i.name}
                    <span className="text-xs tabular-nums text-subtle">{i.count}</span>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {nexuses.length > 0 && (
          <section>
            <SectionHeader title="Explore the network" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {nexuses.map((nx) => (
                <Link
                  key={nx.slug}
                  href={`/nexuses/${nx.slug}`}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm transition-all hover:border-primary-bg hover:shadow-md"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-primary-strong">
                    <Compass className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-text">{nx.name}</p>
                    <p className="text-xs text-subtle">{nx.count} circle{nx.count === 1 ? '' : 's'}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </IndexTemplate>
  )
}
