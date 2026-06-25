import { Users, Building2 } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { SectionHeader } from '@/components/ui/section-header'
import { EntityCard } from '@/components/cards/entity-card'
import { getLedHubs, getLedNexuses } from '@/app/(main)/lead/load-led-circles'

// Leadership dashboard layout module (ADR-270): the networks under this leader — the nexuses they
// mentor and the hubs they guide, each with its child count. Self-fetching RSC scoped to the caller
// via getCallerProfile (getLedHubs / getLedNexuses are guide_id = me / mentor_id = me). A plain
// host steward leads no network, so the block self-hides (returns null) when there are none.
export async function LeadNetworks(): Promise<React.ReactElement | null> {
  const me = await getCallerProfile()
  if (!me) return null

  const [hubs, nexuses] = await Promise.all([getLedHubs(me.id), getLedNexuses(me.id)])
  if (hubs.length === 0 && nexuses.length === 0) return null

  return (
    <section>
      <SectionHeader title="Your networks" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {nexuses.map((n) => (
          <EntityCard
            key={n.id}
            href={`/nexuses/${n.slug}`}
            title={n.name}
            context="Nexus"
            meta={
              <span className="inline-flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" aria-hidden />
                {n.hub_count} {n.hub_count === 1 ? 'hub' : 'hubs'}
              </span>
            }
          />
        ))}
        {hubs.map((h) => (
          <EntityCard
            key={h.id}
            href={`/hubs/${h.slug}`}
            title={h.name}
            context="Hub"
            meta={
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" aria-hidden />
                {h.circle_count} {h.circle_count === 1 ? 'circle' : 'circles'}
              </span>
            }
          />
        ))}
      </div>
    </section>
  )
}
