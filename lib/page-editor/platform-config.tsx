import type { Config } from '@/lib/page-editor/types'
import { rootConfig } from '@/lib/page-editor/config-root'
import { headingComponents } from '@/components/page-editor/blocks/kit'
import { sectionsComponents } from '@/components/page-editor/blocks/sections'
import { collectionsComponents } from '@/components/page-editor/blocks/collections'
import { mediaComponents } from '@/components/page-editor/blocks/media'
import { primitivesComponents } from '@/components/page-editor/blocks/primitives'
import { dynamicComponents } from '@/components/page-editor/blocks/dynamic'
import { marketingComponents } from '@/components/page-editor/blocks/marketing'
import { dawnComponents } from '@/components/page-editor/blocks/dawn'
import { articleComponents } from '@/components/page-editor/blocks/article'
import { productStoryComponents } from '@/components/page-editor/blocks/product-story'
import { circlesComponents } from '@/components/page-editor/blocks/circles'
import { spacesComponents } from '@/components/page-editor/blocks/spaces'
import { designComponents } from '@/components/page-editor/blocks/design'
import { siteStoryComponents } from '@/components/page-editor/blocks/site-story'

// ── THE PLATFORM PAGES' BLOCK SET (PERF-031) ────────────────────────────────────────────────────
//
// The platform's own marketing pages (/about, /pricing, /spaces, the seeker articles, the course
// page, /circles) render a document authored in the editor's MARKETING palette (palette-scope.ts
// SURFACE_CATEGORIES.marketing), which never offers a site-kit block. But they rendered it with the
// WHOLE library (config.tsx), and a client component imported anywhere in a route's graph ships to
// the browser whether or not the page renders it: measured 2026-11-19, /pricing and /about each
// loaded the 183 KB site-kit chunk (Wildheart, Temple, Network, Midnight, Designer, Free Human,
// Mindless, New World...) to draw none of it.
//
// This is the same library minus the per-theme site kits, the website role blocks, and the Space/Spotlight
// profile and link sets (the shared `spaces` set stays: the marketing Media category offers its Cover), assembled from the same fragments, so a block renders identically under either config.
// A type outside it costs that one section, never the page (<BlockRender> skips what it cannot
// resolve), and scripts/probes/PERF-031.mjs fails if a platform template uses one.
export const platformConfig: Config = {
  root: rootConfig,
  components: {
    ...headingComponents,
    ...primitivesComponents,
    ...sectionsComponents,
    ...collectionsComponents,
    ...mediaComponents,
    ...marketingComponents,
    ...dawnComponents,
    ...articleComponents,
    ...productStoryComponents,
    ...dynamicComponents,
    ...circlesComponents,
    ...spacesComponents,
    ...designComponents,
    ...siteStoryComponents,
  },
}
