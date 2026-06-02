import type { Config, ComponentConfig } from '@measured/puck'
import { Statement } from '@/components/marketing/marketing-ui'
import { accentize, toneField, type Tone } from './fields'
import { layoutField, layoutDefault, padClass, visClass, type LayoutValue } from './layout'

// The STANDARDIZED block library — shared by BOTH the editor (<Puck>) and the
// public renderer (<Render>). Blocks are organized like a real page-builder:
// generic, design-system sections (not content-named one-offs), grouped into
// left-bar categories, each with variants + the same universal "adjust" controls
// (background, width, alignment, spacing, visibility). Every block is built from
// the kit in components/page-editor/blocks/* against the frozen contract in
// blocks/kit.tsx + lib/page-editor/fields.tsx. See docs/PAGE-EDITOR-SPEC.md.

import { headingComponents } from '@/components/page-editor/blocks/kit'
import { sectionsComponents } from '@/components/page-editor/blocks/sections'
import { collectionsComponents } from '@/components/page-editor/blocks/collections'
import { mediaComponents } from '@/components/page-editor/blocks/media'
import { primitivesComponents } from '@/components/page-editor/blocks/primitives'
import { dynamicComponents } from '@/components/page-editor/blocks/dynamic'

// Big typographic interstitial — a Content primitive kept inline (it's a thin
// wrapper over the marketing-ui Statement).
const statementComponents: Record<string, ComponentConfig> = {
  Statement: {
    label: 'Statement',
    fields: {
      text: { type: 'textarea', label: 'Statement' },
      accent: { type: 'text', label: 'Accent word (optional)' },
      tone: toneField,
      layout: layoutField,
    },
    defaultProps: { text: 'A bold statement.', accent: '', tone: 'canvas', layout: layoutDefault },
    render: ({ text, accent, tone, layout }) => (
      <Statement
        tone={(tone === 'none' ? 'surface' : (tone as Tone)) as 'surface' | 'canvas' | 'ink'}
        pad={padClass(layout as LayoutValue)}
        vis={visClass(layout as LayoutValue)}
      >
        {accentize(text as string, accent as string)}
      </Statement>
    ),
  },
}

export const config: Config = {
  components: {
    ...headingComponents,
    ...statementComponents,
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
      components: ['Hero', 'FeatureGrid', 'Showcase', 'StatRow', 'Checklist', 'Accordion', 'CallToAction'],
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
