import { notFound } from 'next/navigation'
import { BlockRender } from '@/lib/page-editor/block-render'
import type { Data } from '@/lib/page-editor/types'
import { getMyProfileId } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { config } from '@/lib/page-editor/config'
import { withVisibleBlocks } from '@/lib/page-editor/templates/space-blocks'
import { resolveSpacePageDoc, HOME_SLUG } from '@/lib/spaces/profile-pages'
import { readProfileData } from '@/lib/spaces/profile-data'
import { readLayoutPreset, applyLayoutPreset } from '@/lib/spaces/layout-presets'
import { defaultPrimaryCtaLabel } from '@/lib/spaces/profile-config'
import { getSpaceContentData } from '@/lib/spaces/content-data'

// The profile LAYOUT now owns the identity header (cover + logo + name + CTA) for every tab, so the
// landing body must NEVER render a SpaceIdentityHeader block or it would duplicate the layout header.
// The generated presets no longer seed it, but a STORED (customized) doc from before the change may
// still carry one. Strip it from the top-level content AND from any SpaceLayout main / side slot
// before <BlockRender>. PURE + tolerant: unknown shapes pass through untouched.
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

// THE SPACE LANDING BODY, RENDERED THROUGH PUCK. A profile page (Home or a custom page)
// body is a Puck document: this page's stored, published doc when present + valid, else
// the ONE universal default page (resolveSpacePageDoc, lib/spaces/profile-pages.ts). The
// resolver is fail-safe — a brand-new Space with no stored doc still renders the universal
// default, so the landing never goes blank.
//
// The hero context band, the tab row, the rail (page-chrome), and the brand accent
// all stay where they were: this component only replaces the About tab BODY. It sits
// INSIDE the DetailTemplate the layout already wraps every profile in, INSIDE the
// AccentScope that paints the Space's brand tokens, so the Puck blocks theme to the
// Space without a hex (white-label hygiene, D4/D6).
//
// `<BlockRender>` (lib/page-editor/block-render.tsx) is the in-house server-friendly
// renderer the public marketing pages already use (app/page.tsx), so the public landing
// ships no editor runtime. Server Component throughout; static-friendly.
export async function SpaceLanding({ slug, pageSlug = HOME_SLUG }: { slug: string; pageSlug?: string }) {
  // Re-resolve the Space (request-cached via getSpaceBySlug) + re-stamp the active
  // Space so any dynamic block reads THIS tenant's rows.
  const viewerProfileId = await getMyProfileId()
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()
  setActiveSpace(space)

  const brandName = space.brandName?.trim() || space.name
  // Resolve THIS page's doc (Home or a custom page), drop any block the Page panel hid (and strip the
  // flag off survivors), then strip the legacy identity header. The resolver is fail-safe: a page with
  // no stored doc renders the one universal default, so it never goes blank.
  // CONTENT (neutral, flat, editor-tied): the stored-or-default doc with hidden blocks stripped and the
  // legacy identity header removed.
  const content = stripIdentityHeader(
    withVisibleBlocks(resolveSpacePageDoc(space.preferences, brandName, pageSlug)),
  )
  // DISPLAY: arrange that same content for the page's chosen layout preset (pure transform; the stored
  // content is never mutated, so an external site could render the same content with a different
  // preset). stack/sections stay flat; main-rail wraps into a two-column region.
  const layoutPreset = readLayoutPreset(space.preferences, pageSlug)
  const data = applyLayoutPreset(content, layoutPreset)

  // The single primary CTA (best practice) routes to the reserved /book action page (the live
  // transactional surface, branched by type). Label is the per-type default (operator-overridable).
  const primaryCta = {
    label: defaultPrimaryCtaLabel(space.type),
    href: `/spaces/${space.slug}/book`,
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
    slug: space.slug,
    // The CENTRAL business info + story, injected so every authored block renders from the ONE
    // source (edit once, changes everywhere). Read off preferences.profileData (fail-safe empty).
    profile: readProfileData(space.preferences),
    layoutPreset,
  })

  return <BlockRender config={config} data={data} metadata={{ space: spaceContent }} />
}
