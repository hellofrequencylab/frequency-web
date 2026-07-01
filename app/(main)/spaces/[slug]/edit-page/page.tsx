import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Render } from '@measured/puck/rsc'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { config } from '@/lib/page-editor/config'
import { spacePuckData, readStoredSpaceDoc } from '@/lib/page-editor/templates/space'
import { getSpaceContentData } from '@/lib/spaces/content-data'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { SpaceLandingEditor } from '@/components/spaces/space-landing-editor'

// THE SPACE LANDING EDITOR ROUTE (ADR-476/472, Phase 1). An owner / admin / editor edits
// their Space's public landing through Puck here; the published doc is stored to
// spaces.preferences.puck and the public /spaces/<slug> index renders it. A platform
// janitor previewing a Space they do not manage gets a READ-ONLY preview (no editor
// runtime, no write affordances); everyone else 404s so the route never leaks.
//
// CHROME: this is an IN-PAGE editor surface with its own Puck header, so the profile
// layout escapes its hero + tab chrome for the `edit-page` segment. It is NOT a
// full-viewport takeover: it keeps the GLOBAL community right rail like the rest of the
// app (page-chrome.ts), and the Puck side panels are shrunk (puck-theme.css) so the canvas
// still breathes beside the rail. The editor runtime ships ONLY here; the public landing
// renders <Render> with no editor code.

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Customize page',
  robots: { index: false, follow: false },
}

export default async function SpaceEditLandingPage({
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
  setActiveSpace(space)

  // GATE: only a manager (owner / admin / editor) edits; a platform janitor previews
  // read-only. notFound (not a redirect) for everyone else: we never reveal the route.
  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) notFound()

  const brandName = space.brandName?.trim() || space.name
  const presetInput = {
    name: brandName,
    type: space.type,
    variant: space.modeVariant,
    plan: space.plan,
    preferences: space.preferences,
  }
  // The doc the editor loads: the stored doc when present + valid, else the generated
  // preset (so a first-time operator opens onto their template's designed start point).
  const data = spacePuckData(presetInput)
  const customized = readStoredSpaceDoc(space.preferences) !== null

  // STAFF PREVIEW: read-only. No editor runtime; render the resolved landing with the
  // staff banner so the read-only mode is unmistakable (every write also re-gates
  // server-side, so a staff viewer could never publish even if they reached the editor).
  // Inject the live Space content (updates/reviews/faqs) so the preview matches the public
  // landing exactly (the same metadata.space the public renderer passes).
  if (!canManage && staffViewing) {
    const spaceContent = await getSpaceContentData(space.id)
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <StaffPreviewBanner spaceName={brandName} />
        <Render config={config} data={data} metadata={{ space: spaceContent }} />
      </div>
    )
  }

  return (
    <SpaceLandingEditor slug={slug} title={brandName} data={data} customized={customized} />
  )
}
