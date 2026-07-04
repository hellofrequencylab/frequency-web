import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { ScanLine, Users, Nfc } from 'lucide-react'
import { FocusTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { listSpaceCodes, listSpaceScanRows, codeCapForPlan } from '@/lib/qr/space-codes'
import { summarizeScans } from '@/lib/qr/analytics'
import { QrSplashForm } from '@/components/spaces/qr-splash-form'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { FeatureLockedNotice } from '@/components/spaces/feature-locked-notice'
import { SectionHeader } from '@/components/ui/section-header'
import { StatCard } from '@/components/ui/stat-card'

// OWNER QR STUDIO per space (ENTITY-SPACES-BUILD §C, Phase 2). A centered, no-rail Focus surface
// (registered 'none' for /spaces/<slug>/settings/qr in page-chrome.ts, alongside the other settings
// sub-surfaces). It resolves the Space, gates RENDER on canManage || staffViewing (404s otherwise so
// a non-editor / non-staff viewer cannot tell the surface exists), then renders:
//   1. the QR + SPLASH editor (createSpaceCode / setCodeSplash behind the form): add a code, edit a
//      code's splash landing. The per-plan code CAP is enforced server-side in createSpaceCode; the
//      page reads the cap so the form can hide the create form when the Space is at it.
//   2. per-space SCAN ANALYTICS (summarizeScans over THIS Space's scans only), streamed behind
//      <Suspense>.
//
// STAFF PREVIEW (a janitor viewing a Space they don't manage): a Staff preview banner shows and the
// form renders READ-ONLY (the create form + splash editors are hidden). The write actions stay gated
// on canEditProfile server-side, so staff viewing never confers a write. The seeded codes + analytics
// (listSpaceCodes / listSpaceScanRows) are themselves gated on canEditProfile OR a janitor preview,
// so a staff viewer reads the real inventory but cannot mutate it.
//
// TENANCY: every read is scoped to space.id, so this surface only ever shows THIS Space's codes +
// scans. VOICE (CONTENT-VOICE §10): plain labels, no narrated feelings, no em/en dashes.

export const metadata = {
  title: 'QR codes',
}

export default async function SpaceQrPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  // Resolve the Space, failing closed on a missing / not-visible Space (no existence leak).
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  // Gate RENDER on canManage (owner / admin / editor) OR staffViewing (a janitor previewing). 404
  // (not 403) for everyone else. The WRITE actions stay gated on canEditProfile, so staff is read-only.
  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) notFound()

  const brandName = space.brandName ?? space.name

  // PER-SPACE FUNCTION GATE (per-space-roles Phase 2). QR codes default to editor (the old
  // canEditProfile threshold); a staff janitor keeps the read-only preview (every write stays gated).
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!staffViewing && !spaceFunctionAccess(space, 'qr', caps.role)) {
    return (
      <FocusTemplate
        eyebrow={brandName}
        title="QR codes"
        description="The codes for this space."
      >
        <FeatureLockedNotice
          brandName={brandName}
          slug={space.slug}
          type={space.type}
          label="QR codes"
          reason={spaceFunctionAccess(space, 'qr', 'admin') ? 'role' : 'disabled'}
          canManageMembers={caps.canManageMembers}
        />
      </FocusTemplate>
    )
  }

  const codes = await listSpaceCodes(space.id)
  // The per-plan cap drives whether the create form shows. The plan rides the untyped Space read in
  // space-codes.ts; here we just need the cap number for the form's note + gate.
  const codeCap = codeCapForPlan((space as { plan?: string | null }).plan ?? null)
  const capReached = codes.length >= codeCap

  return (
    <FocusTemplate
      eyebrow={brandName}
      title="QR codes"
      description="Make a code that points anywhere, and change where it goes any time without a reprint. Add a splash landing when you want a scan to see a page first."
      width="wide"
    >
      {staffViewing && <StaffPreviewBanner spaceName={brandName} />}

      <div className="space-y-10">
        <section id="scans" className="scroll-mt-20">
          <SectionHeader title="Scans" />
          <Suspense fallback={<StatsSkeleton />}>
            <SpaceScanStats spaceId={space.id} />
          </Suspense>
        </section>

        <section>
          <SectionHeader title="Codes" count={codes.length} />
          <QrSplashForm
            spaceId={space.id}
            slug={space.slug}
            codes={codes}
            capReached={capReached}
            codeCap={codeCap}
            readOnly={staffViewing}
          />
        </section>
      </div>
    </FocusTemplate>
  )
}

// Per-space scan stats (this Space's codes only). A self-contained async section so the page shell
// paints before the scan rollup resolves (PAGE-FRAMEWORK §5).
async function SpaceScanStats({ spaceId }: { spaceId: string }) {
  const scans = await listSpaceScanRows(spaceId)
  const summary = summarizeScans(scans)
  return (
    <div className="grid grid-cols-2 gap-3 @lg:grid-cols-3">
      <StatCard bordered label="Total scans" value={summary.total.toLocaleString()} icon={ScanLine} />
      <StatCard
        bordered
        label="Signed-in scanners"
        value={summary.unique.toLocaleString()}
        icon={Users}
      />
      <StatCard
        bordered
        label="Tapped tags"
        value={summary.byMedium.nfc.toLocaleString()}
        icon={Nfc}
        detail={`${summary.byMedium.qr.toLocaleString()} printed`}
      />
    </div>
  )
}

// Dimension-matched skeleton for the streamed stats (no CLS, PAGE-FRAMEWORK §5.4).
function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 @lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-20 animate-pulse rounded-2xl border border-border bg-surface-elevated/50"
        />
      ))}
    </div>
  )
}
