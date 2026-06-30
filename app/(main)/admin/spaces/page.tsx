import { Suspense } from 'react'
import Link from 'next/link'
import {
  Building2,
  Palette,
  Pencil,
  Eye,
  Settings,
  SlidersHorizontal,
  HeartPulse,
  Users,
} from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import { Button } from '@/components/ui/button'
import { ViewAsSpaceButton } from '@/components/spaces/view-as-space-button'
import { listSpaces } from '@/lib/spaces/store'
import { resolveMode } from '@/lib/spaces/modes'
import { SPACE_PLAN_LABEL, asSpacePlan } from '@/lib/pricing/plans'
import {
  HEALTH_BUCKETS,
  HEALTH_BUCKET_LABEL,
  HEALTH_BUCKET_TONE,
  type HealthBucket,
} from '@/lib/spaces/health'
import { gatherSpacesHealth, type SpaceWithHealth } from '@/lib/spaces/health-signals'
import { spaceManageHref, type Space, type SpaceStatus } from '@/lib/spaces/types'

export const dynamic = 'force-dynamic'

// Per-Space tenancy admin, now a HEALTH dashboard (docs/SPACES.md, ADR-249/250; ENTITY-SPACES-BUILD).
// Janitor-gated. Every Space is sorted into a health bucket (lib/spaces/health.ts) from cheaply-read
// signals (status + a batched member count + recency, gathered without an N+1 in
// lib/spaces/health-signals.ts) and the list is GROUPED by bucket, most urgent first. Each row keeps
// every tenancy affordance the branding list shipped: the branding editor (/admin/spaces/<id>), the
// live profile (/spaces/<slug>) and owner settings for tenant Spaces, and the "View as <space>"
// preview. The header + summary render immediately; the grouped list streams behind <Suspense> so a
// slow signal gather never blocks the shell (PAGE-FRAMEWORK §5). Best-effort: a missing signal source
// degrades to "unknown" rather than erroring the page.

const STATUS_TONE: Record<SpaceStatus, StatusTone> = {
  active: 'success',
  suspended: 'warning',
  archived: 'neutral',
}

/** The Mode/type TAG for a row: the resolved operator Mode label (resolveMode), falling back to the
 *  raw spaces.type when a type has no registered Mode (root / unknown). Framing only, never a gate. */
function modeTag(s: Space): string {
  return resolveMode(s.type, s.modeVariant)?.modeLabel ?? s.type
}

function SpaceRow({ entry }: { entry: SpaceWithHealth }) {
  const { space: s, signals, health } = entry
  // The root Space serves the app itself; it has no public /spaces/<slug> profile or owner settings.
  const hasProfile = s.type !== 'root'
  const brandName = s.brandName || s.name
  const planLabel = SPACE_PLAN_LABEL[asSpacePlan(s.plan)]
  const active = signals.activeMembers
  const total = signals.totalMembers
  const memberCount =
    typeof active === 'number'
      ? typeof total === 'number' && total > active
        ? `${active} active of ${total}`
        : `${active} active`
      : 'Members unknown'

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
          <span className="inline-flex items-center rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-semibold text-muted">
            {modeTag(s)}
          </span>
          <StatusChip tone={STATUS_TONE[s.status]} size="sm">
            {s.status}
          </StatusChip>
          <span className="inline-flex items-center rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-semibold text-muted">
            {planLabel}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
          <span>/{s.slug}</span>
          <span className="inline-flex items-center gap-1">
            <Users className="h-3 w-3" aria-hidden /> {memberCount}
          </span>
          <span className="inline-flex items-center gap-1">
            <Palette className="h-3 w-3" aria-hidden /> Theme: {s.skin}
          </span>
        </div>
        {health.reasons.length > 0 && (
          <p className="mt-2 text-sm text-muted">{health.reasons.join(' ')}</p>
        )}
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
              <Link href={spaceManageHref(s.type, s.slug)}>
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

/** One health section: the bucket title + count, then its Spaces. Rendered only when non-empty. */
function HealthSection({ bucket, entries }: { bucket: HealthBucket; entries: SpaceWithHealth[] }) {
  if (entries.length === 0) return null
  return (
    <AdminSection
      title={`${HEALTH_BUCKET_LABEL[bucket]} (${entries.length})`}
      actions={
        <StatusChip tone={HEALTH_BUCKET_TONE[bucket]} size="sm">
          {entries.length}
        </StatusChip>
      }
    >
      <div className="space-y-3">
        {entries.map((entry) => (
          <SpaceRow key={entry.space.id} entry={entry} />
        ))}
      </div>
    </AdminSection>
  )
}

/** The async body: the batched signal gather + the grouped, by-health list. Streamed behind a
 *  <Suspense> boundary so the header + the empty-state check render immediately. */
async function SpacesHealthBody({ spaces }: { spaces: Space[] }) {
  const graded = await gatherSpacesHealth(spaces)

  // Group by bucket, then render the sections most-urgent first (HEALTH_BUCKETS order).
  const byBucket = new Map<HealthBucket, SpaceWithHealth[]>()
  for (const bucket of HEALTH_BUCKETS) byBucket.set(bucket, [])
  for (const entry of graded) byBucket.get(entry.health.bucket)!.push(entry)

  const counts = Object.fromEntries(
    HEALTH_BUCKETS.map((b) => [b, byBucket.get(b)!.length]),
  ) as Record<HealthBucket, number>

  return (
    <>
      <AdminSection>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard bordered label="Spaces" value={spaces.length} icon={Building2} />
          <StatCard
            bordered
            label="Healthy"
            value={counts.healthy}
            icon={HeartPulse}
            detail={counts.healthy === spaces.length ? 'All clear' : undefined}
          />
          <StatCard
            bordered
            label="Needs attention"
            value={counts.needs_attention}
            icon={HeartPulse}
          />
          <StatCard bordered label="At risk" value={counts.at_risk} icon={HeartPulse} />
          <StatCard bordered label="Dormant" value={counts.dormant} icon={HeartPulse} />
        </div>
      </AdminSection>
      {HEALTH_BUCKETS.map((bucket) => (
        <HealthSection key={bucket} bucket={bucket} entries={byBucket.get(bucket)!} />
      ))}
    </>
  )
}

/** The streaming fallback: the header has already painted; show a calm placeholder for the list. */
function SpacesHealthSkeleton() {
  return (
    <AdminSection>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-surface-elevated/60" />
        ))}
      </div>
      <div className="mt-6 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-elevated/60" />
        ))}
      </div>
    </AdminSection>
  )
}

export default async function SpacesHealthPage() {
  await requireAdmin('janitor')
  const spaces = await listSpaces()

  return (
    <AdminTemplate
      title="Spaces"
      icon={Building2}
      eyebrow="Operations · Tenancy"
      description="Every Space, sorted by how it is doing. Start at the top: the Spaces that need a look come first. Each row still opens its branding, live profile, and owner settings."
      width="wide"
      actions={
        // The per-TYPE function-defaults editor (per-space-roles Phase 2): what every NEW space of a
        // type starts with. A per-space override on a Space's own row still beats these seeds.
        <Button asChild variant="secondary" size="sm">
          <Link href="/admin/spaces/defaults">
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden /> Space defaults
          </Link>
        </Button>
      }
    >
      {spaces.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No Spaces yet"
          description="Spaces are the white-label tenants of Frequency. Once a Space exists it shows up here, sorted by how it is doing."
        />
      ) : (
        <Suspense fallback={<SpacesHealthSkeleton />}>
          <SpacesHealthBody spaces={spaces} />
        </Suspense>
      )}
    </AdminTemplate>
  )
}
