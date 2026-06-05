import type { Config } from '@measured/puck'

// The STANDARDIZED block library — shared by BOTH the editor (<Puck>) and the
// public renderer (<Render>). Blocks are organized like a real page-builder:
// generic, design-system sections (not content-named one-offs), grouped into
// left-bar categories, each with variants + the same universal "adjust" controls
// (background, width, alignment, spacing, visibility). Every block is built from
// the kit in components/page-editor/blocks/* against the frozen contract in
// blocks/kit.tsx + lib/page-editor/fields.tsx. This file is PURE ASSEMBLY: it
// merges the per-group fragments and declares the left-bar categories — no block
// is defined here. See docs/PAGE-EDITOR-SPEC.md §12.

import { headingComponents } from '@/components/page-editor/blocks/kit'
import { sectionsComponents } from '@/components/page-editor/blocks/sections'
import { collectionsComponents } from '@/components/page-editor/blocks/collections'
import { mediaComponents } from '@/components/page-editor/blocks/media'
import { primitivesComponents } from '@/components/page-editor/blocks/primitives'
import { dynamicComponents } from '@/components/page-editor/blocks/dynamic'

export const config: Config = {
  components: {
    ...headingComponents,
    ...primitivesComponents,
    ...sectionsComponents,
    ...collectionsComponents,
    ...mediaComponents,
    ...dynamicComponents,
  },
  // Left-bar grouping — standard page-builder taxonomy.
  categories: {
    layout: {
      title: 'Layout',
      components: ['Container', 'Columns', 'Spacer', 'Divider'],
    },
    content: {
      title: 'Content',
      components: ['Heading', 'Text', 'Statement', 'Quote', 'Buttons'],
    },
    sections: {
      title: 'Sections',
      components: ['Hero', 'FeatureGrid', 'Showcase', 'StatRow', 'Tiers', 'Checklist', 'Accordion', 'CallToAction'],
    },
    media: {
      title: 'Media',
      components: ['Image', 'Gallery', 'MediaText', 'Marquee'],
    },
    dynamic: {
      title: 'Dynamic',
      components: ['LiveStats', 'LiveEvents', 'LivePosts'],
    },
  },
}
