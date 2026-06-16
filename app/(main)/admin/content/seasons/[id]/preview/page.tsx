import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { Eye } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { Banner } from '@/components/admin/status'
import { createAdminClient } from '@/lib/supabase/admin'
import { SeasonMap } from '@/components/quest/season-map'
import { StateBadge } from '../../state-badge'
import { loadSeasonPreview } from '../preview-data'

// Preview as a member — the Season Composer's read-only mirror of /crew. It renders the
// SELECTED season's three Pillar Journeys through the real member-facing SeasonMap, at
// neutral zero progress (a fresh-start member's read), so an operator can see exactly how
// the season will land BEFORE it goes live. No edits, no member data. The heavy Journey
// read sits behind a per-section <Suspense> so the header never waits on it.

export const dynamic = 'force-dynamic'

export default async function SeasonPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireAdmin('host', { staff: 'community' })

  // A light header read (identity + status) — the map loads separately behind Suspense.
  const db = createAdminClient()
  const { data: seasonRow } = await db
    .from('seasons')
    .select('id, season_number, name, status')
    .eq('id', id)
    .maybeSingle()
  const season = seasonRow as {
    id: string
    season_number: number
    name: string
    status: string
  } | null
  if (!season) notFound()

  return (
    <AdminTemplate
      title={`Preview: ${season.name}`}
      eyebrow={`Season ${season.season_number}`}
      icon={Eye}
      description="See the season exactly as a member will, before it goes live. This is the Quest hub's Season Map for this season, at a fresh start (no progress). Read-only."
      width="default"
      back={{ href: `/admin/content/seasons/${season.id}`, label: 'Back to the Composer' }}
      actions={<StateBadge status={season.status} />}
    >
      <AdminSection
        title="Member view"
        description="The season's three Pillar Journeys (Mind, Body, Spirit), each capped by its Expression Challenge, as they read on a member's Quest hub."
      >
        <Banner tone="info" title="Preview only">
          This is a read-only preview at zero progress. A member sees their own standing here.
          Nothing on this page is editable.
        </Banner>
        <div className="mt-4">
          <Suspense fallback={<PreviewFallback />}>
            <SeasonPreviewMap id={id} />
          </Suspense>
        </div>
      </AdminSection>
    </AdminTemplate>
  )
}

function PreviewFallback() {
  return <div className="h-72 animate-pulse rounded-3xl border border-border bg-surface" aria-hidden />
}

async function SeasonPreviewMap({ id }: { id: string }) {
  const preview = await loadSeasonPreview(id)
  if (!preview) notFound()

  // The real member-facing SeasonMap, fed the preview's neutral standing. Achievements
  // link points at the live member surface (inert in preview — it's a read-only render).
  return (
    <SeasonMap
      seasonName={preview.seasonName}
      weeksLeft={preview.weeksLeft}
      rank={preview.rank}
      journeysFinished={preview.journeysFinished}
      pillars={preview.pillars}
    />
  )
}
