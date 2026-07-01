import { notFound } from 'next/navigation'
import { Render } from '@measured/puck/rsc'
import { getMyProfileId } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { config } from '@/lib/page-editor/config'
import { spacePuckData } from '@/lib/page-editor/templates/space'

// THE SPACE LANDING BODY, RENDERED THROUGH PUCK (ADR-476/472, Phase 1). The profile
// INDEX tab (/spaces/<slug>) body is now a Puck document: the stored, published doc
// (spaces.preferences.puck) when present + valid, else the generated preset for the
// Space's resolved layout template (Book / Schedule / Storefront / Hub). The
// resolver (spacePuckData) is fail-safe — a brand-new Space with no stored doc still
// renders its preset, so the landing never goes blank.
//
// The hero context band, the tab row, the rail (page-chrome), and the brand accent
// all stay where they were: this component only replaces the About tab BODY. It sits
// INSIDE the DetailTemplate the layout already wraps every profile in, INSIDE the
// AccentScope that paints the Space's brand tokens, so the Puck blocks theme to the
// Space without a hex (white-label hygiene, D4/D6).
//
// `<Render>` from `@measured/puck/rsc` is the server-friendly renderer the public
// marketing pages already use (app/page.tsx), so the public landing ships no editor
// runtime. Server Component throughout; static-friendly.
export async function SpaceLanding({ slug }: { slug: string }) {
  // Re-resolve the Space (request-cached via getSpaceBySlug) + re-stamp the active
  // Space so any dynamic block reads THIS tenant's rows, exactly as ProfileTabBody does.
  const viewerProfileId = await getMyProfileId()
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()
  setActiveSpace(space)

  const data = spacePuckData({
    name: space.brandName?.trim() || space.name,
    type: space.type,
    variant: space.modeVariant,
    plan: space.plan,
    preferences: space.preferences,
  })

  return <Render config={config} data={data} />
}
