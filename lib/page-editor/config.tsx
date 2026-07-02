import type { ReactNode } from 'react'
import type { Config } from '@measured/puck'

// The STANDARDIZED block library, shared by BOTH the editor (<Puck>) and the
// public renderer (<Render>). Blocks are organized like a real page-builder:
// generic, design-system sections (not content-named one-offs), grouped into
// left-bar categories, each with variants + the same universal "adjust" controls
// (background, width, alignment, spacing, visibility). Every block is built from
// the kit in components/page-editor/blocks/* against the frozen contract in
// blocks/kit.tsx + lib/page-editor/fields.tsx. This file is PURE ASSEMBLY: it
// merges the per-group fragments and declares the left-bar categories. No block
// is defined here. See docs/PAGE-EDITOR-SPEC.md §12.

import { headingComponents } from '@/components/page-editor/blocks/kit'
import { sectionsComponents } from '@/components/page-editor/blocks/sections'
import { collectionsComponents } from '@/components/page-editor/blocks/collections'
import { mediaComponents } from '@/components/page-editor/blocks/media'
import { primitivesComponents } from '@/components/page-editor/blocks/primitives'
import { dynamicComponents } from '@/components/page-editor/blocks/dynamic'
import { marketingComponents } from '@/components/page-editor/blocks/marketing'
import { productStoryComponents } from '@/components/page-editor/blocks/product-story'
import { circlesComponents } from '@/components/page-editor/blocks/circles'
import { linktreeComponents, LINKTREE_CATEGORY_COMPONENTS } from '@/components/page-editor/blocks/linktree'
import { spacesComponents } from '@/components/page-editor/blocks/spaces'
import { profileComponents } from '@/components/page-editor/blocks/profile'

export const config: Config = {
  // ROOT render: on a SPACE page (identified by the injected `metadata.space`) the profile blocks are
  // a FLAT top-level list (no SpaceLayout wrapper — so each block is individually editable), so the
  // root supplies the vertical rhythm between them here. Every OTHER surface (marketing, splash, member
  // Spotlight) passes children straight through untouched, so their self-spacing sections are unchanged.
  root: {
    render: ({ children, puck }: { children: ReactNode; puck?: { metadata?: Record<string, unknown> } }) => {
      const space = puck?.metadata?.space as { layoutPreset?: string } | undefined
      if (!space) return <>{children}</>
      // The DISPLAY rhythm per layout preset: `sections` is airier (a landing-page feel); `stack` and
      // `main-rail` share the standard rhythm (main-rail wraps into one SpaceLayout child that owns its
      // own grid, so the space-y just seats it). Content is identical; only the rhythm differs.
      const airy = space.layoutPreset === 'sections'
      const cls = airy ? 'space-y-16 py-10 sm:space-y-20 sm:py-14' : 'space-y-12 py-8 sm:space-y-14 sm:py-10'
      return <div className={cls}>{children}</div>
    },
  },
  components: {
    ...headingComponents,
    ...primitivesComponents,
    ...sectionsComponents,
    ...collectionsComponents,
    ...mediaComponents,
    ...marketingComponents,
    ...productStoryComponents,
    ...dynamicComponents,
    ...circlesComponents,
    ...linktreeComponents,
    ...spacesComponents,
    ...profileComponents,
  },
  // Left-bar grouping: standard page-builder taxonomy.
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
      components: ['Hero', 'FeatureGrid', 'IllustratedFeature', 'RolePicker', 'Manifesto', 'LeadFunnel', 'Showcase', 'StatRow', 'Tiers', 'Checklist', 'Accordion', 'CallToAction'],
    },
    productStory: {
      title: 'Product story',
      components: ['SeasonTimeline', 'CircleFirstNight', 'RolesPath', 'QuestLoop', 'BackTheBuild'],
    },
    media: {
      title: 'Media',
      components: ['Cover', 'Image', 'Gallery', 'MediaText', 'Marquee'],
    },
    dynamic: {
      title: 'Dynamic',
      components: ['LiveStats', 'LiveEvents', 'LivePosts'],
    },
    // The profile-native block set (Phase 4): FB-business-page info cards, painted from the app's own
    // DAWN design system. The space + spotlight PRESETS lead with these; marketing pages keep the
    // marketing blocks (the Profile set is ADDITIVE).
    profile: {
      title: 'Profile',
      components: [
        'SpaceLayout',
        'SpaceIdentityHeader',
        'SpaceSectionTitle',
        'SpaceCallout',
        'SpaceAbout',
        'SpaceHighlights',
        'SpaceStats',
        'SpaceQuickLinks',
        'SpaceEvents',
        'SpacePractices',
        'SpaceCommunity',
        'SpaceBooking',
        'SpaceAction',
        'SpaceOfferings',
        'SpaceContact',
        'SpaceBusiness',
        'SpaceTeam',
        'SpaceCTA',
      ],
    },
    spaceContent: {
      title: 'Space content',
      components: ['SpaceUpdates', 'SpaceReviews', 'SpaceFAQ'],
    },
    circles: {
      title: 'Circles index',
      components: [
        'CirclesChannelNav',
        'CirclesToolbar',
        'CirclesMap',
        'CirclesFeatured',
        'CirclesGrid',
        'CirclesBrowse',
      ],
    },
    // The member Spotlight (link-tree) blocks, shared with brand Spaces (Phase 3).
    linkTree: {
      title: 'Link tree',
      components: [...LINKTREE_CATEGORY_COMPONENTS],
    },
  },
}
