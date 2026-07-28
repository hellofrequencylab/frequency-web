import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCircleCapabilities } from '@/lib/core/load-capabilities'
import { resolveEntityConsole } from '@/lib/admin/entity-console'
import { DashboardTemplate } from '@/components/templates'
import { SectionHeader } from '@/components/ui/section-header'
import { Skeleton } from '@/components/ui/skeleton'
import { StatCard } from '@/components/ui/stat-card'
import { EntityManageConsole } from '@/components/admin/modules/entity-manage-console'
import { PlacementApprovals } from '@/components/events/placement-approvals'
import { CIRCLE_HUB_SECTIONS, asCircleHubSection, type CircleHubSection } from './hub'
import { CircleMemberViewer } from './circle-member-viewer'
import { CircleEventsSection } from './events-section'

// The circle OWNER CONSOLE as a MANAGE HUB (ADR-441 EM1-2; restructured per ADR-828 so events,
// Spaces, and circles feel like ONE system). The unified `/{entity}/[id]/manage` surface, now
// category-navigated like the Space /manage console and the event Manage hub: a pill sub-menu
// with `?section=` over two areas — Home (a compact stat strip + the message center: the shared
// LeaderCrmViewer over the circle's roster, messaging up front per the owner directive) and
// Settings (the full in-place editor set: the SAME module catalog the standardized rail shows,
// rendered by the shared EntityManageConsole — resolveEntityConsole → appsForScope, so the
// console and the rail can never drift; entity-console.test.ts locks it). The standalone
// Message Circle page (/circles/[slug]/crm) folded in and now redirects here.
//
// SECURITY: a Server Component, gated server-side on the resolved module set via the one
// capability resolver (getCircleCapabilities → resolveCapabilities). A viewer who cannot manage
// this circle gets notFound() — no admin client read is exposed to them, and every surface's
// mutation re-checks its capability in its server action (the admin client bypasses RLS, so
// these gates — not RLS — are the authority). The message center renders only for a viewer
// with circle.moderate (the same gate the CRM loaders + DM action re-check per request).

export const metadata: Metadata = {
  title: 'Manage circle',
  description: 'Manage your circle in one place: your people, the message center, and every setting.',
}

/** The pill sub-menu (the shared Space HubNav pattern, same classes). */
function CircleHubNav({ slug, section }: { slug: string; section: CircleHubSection }) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Manage areas">
      {CIRCLE_HUB_SECTIONS.map((s) => {
        const on = s.key === section
        return (
          <Link
            key={s.key}
            href={`/circles/${slug}/manage?section=${s.key}`}
            scroll={false}
            aria-current={on ? 'page' : undefined}
            className={
              'rounded-full px-3 py-1.5 text-sm font-medium transition-colors ' +
              (on
                ? 'bg-primary text-on-primary'
                : 'border border-border text-muted hover:bg-surface-elevated hover:text-text')
            }
          >
            {s.label}
          </Link>
        )
      })}
    </nav>
  )
}

export default async function CircleManagePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ section?: string; saved?: string; error?: string }>
}) {
  const { slug } = await params
  const { section: rawSection, saved, error } = await searchParams
  const admin = createAdminClient()

  // Resolve the circle by slug (same loader shape as the detail page; archived circles
  // are not manageable here).
  const { data: circle } = await admin
    .from('circles')
    .select('id, name, slug, member_count, member_cap, status')
    .eq('slug', slug)
    .neq('status', 'archived')
    .maybeSingle()
  if (!circle) notFound()

  // GATE: resolve what the viewer can do on THIS circle. No manage module ⇒ the console
  // does not exist for them (notFound, not a redirect — we never reveal the route). The
  // gate resolves the SAME module set the Settings tab renders (resolveEntityConsole), so
  // "reaches the console" and "sees at least one module" can never disagree.
  const caps = await getCircleCapabilities(circle.id)
  const modules = resolveEntityConsole({ kind: 'circle', id: circle.slug }, { caps })
  if (modules.length === 0) notFound()

  const section = asCircleHubSection(rawSection)
  const blurb = CIRCLE_HUB_SECTIONS.find((s) => s.key === section)?.blurb

  const cap = circle.member_cap || 0
  const pct = cap > 0 ? Math.min(100, Math.round((circle.member_count / cap) * 100)) : 0
  const statusLabel = circle.status.charAt(0).toUpperCase() + circle.status.slice(1)

  return (
    <DashboardTemplate
      eyebrow="Manage circle"
      title={circle.name}
      description="Your circle in one place: your people, the message center, and every setting."
      back={{ href: `/circles/${circle.slug}`, label: 'Back to circle' }}
      width="default"
    >
      <div className="space-y-5">
        <CircleHubNav slug={circle.slug} section={section} />
        {blurb && section !== 'home' && <p className="max-w-2xl text-sm text-muted">{blurb}</p>}
      </div>

      {section === 'home' && (
        <>
          {/* The at-a-glance strip: compact xs tiles, the same treatment as the event hub's
              Home strip (owner directive: smaller stat boxes, one standard). */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            <StatCard bordered size="xs" label="Members" value={`${circle.member_count} of ${cap}`} />
            <StatCard bordered size="xs" label="Capacity" value={`${pct}%`} />
            <StatCard bordered size="xs" label="Status" value={statusLabel} />
          </div>
          {caps.has('circle.moderate') && (
            <section>
              <SectionHeader title="Message center" />
              <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
                <CircleMemberViewer circleId={circle.id} slug={circle.slug} />
              </Suspense>
            </section>
          )}
          {/* Pending "where does this event live" requests the circle host can approve. The
              approve / decline actions re-check circle.editSettings server-side. */}
          <Suspense fallback={null}>
            <PlacementApprovals target={{ type: 'circle', id: circle.id }} />
          </Suspense>
        </>
      )}

      {section === 'events' && (
        <section>
          {/* The Events area (the Channel hub's sections idiom, ADR-870): what the circle is
              gathering for next, plus the owner-asked "add an already created event" door. The
              add action re-checks circle.editSettings AND event.editSettings (ADR-274/883). */}
          <SectionHeader title="Events" />
          <Suspense fallback={<Skeleton className="h-40 rounded-2xl" />}>
            <CircleEventsSection
              circleId={circle.id}
              slug={circle.slug}
              notice={{ saved: saved === '1', error }}
            />
          </Suspense>
        </section>
      )}

      {section === 'settings' && <EntityManageConsole caps={[...caps]} />}
    </DashboardTemplate>
  )
}
