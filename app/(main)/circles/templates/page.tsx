import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PenLine } from 'lucide-react'
import { IndexTemplate } from '@/components/templates'
import { SectionHeader } from '@/components/ui/section-header'
import { EntityCard } from '@/components/cards/entity-card'
import { EmptyState } from '@/components/ui/empty-state'
import { getCallerProfile } from '@/lib/auth'
import { PILLAR_SLUGS, type PillarSlug } from '@/lib/pillars'
import { getActiveTemplates, templatesEnabled } from '@/lib/circles/templates-data'
import { RemixButton } from '@/components/circles/builder/remix-button'

// The Starter Circles gallery (Stage 4, decision #8). Any signed-in member browses
// the staff-authored blueprints, grouped by primary Pillar; each card shows the
// name, the Card (the hook), and the Pillar, with a "Remix" button that creates a
// private draft and opens the builder. A global flag gates the whole surface; when
// it is off, a calm EmptyState stands in. "Start from scratch" links to /circles/new.
export const dynamic = 'force-dynamic'

const PILLAR_LABELS: Record<PillarSlug, string> = {
  mind: 'Mind',
  body: 'Body',
  spirit: 'Spirit',
  expression: 'Expression',
}

export default async function StarterCirclesPage() {
  const caller = await getCallerProfile()
  if (!caller) redirect('/circles')

  const enabled = await templatesEnabled()
  if (!enabled) {
    return (
      <IndexTemplate
        eyebrow="Circles"
        title="Starter Circles"
        description="Staff-made blueprints you can remix into a Circle of your own."
        adminBar={false}
      >
        <EmptyState
          variant="first-use"
          title="Starter Circles are not open yet"
          description="We are putting the finishing touches on the blueprints. Check back soon, or start a Circle from scratch."
          action={
            <Link
              href="/circles/new"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
            >
              <PenLine className="h-4 w-4" aria-hidden /> Start from scratch
            </Link>
          }
        />
      </IndexTemplate>
    )
  }

  const templates = await getActiveTemplates()

  return (
    <IndexTemplate
      eyebrow="Circles"
      title="Starter Circles"
      description="Staff-made blueprints, three per Pillar. Remix one to make it yours, or start from scratch."
      action={
        <Link
          href="/circles/new"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
        >
          <PenLine className="h-4 w-4" aria-hidden /> Start from scratch
        </Link>
      }
      adminBar={false}
    >
      {templates.length === 0 ? (
        <EmptyState
          variant="first-use"
          title="No Starter Circles yet"
          description="There is nothing to remix here just now. You can still start a Circle from scratch."
          action={
            <Link
              href="/circles/new"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
            >
              <PenLine className="h-4 w-4" aria-hidden /> Start from scratch
            </Link>
          }
        />
      ) : (
        <div className="space-y-8">
          {PILLAR_SLUGS.map((pillar) => {
            const inPillar = templates.filter((t) => t.primaryPillar === pillar)
            if (inPillar.length === 0) return null
            return (
              <section key={pillar}>
                <SectionHeader title={PILLAR_LABELS[pillar]} count={inPillar.length} />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {inPillar.map((t) => (
                    <EntityCard
                      key={t.id}
                      href={`/circles/templates#${t.slug}`}
                      title={t.name}
                      context={PILLAR_LABELS[t.primaryPillar]}
                      description={t.card || t.oneLiner}
                      footer={<RemixButton templateId={t.id} />}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </IndexTemplate>
  )
}
