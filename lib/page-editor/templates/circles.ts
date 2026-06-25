import type { Data } from '@measured/puck'

// The default block layout for the /circles index — the Meetup-style order, rebuilt
// from the standardized Circles blocks. This seeds both the editor (when there's no
// usable draft yet) and the public page (getPublishedData -> getTemplate), so /circles
// is block-based + rearrangeable out of the box; nothing is written to the DB until a
// janitor Publishes a reordered/edited version. Every block reads the live
// CirclesIndexData injected via metadata at render (see components/page-editor/blocks/circles.tsx).
export const data: Data = {
  root: {},
  content: [
    { type: 'CirclesChannelNav', props: { id: 'circles-channel-nav' } },
    { type: 'CirclesToolbar', props: { id: 'circles-toolbar' } },
    { type: 'CirclesMap', props: { id: 'circles-map' } },
    { type: 'CirclesFeatured', props: { id: 'circles-featured', heading: 'Featured circles' } },
    { type: 'CirclesGrid', props: { id: 'circles-grid' } },
    { type: 'CirclesBrowse', props: { id: 'circles-browse' } },
  ],
}
