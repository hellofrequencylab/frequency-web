import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Megaphone, Zap } from 'lucide-react'
import { relativeTime } from '@/lib/utils'
import { BroadcastCompose } from './broadcast-compose'
import { ContextActions } from '@/components/context-actions'
import { IndexTemplate } from '@/components/templates/index-template'
import { EmptyState } from '@/components/ui/empty-state'
import { EntityCard } from '@/components/cards/entity-card'

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'janitor'
const HOST_PLUS: CommunityRole[] = ['host', 'guide', 'mentor', 'janitor']

type DispatchRow = {
  id: string
  title: string
  excerpt: string | null
  author_id: string
  audience_scope: string
  published_at: string
  author: { display_name: string; avatar_url: string | null } | null
  linked_task: { id: string; name: string } | null
}

export default async function BroadcastPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()

  // Get caller's profile + memberships
  const { data: profile } = await admin
    .from('profiles')
    .select('id, community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) notFound()

  // Get circles the user belongs to
  const { data: memberships } = await admin
    .from('memberships')
    .select('circle_id')
    .eq('profile_id', profile.id)
    .eq('status', 'active')

  const circleIds = (memberships ?? []).map((m) => m.circle_id as string)

  // Get hub IDs for those circles
  let hubIds: string[] = []
  if (circleIds.length > 0) {
    const { data: circles } = await admin
      .from('circles')
      .select('hub_id')
      .in('id', circleIds)
    hubIds = (circles ?? []).map((c) => c.hub_id).filter(Boolean) as string[]
  }

  // Get nexus IDs for those hubs
  let nexusIds: string[] = []
  if (hubIds.length > 0) {
    const { data: hubs } = await admin
      .from('hubs')
      .select('nexus_id')
      .in('id', hubIds)
    nexusIds = (hubs ?? []).map((h) => h.nexus_id).filter(Boolean) as string[]
  }

  // Build dispatch query. Fetch all published dispatches visible to this user
  let dispatches: DispatchRow[] = []

  const baseQuery = () =>
    admin
      .from('dispatches')
      .select(`
        id, title, excerpt, audience_scope, published_at, author_id,
        author:profiles!author_id ( display_name, avatar_url ),
        linked_task:crew_tasks!linked_task_id ( id, name )
      `)
      .eq('status', 'published')
      .is('hidden_at', null)
      .order('published_at', { ascending: false })
      .limit(40)

  // Collect all visible dispatches. By audience targeting + own authored dispatches
  const promises: ReturnType<typeof baseQuery>[] = [
    // Always include dispatches this user authored (creators see their own content)
    baseQuery().eq('author_id', profile.id),
  ]

  if (circleIds.length > 0)
    promises.push(baseQuery().eq('audience_scope', 'circle').in('audience_id', circleIds))
  if (hubIds.length > 0)
    promises.push(baseQuery().eq('audience_scope', 'hub').in('audience_id', hubIds))
  if (nexusIds.length > 0)
    promises.push(baseQuery().eq('audience_scope', 'nexus').in('audience_id', nexusIds))

  const results = await Promise.all(promises)
  const combined = results.flatMap(r => r.data ?? [])
  // Dedupe + sort by published_at
  const seen = new Set<string>()
  dispatches = combined
    .filter(d => { if (seen.has(d.id)) return false; seen.add(d.id); return true })
    .sort((a, b) => new Date(b.published_at ?? 0).getTime() - new Date(a.published_at ?? 0).getTime())
    .slice(0, 20) as unknown as DispatchRow[]

  // Audience options for host+ compose form
  const isHost = HOST_PLUS.includes((profile as { community_role: CommunityRole }).community_role)
  let namedCircles: { id: string; name: string }[] = []
  let namedHubs:    { id: string; name: string }[] = []
  let namedNexuses: { id: string; name: string }[] = []

  if (isHost && circleIds.length > 0) {
    const { data: cRes } = await admin.from('circles').select('id, name').in('id', circleIds)
    namedCircles = cRes ?? []
  }
  if (isHost && hubIds.length > 0) {
    const { data: hRes } = await admin.from('hubs').select('id, name').in('id', hubIds)
    namedHubs = hRes ?? []
  }
  if (isHost && nexusIds.length > 0) {
    const { data: nRes } = await admin.from('nexuses').select('id, name').in('id', nexusIds)
    namedNexuses = nRes ?? []
  }

  const canCompose = isHost && (namedCircles.length > 0 || namedHubs.length > 0 || namedNexuses.length > 0)

  return (
    <IndexTemplate
      title="Broadcasts"
      description="Announcements, events, and challenges from your community. Worth a scroll when you have a minute."
      action={canCompose ? <BroadcastCompose circles={namedCircles} hubs={namedHubs} nexuses={namedNexuses} /> : undefined}
    >
      {dispatches.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No broadcasts yet"
          description="Your hosts and guides post announcements, events, and challenges here."
        />
      ) : (
        <div className="grid max-w-2xl grid-cols-1 gap-3">
          {dispatches.map((d) => (
            <DispatchCard
              key={d.id}
              dispatch={d}
              viewerRole={(profile as { community_role: CommunityRole }).community_role}
              myProfileId={profile.id}
            />
          ))}
        </div>
      )}
    </IndexTemplate>
  )
}

function DispatchCard({ dispatch: d, viewerRole, myProfileId }: { dispatch: DispatchRow; viewerRole: CommunityRole; myProfileId: string }) {
  const isAuthor = d.author_id === myProfileId
  const showActions = isAuthor || HOST_PLUS.includes(viewerRole)
  const scope = d.audience_scope
    ? d.audience_scope.charAt(0).toUpperCase() + d.audience_scope.slice(1)
    : 'Community'

  return (
    <EntityCard
      href={`/broadcast/${d.id}`}
      anchor={
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-bg text-primary-strong">
          {d.linked_task ? <Zap className="h-5 w-5" /> : <Megaphone className="h-5 w-5" />}
        </div>
      }
      title={d.title}
      context={d.linked_task ? `${scope} · Challenge` : `${scope} broadcast`}
      description={d.excerpt ?? undefined}
      meta={
        <>
          {d.author && <span>{d.author.display_name}</span>}
          <span>{relativeTime(d.published_at)}</span>
        </>
      }
      action={
        showActions
          ? <ContextActions role={viewerRole} context={{ type: 'dispatch', id: d.id, isAuthor }} />
          : undefined
      }
    />
  )
}
