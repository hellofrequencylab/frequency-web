import Link from 'next/link'
import { Building2, Palette, Pencil } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import { Button } from '@/components/ui/button'
import { listSpaces } from '@/lib/spaces/store'
import type { Space, SpaceStatus } from '@/lib/spaces/types'

export const dynamic = 'force-dynamic'

// Per-Space branding admin (docs/SPACES.md, ADR-249/250). Janitor-gated. Lists every Space
// with its assigned theme (spaces.skin) and brand fields; each row links to the editor where
// the operator sets the theme + brand name / accent / logo. Best-effort read: if the spaces
// table or brand_* columns aren't migrated yet the list degrades to empty rather than erroring.

const STATUS_TONE: Record<SpaceStatus, StatusTone> = {
  active: 'success',
  suspended: 'warning',
  archived: 'neutral',
}

function SpaceRow({ s }: { s: Space }) {
  // Re-validate the stored accent before applying it to a style swatch (the renderer never
  // trusts a DB value it did not re-check; it is written validated by updateSpaceBranding).
  const accent =
    s.brandAccent && /^#[0-9a-fA-F]{3,8}$|^(?:rgb|hsl)a?\([0-9.,%/\s]+\)$/.test(s.brandAccent)
      ? s.brandAccent
      : null
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/spaces/${s.id}`}
            className="truncate text-base font-bold text-text hover:text-primary-strong"
          >
            {s.brandName || s.name}
          </Link>
          <StatusChip tone={STATUS_TONE[s.status]} size="sm">
            {s.status}
          </StatusChip>
          <span className="inline-flex items-center rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-semibold text-muted">
            {s.type}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
          <span>/{s.slug}</span>
          <span className="inline-flex items-center gap-1">
            <Palette className="h-3 w-3" aria-hidden /> Theme: {s.skin}
          </span>
          {accent && (
            <span className="inline-flex items-center gap-1">
              <span
                className="inline-block h-3 w-3 rounded-full border border-border"
                style={{ backgroundColor: accent }}
                aria-hidden
              />
              {accent}
            </span>
          )}
          {s.brandLogoUrl && <span className="truncate">Logo set</span>}
        </div>
      </div>
      <Button asChild variant="secondary" size="sm">
        <Link href={`/admin/spaces/${s.id}`}>
          <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit branding
        </Link>
      </Button>
    </div>
  )
}

export default async function SpacesBrandingPage() {
  await requireAdmin('janitor')
  const spaces = await listSpaces()

  const branded = spaces.filter((s) => s.brandName || s.brandLogoUrl || s.brandAccent).length

  return (
    <AdminTemplate
      title="Spaces"
      icon={Building2}
      eyebrow="Operations · Tenancy"
      description="Each Space is a white-label tenant of the one app. Assign its theme and set its brand name, accent, and logo. The theme drives the Space's look; the brand name and logo show in its header (wired in a follow-up)."
      width="wide"
    >
      {spaces.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No Spaces yet"
          description="Spaces are the white-label tenants of Frequency. Once a Space exists you can assign its theme and brand here."
        />
      ) : (
        <>
          <AdminSection>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard bordered label="Spaces" value={spaces.length} icon={Building2} />
              <StatCard
                bordered
                label="Active"
                value={spaces.filter((s) => s.status === 'active').length}
                icon={Building2}
              />
              <StatCard bordered label="Branded" value={branded} icon={Palette} />
            </div>
          </AdminSection>
          <AdminSection title="All Spaces" description="Open one to set its theme and brand.">
            <div className="space-y-3">
              {spaces.map((s) => (
                <SpaceRow key={s.id} s={s} />
              ))}
            </div>
          </AdminSection>
        </>
      )}
    </AdminTemplate>
  )
}
