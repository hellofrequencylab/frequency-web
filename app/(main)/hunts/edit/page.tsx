import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Map } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { listMyTrails } from '@/lib/hunts/store'
import { IndexTemplate } from '@/components/templates'
import { resolveIndexHero } from '@/lib/layout/index-hero'
import { EmptyState } from '@/components/ui/empty-state'
import { EntityCard } from '@/components/cards/entity-card'

// YOUR TRAILS (FH-013): the Hunts this resident owns, each a door into the editor. Behind the
// authoring switch (404 when off) and a sign-in. The global rail stays, like every member page.
export const metadata: Metadata = { title: 'Your trails', robots: { index: false } }
export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = { draft: 'Draft', live: 'Live', paused: 'Paused', ended: 'Ended' }

export default async function MyTrailsPage() {
  if (!huntSwitchOn('authoring')) notFound()
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in?next=/hunts/edit')
  const [trails, hero] = await Promise.all([listMyTrails(profileId), resolveIndexHero('/hunts/edit')])

  return (
    <IndexTemplate
      {...hero}
      title="Your trails"
      description="Clue trails you have started. Open one to keep going, or start a new one with three stops."
      action={
        <Link href="/hunts/new" className="btn pa">
          New trail
        </Link>
      }
    >
      {trails.length === 0 ? (
        <EmptyState
          icon={Map}
          title="No trails yet."
          description="Start one with three stops."
          action={
            <Link href="/hunts/new" className="btn pa">
              Start a trail
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {trails.map((t) => (
            <li key={t.huntId}>
              <EntityCard
                href={`/hunts/edit/${t.huntId}`}
                title={t.title || 'Untitled trail'}
                meta={`${STATUS_LABEL[t.status] ?? t.status} · ${t.stops} ${t.stops === 1 ? 'stop' : 'stops'}`}
              />
            </li>
          ))}
        </ul>
      )}
    </IndexTemplate>
  )
}
