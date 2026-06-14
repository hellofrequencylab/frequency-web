import Link from 'next/link'
import { Palette, Plus, Star } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonClasses } from '@/components/ui/button'
import { listThemes } from '@/lib/theme/server/admin-themes'
import type { ThemeRow, ThemeStatus } from '@/lib/theme/admin-types'
import { ThemeRowActions } from './row-actions'

export const dynamic = 'force-dynamic'

// Theme Studio — the janitor-only home for data-driven themes (skins + seasonal occasions).
// Each row is a named set of DAWN token overrides an operator edits as data (no code deploy).
// A theme takes effect once its status is Active (and, for the default skin, set as Default).
// Reads are best-effort: if the `themes` table isn't migrated yet, listThemes() returns [] and
// the teaching empty state shows. The actual styling is applied by the root layout once a
// theme is active; the editor + preview let an operator design before any of that is live.

const STATUS_BADGE: Record<ThemeStatus, string> = {
  draft: 'bg-surface-elevated text-subtle',
  active: 'bg-success-bg text-success',
  archived: 'bg-surface-elevated text-muted line-through',
}

const STATUS_LABEL: Record<ThemeStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  archived: 'Archived',
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
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/appearance/${t.id}`}
            className="truncate text-base font-bold text-text hover:text-primary-strong"
          >
            {t.name || 'Untitled theme'}
          </Link>
          {/* Kind badge */}
          <span className="inline-flex items-center rounded-full bg-broadcast-bg px-2 py-0.5 text-xs font-semibold capitalize text-broadcast-strong">
            {t.kind}
          </span>
          {/* Status badge */}
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[t.status]}`}
          >
            {STATUS_LABEL[t.status]}
          </span>
          {/* Default badge */}
          {t.isDefault && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary-bg px-2 py-0.5 text-xs font-semibold text-primary-strong">
              <Star className="h-3 w-3" aria-hidden /> Default
            </span>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
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
  const themes = await listThemes()

  const skins = themes.filter((t) => t.kind === 'skin')
  const occasions = themes.filter((t) => t.kind === 'occasion')

  return (
    <AdminTemplate
      title="Theme Studio"
      icon={Palette}
      eyebrow="Operations · Appearance"
      description="Named sets of token overrides you edit as data, no code deploy. A skin retunes the whole palette and feel; an occasion overlays a seasonal look within a calendar window."
      width="wide"
      actions={<NewThemeLink />}
    >
      {/* How a theme goes live — the operator's first question. */}
      <AdminSection>
        <div className="rounded-2xl border border-border bg-surface-elevated/50 px-4 py-3 text-sm text-muted">
          A theme takes effect once its status is <strong className="text-text">Active</strong>, and
          for the base skin once you also <strong className="text-text">Set default</strong>. One
          one-time step: the database migration must be applied for the theme system to be live.
          Until then you can still design and preview themes here.
        </div>
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
            <AdminSection title="Skins" description="Base palettes and feel for a Space.">
              <div className="space-y-3">
                {skins.map((t) => (
                  <ThemeRowCard key={t.id} t={t} />
                ))}
              </div>
            </AdminSection>
          )}
          {occasions.length > 0 && (
            <AdminSection
              title="Occasions"
              description="Seasonal overlays that apply within a calendar window."
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
