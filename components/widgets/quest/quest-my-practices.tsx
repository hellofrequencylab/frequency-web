import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { getCrewContext } from '@/lib/quest/crew-context'
import { getMemberPractices } from '@/lib/practices'
import { getPillars, pillarsById } from '@/lib/pillars'
import { PillarBadge } from '@/components/practice/pillar-badge'
import { SectionHeader } from '@/components/ui/section-header'

// My Quest layout module (ADR-270/294): "My practices" — a compact glance at the practices the
// member has adopted or built, each linking to its detail page, with a path back to the full
// Practices surface to log or manage them. Self-fetching RSC keyed to the signed-in member via
// getCrewContext (request-cached); renders nothing for a logged-out viewer or one with no
// adopted practices yet.
export async function QuestMyPractices() {
  const ctx = await getCrewContext()
  if (!ctx) return null

  const [mine, pillars] = await Promise.all([getMemberPractices(ctx.profileId), getPillars()])
  if (mine.length === 0) return null
  const byId = pillarsById(pillars)

  return (
    <section>
      <SectionHeader title="My practices" count={mine.length} href="/practices" />
      <ul className="space-y-2">
        {mine.map((p) => {
          const pillar = p.domain_id ? byId.get(p.domain_id) : undefined
          return (
            <li key={p.id}>
              <Link
                href={`/practices/${p.slug ?? p.id}`}
                className="group flex items-center gap-3 rounded-2xl bg-surface-elevated/60 p-3 transition-colors hover:bg-surface-elevated motion-reduce:transition-none"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-tight text-text">{p.title}</p>
                  {(p.cadence || p.summary) && (
                    <p className="mt-0.5 truncate text-xs text-muted">{p.cadence ?? p.summary}</p>
                  )}
                </div>
                {pillar && <PillarBadge name={pillar.name} />}
                <ArrowRight className="h-4 w-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
