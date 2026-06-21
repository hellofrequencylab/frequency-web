import Link from 'next/link'
import { Building2, Palette, Pencil, Eye, Settings, Network } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import { Button } from '@/components/ui/button'
import { ViewAsSpaceButton } from '@/components/spaces/view-as-space-button'
import { listSpaces } from '@/lib/spaces/store'
import { createAdminClient } from '@/lib/supabase/admin'
import { TOKEN_ALLOWLIST } from '@/lib/theme/validate'
import type { Space, SpaceStatus } from '@/lib/spaces/types'

export const dynamic = 'force-dynamic'

// Per-Space tenancy admin (docs/SPACES.md, ADR-249/250; ENTITY-SPACES-BUILD). Janitor-gated. Lists
// every Space with its assigned theme (spaces.skin) and brand fields; each row links to the branding
// editor AND, for tenant Spaces, straight to the live profile (/spaces/<slug>) and the owner settings
// surface (/spaces/<slug>/settings) the entity-spaces system shipped. Each tenant row also carries a
// "View as <space>" affordance: it starts a preview of THAT specific Space and routes into its owner
// experience, which renders read-only for a janitor, so an operator sees exactly what that Space
// sees (the previewAsSpace action is the gate). Best-effort read: if the spaces table or its columns
// aren't migrated yet the list degrades to empty rather than erroring.

const STATUS_TONE: Record<SpaceStatus, StatusTone> = {
  active: 'success',
  suspended: 'warning',
  archived: 'neutral',
}

// The entity-spaces columns (visibility, tagline) are NOT on the typed Space yet (ADR-246), so the
// list projects them through a small untyped admin query — the same pattern lib/spaces/membership.ts
// uses — rather than widening the shared types.ts/store.ts. Keyed by space id for the row to read.
type SpaceAdminMeta = { visibility: 'network' | 'private'; tagline: string | null }

async function listSpaceAdminMeta(): Promise<Map<string, SpaceAdminMeta>> {
  const out = new Map<string, SpaceAdminMeta>()
  try {
    const db = createAdminClient() as unknown as {
      from: (table: string) => {
        select: (cols: string) => Promise<{
          data: { id: string; visibility?: string | null; tagline?: string | null }[] | null
        }>
      }
    }
    const { data } = await db.from('spaces').select('id, visibility, tagline')
    for (const r of data ?? []) {
      out.set(r.id, {
        visibility: r.visibility === 'private' ? 'private' : 'network',
        tagline: typeof r.tagline === 'string' && r.tagline.trim() ? r.tagline.trim() : null,
      })
    }
  } catch {
    // Pre-migration (no visibility/tagline columns): degrade to no metadata, rows still render.
  }
  return out
}

/** The stored accent rendered as a swatch + label. The owner settings surface writes a DAWN TOKEN
 *  NAME (lib/spaces/profile-settings.ts → TOKEN_ALLOWLIST); the legacy admin branding action writes a
 *  hex/rgb/hsl color. Re-validate the DB value before it touches a style (never trust a stored value
 *  it did not re-check): an allowlisted token renders via `var(<token>)`; else a hex/rgb/hsl renders
 *  directly; else nothing. */
function accentSwatch(brandAccent: string | null): { background: string; label: string } | null {
  if (!brandAccent) return null
  if (TOKEN_ALLOWLIST.has(brandAccent)) {
    return { background: `var(${brandAccent})`, label: brandAccent }
  }
  if (/^#[0-9a-fA-F]{3,8}$|^(?:rgb|hsl)a?\([0-9.,%/\s]+\)$/.test(brandAccent)) {
    return { background: brandAccent, label: brandAccent }
  }
  return null
}

function SpaceRow({ s, meta }: { s: Space; meta?: SpaceAdminMeta }) {
  const accent = accentSwatch(s.brandAccent)
  // The root Space serves the app itself; it has no public /spaces/<slug> profile or owner settings.
  const hasProfile = s.type !== 'root'
  const brandName = s.brandName || s.name
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/spaces/${s.id}`}
            className="truncate text-base font-bold text-text hover:text-primary-strong"
          >
            {brandName}
          </Link>
          <StatusChip tone={STATUS_TONE[s.status]} size="sm">
            {s.status}
          </StatusChip>
          <span className="inline-flex items-center rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-semibold text-muted">
            {s.type}
          </span>
          {meta && (
            <StatusChip tone={meta.visibility === 'private' ? 'neutral' : 'info'} size="sm">
              {meta.visibility === 'private' ? 'Private' : 'Networked'}
            </StatusChip>
          )}
        </div>
        {meta?.tagline && <p className="mt-1 truncate text-sm text-muted">{meta.tagline}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
          <span>/{s.slug}</span>
          <span className="inline-flex items-center gap-1">
            <Palette className="h-3 w-3" aria-hidden /> Theme: {s.skin}
          </span>
          {accent && (
            <span className="inline-flex items-center gap-1">
              <span
                className="inline-block h-3 w-3 rounded-full border border-border"
                style={{ background: accent.background }}
                aria-hidden
              />
              {accent.label}
            </span>
          )}
          {s.brandLogoUrl && <span className="truncate">Logo set</span>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <Button asChild variant="secondary" size="sm">
          <Link href={`/admin/spaces/${s.id}`}>
            <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit branding
          </Link>
        </Button>
        {hasProfile && (
          <>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/spaces/${s.slug}`}>
                <Eye className="h-3.5 w-3.5" aria-hidden /> View profile
              </Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/spaces/${s.slug}/settings`}>
                <Settings className="h-3.5 w-3.5" aria-hidden /> Edit profile
              </Link>
            </Button>
            {/* Preview THIS Space's owner experience as platform staff. The action gates on the
                Executive Admin axis and routes into the Space's owner settings, which render
                read-only for a janitor, so you see exactly what that Space sees. */}
            <ViewAsSpaceButton spaceId={s.id} spaceName={brandName} />
          </>
        )}
      </div>
    </div>
  )
}

export default async function SpacesBrandingPage() {
  await requireAdmin('janitor')
  const [spaces, meta] = await Promise.all([listSpaces(), listSpaceAdminMeta()])

  const branded = spaces.filter((s) => s.brandName || s.brandLogoUrl || s.brandAccent).length
  const networked = spaces.filter((s) => meta.get(s.id)?.visibility !== 'private').length

  return (
    <AdminTemplate
      title="Spaces"
      icon={Building2}
      eyebrow="Operations · Tenancy"
      description="Each Space is a white-label tenant of the one app. Set its theme and brand here, then jump to its live profile or open the owner settings the Space runs on."
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
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard bordered label="Spaces" value={spaces.length} icon={Building2} />
              <StatCard
                bordered
                label="Active"
                value={spaces.filter((s) => s.status === 'active').length}
                icon={Building2}
              />
              <StatCard bordered label="Networked" value={networked} icon={Network} />
              <StatCard bordered label="Branded" value={branded} icon={Palette} />
            </div>
          </AdminSection>
          <AdminSection
            title="All Spaces"
            description="Set a Space's theme and brand, view its live profile, or open the owner settings."
          >
            <div className="space-y-3">
              {spaces.map((s) => (
                <SpaceRow key={s.id} s={s} meta={meta.get(s.id)} />
              ))}
            </div>
          </AdminSection>
        </>
      )}
    </AdminTemplate>
  )
}
