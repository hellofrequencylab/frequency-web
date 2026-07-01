import { notFound } from 'next/navigation'
import { Render } from '@measured/puck/rsc'
import type { Data } from '@measured/puck'
import { getMyProfileId } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { config } from '@/lib/page-editor/config'
import { spacePuckData } from '@/lib/page-editor/templates/space'
import { withVisibleBlocks } from '@/lib/page-editor/templates/space-blocks'
import { templateDescriptorForSpace } from '@/lib/spaces/templates'
import { getSpaceContentData } from '@/lib/spaces/content-data'

// The profile LAYOUT now owns the identity header (cover + logo + name + CTA) for every tab, so the
// landing body must NEVER render a SpaceIdentityHeader block or it would duplicate the layout header.
// The generated presets no longer seed it, but a STORED (customized) doc from before the change may
// still carry one. Strip it from the top-level content AND from any SpaceLayout main / side slot
// before <Render>. PURE + tolerant: unknown shapes pass through untouched.
function stripIdentityHeader(data: Data): Data {
  const isIdentity = (b: unknown): boolean =>
    typeof (b as { type?: unknown })?.type === 'string' && (b as { type: string }).type === 'SpaceIdentityHeader'
  const cleanSlot = (arr: unknown): unknown =>
    Array.isArray(arr) ? arr.filter((b) => !isIdentity(b)) : arr
  const content = (data.content ?? []).filter((b) => !isIdentity(b)).map((b) => {
    if (b.type !== 'SpaceLayout') return b
    const props = b.props as Record<string, unknown>
    return { ...b, props: { ...props, main: cleanSlot(props.main), side: cleanSlot(props.side) } }
  })
  return { ...data, content }
}

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

  const brandName = space.brandName?.trim() || space.name
  const templateInput = {
    type: space.type,
    variant: space.modeVariant,
    plan: space.plan,
    preferences: space.preferences,
  }
  // Resolve the doc, drop any block the Page panel hid (and strip the flag off survivors), then strip
  // the legacy identity header. So a hidden top-level block never renders on the public landing.
  const data = stripIdentityHeader(
    withVisibleBlocks(spacePuckData({ name: brandName, ...templateInput })),
  )

  // The resolved template names the primary action (a plain verb + the tab it routes to). The landing
  // lives at the profile index; the CTA points at that tab as a slug-relative link so it never 404s.
  const descriptor = templateDescriptorForSpace(templateInput)
  const ctaTab = descriptor.hero.primaryCta.tab
  const primaryCta = {
    label: descriptor.hero.primaryCta.label,
    href: ctaTab === 'about' ? `/spaces/${space.slug}` : `/spaces/${space.slug}/${ctaTab}`,
  }

  // The live rows the dynamic Space content blocks read off `puck.metadata.space` (the same
  // metadata-injection pattern LiveStats + the Circles index blocks use), PLUS the shared identity
  // (cover / logo / name / tagline / primary CTA) + the live highlight counts the Profile blocks read
  // (Phase 4). FAIL-SAFE: the reader defaults to empty, so a brand-new Space simply renders nothing for
  // a block with no rows and the landing never throws.
  const spaceContent = await getSpaceContentData(space.id, {
    name: brandName,
    type: space.type,
    logoUrl: space.brandLogoUrl,
    coverUrl: space.coverImageUrl,
    tagline: space.tagline,
    primaryCta,
    statsInput: templateInput,
  })

  return <Render config={config} data={data} metadata={{ space: spaceContent }} />
}
