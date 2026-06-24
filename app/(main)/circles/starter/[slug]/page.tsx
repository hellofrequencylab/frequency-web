import { notFound } from 'next/navigation'
import { MapPin, Users, Repeat, MessagesSquare, Calendar, Handshake } from 'lucide-react'
import { DetailTemplate } from '@/components/templates/detail-template'
import { SectionHeader } from '@/components/ui/section-header'
import { StarterBadge } from '@/components/ui/starter-badge'
import { StarterClaim } from '@/components/circles/starter-claim'
import { getTemplateBySlug, templatesEnabled } from '@/lib/circles/templates-data'
import { PILLAR_SLUGS, type PillarSlug } from '@/lib/pillars'
import { pageContentMetadata } from '@/lib/page-content'

// The Starter Circle preview (decision: virtual, claim-able circles surfaced near
// the viewer). A Starter is NOT a row in `circles` — this page reads the staff
// blueprint (`circle_templates`) by slug and presents it like a circle anyone can
// claim. Claiming remixes it into a private draft the member owns (StarterClaim).
// Gated by the master flag, exactly like the gallery and the directory injection.
export const dynamic = 'force-dynamic'

const PILLAR_LABELS: Record<PillarSlug, string> = {
  mind: 'Mind',
  body: 'Body',
  spirit: 'Spirit',
  expression: 'Expression',
}

export function generateMetadata() {
  return pageContentMetadata('/circles', {
    title: 'Starter Circle',
    description: 'A staff-made circle blueprint you can claim and make your own.',
  })
}

export default async function StarterCirclePreview({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  if (!(await templatesEnabled())) notFound()
  const t = await getTemplateBySlug(slug)
  if (!t || !t.isActive) notFound()

  const lead = t.about || t.identity || t.oneLiner

  return (
    <DetailTemplate
      back={{ href: '/circles', label: 'Circles' }}
      title={t.name}
      badges={
        <span className="flex items-center gap-1.5">
          <StarterBadge />
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-medium text-muted">
            {PILLAR_LABELS[t.primaryPillar]}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-medium text-muted">
            <MapPin className="h-3 w-3" aria-hidden /> In person
          </span>
        </span>
      }
      subtitle={t.oneLiner}
    >
      <div className="mx-auto max-w-3xl">
        <StarterClaim templateId={t.id} />

        {lead && <p className="text-base leading-relaxed text-text">{lead}</p>}

        {t.audience && (
          <section className="mt-8">
            <SectionHeader title="Who it's for" />
            <p className="text-sm leading-relaxed text-muted">{t.audience}</p>
          </section>
        )}

        {/* What's inside — the one primary lean, carrying all four Pillars. */}
        {PILLAR_SLUGS.some((p) => t.pillarsInside[p]) && (
          <section className="mt-8">
            <SectionHeader title="What's inside" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {PILLAR_SLUGS.filter((p) => t.pillarsInside[p]).map((p) => {
                const primary = p === t.primaryPillar
                return (
                  <div
                    key={p}
                    className={`rounded-xl border p-4 ${
                      primary ? 'border-primary-bg bg-primary-bg/30' : 'border-border bg-surface'
                    }`}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-subtle">
                      {PILLAR_LABELS[p]}
                      {primary && <span className="ml-1.5 text-primary-strong">· leads</span>}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-text">{t.pillarsInside[p]}</p>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* The rhythm — two standing beats and a Thread. */}
        <section className="mt-8">
          <SectionHeader title="The rhythm" />
          <div className="space-y-3">
            {t.meetup.text && (
              <RhythmRow icon={<Repeat className="h-4 w-4" aria-hidden />} label="Circle Meetup">
                {t.meetup.text}
                {t.meetup.length ? <span className="text-subtle"> · {t.meetup.length}</span> : null}
              </RhythmRow>
            )}
            {t.gathering.text && (
              <RhythmRow icon={<Calendar className="h-4 w-4" aria-hidden />} label="Weekend Gathering">
                {t.gathering.text}
              </RhythmRow>
            )}
            {t.thread && (
              <RhythmRow icon={<MessagesSquare className="h-4 w-4" aria-hidden />} label="The Thread">
                {t.thread}
              </RhythmRow>
            )}
          </div>
        </section>

        {/* Agreements + size. */}
        {(t.agreements.length > 0 || t.sizeLabel) && (
          <section className="mt-8">
            <SectionHeader title="How we keep it good" />
            {t.sizeLabel && (
              <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-surface-elevated px-3 py-1 text-sm text-muted">
                <Users className="h-3.5 w-3.5" aria-hidden /> {t.sizeLabel}
              </p>
            )}
            {t.agreements.length > 0 && (
              <ul className="space-y-2">
                {t.agreements.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-muted">
                    <Handshake className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
                    {a}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </DetailTemplate>
  )
}

function RhythmRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-primary-strong">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-text">{label}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-muted">{children}</p>
      </div>
    </div>
  )
}
