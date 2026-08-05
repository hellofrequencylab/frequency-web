import { Suspense } from 'react'
import { ScanLine, Users, Nfc } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { listSpaceCodes, listSpaceScanRows, codeCapForPlan } from '@/lib/qr/space-codes'
import { summarizeScans } from '@/lib/qr/analytics'
import { QrSplashForm } from '@/components/spaces/qr-splash-form'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { FeatureLockedNotice } from '@/components/spaces/feature-locked-notice'
import { MeterUpsell } from '@/components/pricing/meter-upsell'
import { SectionHeader } from '@/components/ui/section-header'
import { StatCard } from '@/components/ui/stat-card'

// QR BODY — the chrome-free QR studio, lifted out of the standalone /settings/qr page (Stage D2) so it
// renders in TWO places from one source: (1) that page, wrapped in its FocusTemplate chrome, and (2)
// INLINE in the Space profile body as the QR codes `?panel=` workspace (components/spaces/workspace/
// space-body-panel.tsx). It owns NO page chrome (the caller frames it) and SELF-GATES server-side so it is
// safe to mount anywhere: it returns null when the viewer may not manage this Space (the standalone page
// still 404s via its own gate, so a null here never renders a bare 200). When the QR function is locked for
// a non-staff viewer it returns the FeatureLockedNotice (the caller keeps the plain framing); otherwise the
// QR + splash editor plus per-space scan analytics.
//
// STAFF PREVIEW (a janitor viewing a Space they don't manage): a Staff preview banner shows and the form
// renders READ-ONLY. Every WRITE action stays gated on canEditProfile server-side. TENANCY: every read is
// scoped to space.id. VOICE (CONTENT-VOICE §10): plain labels, no narrated feelings, no em/en dashes.

export async function QrBody({ slug }: { slug: string }) {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  // Resolve the Space, failing closed on a missing / not-visible Space (no existence leak).
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) return null

  // SELF-GATE on canManage (owner / admin / editor) OR staffViewing (a janitor previewing). Render
  // nothing for everyone else — the standalone page adds its own notFound() so it still 404s.
  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) return null

  const brandName = space.brandName ?? space.name
  // The Space plan (spaces.plan is untyped on the projection, ADR-246). Read once: the code cap, the
  // locked notice, and the usage meter all answer to it.
  const spacePlan = (space as { plan?: string | null }).plan ?? null

  // PER-SPACE FUNCTION GATE (per-space-roles Phase 2). QR codes default to editor (the old
  // canEditProfile threshold); a staff janitor keeps the read-only preview (every write stays gated).
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!staffViewing && !spaceFunctionAccess(space, 'qr', caps.role)) {
    return (
      <FeatureLockedNotice
        brandName={brandName}
        slug={space.slug}
        type={space.type}
        label="QR codes"
        reason={spaceFunctionAccess(space, 'qr', 'admin') ? 'role' : 'disabled'}
        canManageMembers={caps.canManageMembers}
        // Phase 4: the QR meter key, so a PLAN-reason notice carries the allowance ladder instead of
        // rendering no upsell at all. Today this notice only ever fires for 'role' / 'disabled', so
        // the key is inert here; the live prompt is the MeterUpsell on the working surface below.
        featureKey="space_qr"
        currentPlan={spacePlan}
      />
    )
  }

  const codes = await listSpaceCodes(space.id)
  // The per-plan cap drives whether the create form shows. The plan rides the untyped Space read in
  // space-codes.ts; here we just need the cap number for the form's note + gate.
  const codeCap = codeCapForPlan(spacePlan)
  const capReached = codes.length >= codeCap

  return (
    <>
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
          {/* Phase 4 (docs/VALUE-LADDER.md): the space_qr meter's in-context prompt. The real count is
              already in scope, so it names the codes this Space built and what the next plan changes,
              at 80% of the allowance. Renders nothing below that, and it blocks nothing ever. */}
          <MeterUpsell
            featureKey="space_qr"
            currentTier={spacePlan}
            usage={codes.length}
            upgradeHref={`/spaces/${space.slug}/settings/billing`}
            className="mb-4"
          />
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
    </>
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
          className="h-20 animate-pulse rounded-card border border-border bg-surface-elevated/50"
        />
      ))}
    </div>
  )
}
