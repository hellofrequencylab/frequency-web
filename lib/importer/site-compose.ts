// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER — the SITE (website) surface composer (P2,
// docs/BUSINESS-IMPORTER.md §5). PURE (no React / Next / Supabase / AI): turns a verified +
// reframed BusinessProfile into the Puck `Data` HOME doc the external micro-site renders.
//
// WHY THIS EXISTS (the Site-surface gap P2 closes):
//   The three business surfaces render from ONE seeded Space, but through TWO layout systems:
//     • Space profile (/spaces/[slug])  -> the block-picker grid at preferences.profileLayout
//       (an EntityLayout). map.ts composeLayout already builds this.
//     • Site (/sites/[slug])            -> a PUCK doc at preferences.pageDocs.home, filtered for
//       the 'website' surface (filterDocForSurface). app/sites/[slug] resolves this via
//       resolveSpacePageDoc; with no stored pageDocs.home it falls back to the BARE default page.
//   The Site's live-data blocks (SpaceOfferings / SpaceContact / SpaceReviews / SpaceFAQ /
//   SpaceBusiness) self-fill from the central profileData the materializer already writes, so those
//   need no per-doc content. But the PROSE blocks read their PROPS: SpaceAbout.body and the closing
//   SpaceCallout.body render only what the doc carries. Without this composer, the reframed
//   story / about copy never reaches the Site. This folds that prose into the default doc's props
//   under the SAME prose gate map.ts uses, so a generated line that hides a commercial claim stays
//   review-required on the Site too. No em dashes in this file (CONTENT-VOICE §10).
// ─────────────────────────────────────────────────────────────────────────────

import type { Data, ContentItem } from '@/lib/page-editor/types'
import { generateDefaultSpacePage } from '@/lib/page-editor/templates/space-default'
import { prosePublishes, type CommercialPolicy } from './map'
import type { BusinessProfile } from './schema'

/**
 * Compose the Site HOME Puck doc from a verified + reframed draft under a commercial-fact `policy`.
 * Starts from the ONE universal default page (so the live-data blocks are present and self-fill from
 * profileData), then folds the reframed PROSE into the prop-authored blocks, GATED exactly like
 * map.ts:
 *   • SpaceAbout.body  <- story (the richer narrative) or about, only when prosePublishes clears it.
 *   • SpaceCallout.body<- a short about line, only when it clears (never a specific commercial claim).
 * A withheld prose field leaves the block's body empty, so the block renders nothing on the Site (the
 * blocks are honest-empty), exactly the withhold behavior of the profile layout. PURE + total.
 *
 * The identity header (cover + logo + name + CTA) is owned by the Site shell, never a block here, so
 * this composer never emits one (mirrors generateDefaultSpacePage). Regenerable independently: the
 * materializer writes ONLY pageDocs.home from this, so re-running it rebuilds the Site without
 * touching the Space profile grid or the Spotlight.
 */
export function composeSiteHomeDoc(profile: BusinessProfile, policy: CommercialPolicy = 'allow'): Data {
  const name = (profile.name ?? '').trim() || 'this space'
  const doc = generateDefaultSpacePage(name)

  const storyOk = prosePublishes(policy, 'story')
  const aboutOk = prosePublishes(policy, 'about')
  const story = (profile.story ?? '').trim()
  const about = (profile.about ?? '').trim()

  // The About card body: prefer the richer reframed story, fall back to the about line. Each is only
  // used when its own prose gate clears (a generated line under review must not land on the Site). A
  // withheld / empty value leaves the body '' so the honest-empty About block renders nothing.
  const aboutBody = (storyOk && story) || (aboutOk && about) || ''

  const content: ContentItem[] = doc.content.map((block) => {
    if (block.type === 'SpaceAbout') {
      return { ...block, props: { ...block.props, body: aboutBody } }
    }
    return block
  })

  return { ...doc, content }
  // NOTE: the closing SpaceCallout keeps its generic default CTA ("Come say hello"), which is a
  // relational invitation with no commercial claim, so it is not gated and not folded here.
}
