import type { Config } from '@/lib/page-editor/types'
import { rootConfig } from '@/lib/page-editor/config-root'

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
import { dawnComponents } from '@/components/page-editor/blocks/dawn'
import { articleComponents, ARTICLE_BLOCK_TYPES } from '@/components/page-editor/blocks/article'
import { productStoryComponents } from '@/components/page-editor/blocks/product-story'
import { circlesComponents } from '@/components/page-editor/blocks/circles'
import { linktreeComponents, LINKTREE_CATEGORY_COMPONENTS } from '@/components/page-editor/blocks/linktree'
import { spacesComponents } from '@/components/page-editor/blocks/spaces'
import { profileComponents } from '@/components/page-editor/blocks/profile'
import { designComponents } from '@/components/page-editor/blocks/design'
import { wildheartComponents } from '@/components/page-editor/blocks/wildheart'
import { networkComponents, NETWORK_CATEGORY_COMPONENTS } from '@/components/page-editor/blocks/network'
import { networkKitComponents, NETWORK_KIT_CATEGORY_COMPONENTS } from '@/components/page-editor/blocks/network-kit'
import { networkKitInnerComponents } from '@/components/page-editor/blocks/network-kit-inner'
import { networkKitMoreComponents, NETWORK_KIT_MORE_CATEGORY_COMPONENTS } from '@/components/page-editor/blocks/network-kit-more'
import { templeComponents, TEMPLE_CATEGORY_COMPONENTS } from '@/components/page-editor/blocks/temple'
import { templeKitComponents, TEMPLE_KIT_CATEGORY_COMPONENTS } from '@/components/page-editor/blocks/temple-kit'
import { templeKitInnerComponents } from '@/components/page-editor/blocks/temple-kit-inner'
import { templeKitInnerBComponents } from '@/components/page-editor/blocks/temple-kit-inner-b'
import { templeKitInnerCComponents } from '@/components/page-editor/blocks/temple-kit-inner-c'
import { templeKitInnerDComponents } from '@/components/page-editor/blocks/temple-kit-inner-d'
import { midnightComponents, MIDNIGHT_CATEGORY_COMPONENTS } from '@/components/page-editor/blocks/midnight'
import { midnightPracticeComponents, MIDNIGHT_PRACTICE_CATEGORY_COMPONENTS } from '@/components/page-editor/blocks/midnight-practice'
import { designerComponents, DESIGNER_CATEGORY_COMPONENTS } from '@/components/page-editor/blocks/designer'
import { freeHumanBlocks } from '@/components/page-editor/blocks/free-human'
import { servicesBlocks } from '@/components/page-editor/blocks/services'
import { mindlessBlocks } from '@/components/page-editor/blocks/mindless'
import { newWorldBlocks } from '@/components/page-editor/blocks/new-world'
import { freeHumanCalendarBlocks } from '@/components/page-editor/blocks/free-human-calendar'
import { freeHumanWheelBlocks } from '@/components/page-editor/blocks/free-human-wheel'
import { rolesComponents, ROLE_CATEGORY_COMPONENTS } from '@/components/page-editor/blocks/roles'
import { siteStoryComponents, SITE_STORY_CATEGORY_COMPONENTS } from '@/components/page-editor/blocks/site-story'
import { DESIGN_BLOCK_TYPES } from '@/lib/page-editor/block-limits'

export const config: Config = {
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
    ...linktreeComponents,
    ...spacesComponents,
    ...profileComponents,
    ...designComponents,
    ...wildheartComponents,
    ...networkComponents,
    ...networkKitComponents,
    ...networkKitMoreComponents,
    ...networkKitInnerComponents,
    ...templeComponents,
    ...templeKitComponents,
    ...templeKitInnerComponents,
    ...templeKitInnerBComponents,
    ...templeKitInnerCComponents,
    ...templeKitInnerDComponents,
    ...midnightComponents,
    ...midnightPracticeComponents,
    ...designerComponents,
    ...freeHumanBlocks,
    ...servicesBlocks,
    ...mindlessBlocks,
    ...newWorldBlocks,
    ...freeHumanCalendarBlocks,
    ...freeHumanWheelBlocks,
    ...rolesComponents,
    ...siteStoryComponents,
  },
  // Left-bar grouping: standard page-builder taxonomy.
  categories: {
    // The five reusable DESIGN BLOCKS (2026): the member-light, bolder story blocks any Space,
    // Spotlight, or marketing page composes. Each may appear up to three times per page (the primary
    // profile blocks below are one per page) — enforced in the Blocks palette (lib/page-editor/
    // block-limits.ts). Order matches the design scope report.
    blocks: {
      title: 'Blocks',
      components: [...DESIGN_BLOCK_TYPES],
    },
    layout: {
      title: 'Layout',
      components: ['Container', 'Columns', 'Spacer', 'Divider'],
    },
    content: {
      title: 'Content',
      components: ['Heading', 'DisplayHeading', 'Text', 'Prose', 'Statement', 'StoryBeats', 'Quote', 'Buttons'],
    },
    sections: {
      title: 'Sections',
      components: ['Hero', 'FeatureGrid', 'ValueBand', 'BuildTimeline', 'PhotoCardRow', 'DawnHowToSteps', 'PlanBand', 'PillarNav', 'IllustratedFeature', 'RolePicker', 'Manifesto', 'LeadFunnel', 'Showcase', 'StatRow', 'Tiers', 'Checklist', 'Accordion', 'CallToAction'],
    },
    productStory: {
      title: 'Product story',
      components: ['SeasonTimeline', 'CircleFirstNight', 'RolesPath', 'QuestLoop', 'BackTheBuild'],
    },
    media: {
      title: 'Media',
      components: ['Cover', 'Image', 'Gallery', 'MediaText', 'PhotoBeat', 'PhotoTrio', 'Marquee'],
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
        'SpaceArrangement',
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
        'SpaceJoinList',
        'SpaceBusiness',
        'SpaceTeam',
        'SpaceCTA',
      ],
    },
    spaceContent: {
      title: 'Space content',
      components: ['SpaceReviews', 'SpaceFAQ'],
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
    // The astrology calendar family (the Wildheart theme's signature, ADR in docs/ledger): three renderings
    // of one wheel model. Website pages only (lib/page-editor/palette-scope.ts): they read the Space's
    // events through `metadata.space`, and wear any site theme.
    wildheart: {
      title: 'Astrology calendar',
      components: ['WildheartYearJourney', 'WildheartSkyMap', 'WildheartNowLine', 'WildheartSeasonBand', 'WildheartMoonPath', 'WildheartSealCards', 'WildheartRetreatBand', 'WildheartMarkSplit', 'WildheartPhoto', 'WildheartOrnament', 'WildheartMoonStrip', 'WildheartModules', 'WildheartFirstNight'],
    },
    // The Network theme's section family (The Group's design handoff): website pages only, like the
    // Wildheart family. Dates and next-up cards read the Space's events through `metadata.space`.
    network: {
      title: 'Network sections',
      components: [...NETWORK_CATEGORY_COMPONENTS],
    },
    // The Network Theme Kit's home sections (code id network-kit, the Network design system): website pages only.
    networkKit: {
      title: 'Network home sections',
      components: [...NETWORK_KIT_CATEGORY_COMPONENTS, ...NETWORK_KIT_MORE_CATEGORY_COMPONENTS, ...Object.keys(networkKitInnerComponents)],
    },
    // The Temple theme's section family (the Royal Temple design system's Home): website pages only.
    temple: {
      title: 'Temple sections',
      components: [...TEMPLE_CATEGORY_COMPONENTS],
    },
    // The Temple Theme Kit's section family (the Temple design system's Home): website pages only.
    templeKit: {
      title: 'Temple Kit sections',
      components: [...TEMPLE_KIT_CATEGORY_COMPONENTS, ...Object.keys(templeKitInnerComponents), ...Object.keys(templeKitInnerBComponents), ...Object.keys(templeKitInnerCComponents), ...Object.keys(templeKitInnerDComponents)],
    },
    // The Nocturne theme's section family (code id midnight, the Nocturne design system's Web Theme): website pages only.
    midnight: {
      title: 'Nocturne sections',
      components: [...MIDNIGHT_CATEGORY_COMPONENTS],
    },
    // The Nocturne practice sections (the House of Fates design, the Hypnotist kit): website pages only.
    midnightPractice: {
      title: 'Nocturne practice sections',
      components: [...MIDNIGHT_PRACTICE_CATEGORY_COMPONENTS],
    },
    // The Designer theme's section family (the Alli Rae Build + Design system): website pages only.
    designer: {
      title: 'Designer sections',
      components: [...DESIGNER_CATEGORY_COMPONENTS],
    },
    // The Free Human Theme Kit's section family (the Free Human Movement design system): website pages only.
    freeHuman: {
      title: 'Honey sections',
      components: [...Object.keys(freeHumanBlocks), ...Object.keys(freeHumanCalendarBlocks), ...Object.keys(freeHumanWheelBlocks)],
    },
    // The Services Theme Kit's section family (the Services design system): website pages only.
    services: {
      title: 'Services sections',
      components: Object.keys(servicesBlocks),
    },
    // The Mindless theme's own section family (the Mindless design system's website kit, LIVE-2311): website pages only.
    mindless: {
      title: 'Mindless sections',
      components: Object.keys(mindlessBlocks),
    },
    // The New World theme's own section family (the New World design system, LIVE-2055): website pages only.
    newWorld: {
      title: 'New World sections',
      components: Object.keys(newWorldBlocks),
    },
    // The role blocks (docs/THEME-COHESION.md, ADR-1923): Hero, Steps, Offerings, Gatherings, Membership, Proof, FAQ and CTA,
    // three layouts each, built on the core token contract so they wear every theme. Website pages only; opt-in.
    roles: {
      title: 'Sections for any theme',
      components: [...ROLE_CATEGORY_COMPONENTS],
    },
    // The site story blocks (components/page-editor/blocks/site-story.tsx, owner 2026-11-04 "make each a
    // different layout"): the founder chapters, the principle orbit and the playbook's cover, chapters and
    // tool stack. Drawn in the Frequency public site kit, so the marketing editor offers them and no Space
    // website theme does (lib/page-editor/palette-scope.ts).
    siteStory: {
      title: 'Site story',
      components: [...SITE_STORY_CATEGORY_COMPONENTS],
    },
    // The seeker-article layouts (components/page-editor/blocks/article.tsx, owner 2026-11-04 "make each a
    // different layout"): a question, a line, a story, steps. Drawn in the Frequency public site kit
    // (site-blocks.css §7), so the marketing editor offers them and no Space website theme does
    // (lib/page-editor/palette-scope.ts).
    article: {
      title: 'Article layouts',
      components: [...ARTICLE_BLOCK_TYPES],
    },
  },
}
