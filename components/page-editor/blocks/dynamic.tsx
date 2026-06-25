import type { ComponentConfig } from '@measured/puck'
import {
  LiveStatsBlock,
  LiveEventsBlock,
  LivePostsBlock,
  type LiveData,
} from '@/components/marketing/blocks'
import { layoutField, layoutDefault, padClass, visClass, type LayoutValue } from '@/lib/page-editor/layout'

// ── Dynamic blocks ────────────────────────────────────────────────────────────
// Sections backed by LIVE platform data (member/circle/event counts, upcoming
// events, recent community posts), injected at render time via Puck metadata
// (`puck.metadata.live`, populated in app/page.tsx + the public renderer). They
// render nothing when there's no data, so they're safe to drop on any page.
// The presentational components live in components/marketing/blocks.tsx; this is
// just the editor/render config wrapper.

export const dynamicComponents: Record<string, ComponentConfig> = {
  LiveStats: {
    label: 'Live stat counts',
    fields: { eyebrow: { type: 'textarea' }, heading: { type: 'textarea' }, layout: layoutField },
    defaultProps: { eyebrow: 'Not a someday idea', heading: 'It’s already happening.', layout: layoutDefault },
    render: ({ eyebrow, heading, layout, puck }) => (
      <LiveStatsBlock
        eyebrow={eyebrow || undefined}
        heading={heading || undefined}
        pad={padClass(layout as LayoutValue)}
        vis={visClass(layout as LayoutValue)}
        live={(puck?.metadata?.live as LiveData) || undefined}
      />
    ),
  },

  LiveEvents: {
    label: 'Upcoming events (live)',
    fields: { layout: layoutField },
    defaultProps: { layout: layoutDefault },
    render: ({ layout, puck }) => (
      <LiveEventsBlock
        pad={padClass(layout as LayoutValue)}
        vis={visClass(layout as LayoutValue)}
        live={(puck?.metadata?.live as LiveData) || undefined}
      />
    ),
  },

  LivePosts: {
    label: 'Community posts (live)',
    fields: { heading: { type: 'textarea' }, layout: layoutField },
    defaultProps: { heading: 'People showing up for each other', layout: layoutDefault },
    render: ({ heading, layout, puck }) => (
      <LivePostsBlock
        heading={heading || undefined}
        pad={padClass(layout as LayoutValue)}
        vis={visClass(layout as LayoutValue)}
        live={(puck?.metadata?.live as LiveData) || undefined}
      />
    ),
  },
}
