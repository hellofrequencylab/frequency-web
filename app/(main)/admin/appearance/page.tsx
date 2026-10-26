import Link from 'next/link'
import { Palette, Plus, Star } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { GateNotice } from '@/components/ui/gate-notice'
import { SITE_DESIGN, designDef } from '@/lib/theme/design'
import { buttonClasses } from '@/components/ui/button'
import { listThemes } from '@/lib/theme/server/admin-themes'
import type { ThemeRow, ThemeStatus } from '@/lib/theme/admin-types'
import { communityDefaultGeneration } from '@/lib/theme/server/default-generation'
import { ThemeRowActions } from './row-actions'
import { DefaultGenerationPicker } from './default-generation'

export const dynamic = 'force-dynamic'

// Theme Studio — the janitor-only home for data-driven themes (skins + seasonal occasions).
// Each row is a named set of token overrides an operator edits as data (no code deploy).
// A theme takes effect once its status is Active (and, for the default skin, set as Default).
// Reads are best-effort: if the `themes` table isn't migrated yet, listThemes() returns [] and
// the teaching empty state shows. The actual styling is applied by the root layout once a
// theme is active; the editor + preview let an operator design before any of that is live.
//
// WHAT THE ROWS DRIVE (SCAN-915). The rows are the retired skin and occasion axes, kept as data. The platform
// wears the Frequency design (a build-time constant, not a row), so the page leads with it and labels the rows
// as saved only: an Active or Default row never reaches the site. Space websites never read this table
// (they wear their own website theme, components/sites/site-design-reset.tsx).

const STATUS_BADGE: Record<ThemeStatus, string> = {
  draft: 'bg-surface-elevated text-subtle',
  active: 'bg-success-bg text-success',
  archived: 'bg-surface-elevated text-muted line-through',
}

/** The design this deploy wears (SITE_DESIGN, build time). */
const DESIGN_LABEL = designDef(SITE_DESIGN).label

const STATUS_LABEL: Record<ThemeStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  archived: 'Archived',
}

// The design overrides everything, so an Active row is on only for DAWN, is not shown in the live green and says so.
const ACTIVE_UNDER_DAWN_BADGE = 'bg-surface-elevated text-muted'
const ACTIVE_UNDER_DAWN_LABEL = 'Active under DAWN'
const DEFAULT_UNDER_DAWN_LABEL = 'DAWN default'

function statusBadge(status: ThemeStatus): { cls: string; label: string } {
  if (status === 'active') return { cls: ACTIVE_UNDER_DAWN_BADGE, label: ACTIVE_UNDER_DAWN_LABEL }
  return { cls: STATUS_BADGE[status], label: STATUS_LABEL[status] }
}

/** The design the platform wears, from SITE_DESIGN (build time). Read-only: it is code, not a themes row. */
function ActiveDesignCard() {
  const label = DESIGN_LABEL
  return (
    <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4 lift-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-body font-bold text-text">Active design: {label}</span>
        <span className="inline-flex items-center rounded-pill bg-success-bg px-2 py-0.5 text-meta font-semibold text-success">
          Live
        </span>
        <span className="inline-flex items-center rounded-pill bg-surface-elevated px-2 py-0.5 text-meta font-semibold text-subtle">
          Built in, read-only
        </span>
      </div>
      <p className="text-body-sm text-muted">
        The member app, this console and the public pages all wear the {label} design. It is set in the code at
        build time (NEXT_PUBLIC_SITE_DESIGN), not saved here, so there is nothing to activate or edit on this
        page. {label} sets every colour, corner, font, size and motion itself.
      </p>
      <p className="text-body-sm text-muted">
        The skins, occasions and community feel below are from the retired DAWN design. They stay saved as data
        and do not apply. Space websites wear their own website theme either way.
      </p>
    </div>
  )
}

function NewThemeLink({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <Link href="/admin/appearance/new" className={buttonClasses('primary', size)}>
      <Plus className="h-4 w-4" aria-hidden /> New theme
    </Link>
  )
}

function ThemeRowCard({ t }: { t: ThemeRow }) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 lift-1 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/appearance/${t.id}`}
            className="block truncate text-body font-bold text-text hover:text-primary-strong"
          >
            {t.name || 'Untitled theme'}
          </Link>
          {/* Kind badge */}
          <span className="inline-flex items-center rounded-pill bg-broadcast-bg px-2 py-0.5 text-meta font-semibold capitalize text-broadcast-strong">
            {t.kind}
          </span>
          {/* Status badge */}
          <span
            className={`inline-flex items-center rounded-pill px-2 py-0.5 text-meta font-semibold ${statusBadge(t.status).cls}`}
          >
            {statusBadge(t.status).label}
          </span>
          {/* Default badge */}
          {t.isDefault && (
            <span className="inline-flex items-center gap-1 rounded-pill bg-primary-bg px-2 py-0.5 text-meta font-semibold text-primary-strong">
              <Star className="h-3 w-3" aria-hidden /> {DEFAULT_UNDER_DAWN_LABEL}
            </span>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-subtle">
          <span>
            slug <code className="rounded bg-surface-elevated px-1 py-0.5 text-text">{t.slug}</code>
          </span>
          {t.kind === 'occasion' && (t.windowStart || t.windowEnd) && (
            <span>
              Window {t.windowStart ?? '—'} to {t.windowEnd ?? '—'}
            </span>
          )}
        </div>
      </div>
      <ThemeRowActions id={t.id} status={t.status} kind={t.kind} isDefault={t.isDefault} />
    </div>
  )
}

export default async function ThemeStudioPage() {
  await requireAdmin('janitor')
  const [themes, defaultGeneration] = await Promise.all([listThemes(), communityDefaultGeneration()])

  const skins = themes.filter((t) => t.kind === 'skin')
  const occasions = themes.filter((t) => t.kind === 'occasion')

  return (
    <AdminTemplate
      title="Theme Studio"
      icon={Palette}
      eyebrow="Operations · Appearance"
      description={`The design the platform wears, and the skins and occasions saved as data. Under ${DESIGN_LABEL} those rows are kept but do not apply.`}
      width="wide"
      actions={<NewThemeLink />}
    >
      {/* Under a design that overrides everything (Frequency, ADR-1737) nothing here reaches the site, so
          the page leads with the design the site does wear (SCAN-915), before any row that will not show. */}
      <AdminSection title="Active design" description="What the whole platform wears right now.">
        <ActiveDesignCard />
      </AdminSection>

      {/* How a theme goes live — the operator's first question. */}
      <AdminSection>
        <GateNotice kind="dormant" title={`Paused while the ${DESIGN_LABEL} design is on`}>
          Everything below is saved data from the retired DAWN design. You can still design and preview here.
        </GateNotice>
      </AdminSection>

      {/* The community default generation (LIVE-658): the feel axis as editable data. Frequency's feel
          is its own, so this saved value does not apply. */}
      <AdminSection
        title="Community feel"
        description="Saved from the retired DAWN design: type size, spacing and motion. Not applied."
      >
        <DefaultGenerationPicker current={defaultGeneration} />
      </AdminSection>

      {themes.length === 0 ? (
        <EmptyState
          icon={Palette}
          title="No themes yet"
          description="A theme is a named set of token overrides: a palette and feel for a skin, or a seasonal overlay for an occasion. Design one here, preview it live, then activate it when it's ready."
          action={<NewThemeLink />}
        />
      ) : (
        <>
          {skins.length > 0 && (
            <AdminSection
              title="DAWN skins"
              description="Used by the DAWN design: base palettes for the member app and a Space. None applies under Frequency."
            >
              <div className="space-y-3">
                {skins.map((t) => (
                  <ThemeRowCard key={t.id} t={t} />
                ))}
              </div>
            </AdminSection>
          )}
          {occasions.length > 0 && (
            <AdminSection
              title="DAWN occasions"
              description="Used by the DAWN design: seasonal overlays within a calendar window. None applies under Frequency."
            >
              <div className="space-y-3">
                {occasions.map((t) => (
                  <ThemeRowCard key={t.id} t={t} />
                ))}
              </div>
            </AdminSection>
          )}
        </>
      )}
    </AdminTemplate>
  )
}
