// ─────────────────────────────────────────────────────────────────────────────
// THE HUNT ENTITY MANIFEST (FH-013, docs/hunts/CREATOR-FLOW.md, docs/STUDIO.md §0).
//
// A Hunt is a clue trail a resident writes: a name, a hook, an area, three to ten stops in order,
// previewed as a player and then published as an immutable version. This file says WHAT a draft
// contains and how it groups, nothing about how it renders: the creator screens read it through
// the kernel (`sparkFields`, `FieldControl`) like every other entity.
//
// The field paths mirror `TrailDraft` (lib/hunts/draft.ts), the shape the editor saves and the
// publish checklist reads. The resident never edits graph edges: the Trail preset derives them.
//
// NO LEDGER (`verify: 'none'`): the resident is the source. The clue coach only asks questions
// (docs/hunts/CREATOR-FLOW.md, the same rule as Vera), so nothing here is drafted by a model.
//
// STRICT BOUNDARY: entities import from the kernel; the kernel never imports from entities.
// ─────────────────────────────────────────────────────────────────────────────

import type { EntityManifest, FieldOption } from '@/lib/studio/kernel/manifest'

/** Where a published trail can be found. `private` is the draft state, never chosen. */
export const HUNT_PUBLISH_VISIBILITY: readonly FieldOption[] = [
  { value: 'unlisted', label: 'Unlisted (anyone with the link)' },
  { value: 'public', label: 'Public (on the list, after a person looks at it)' },
]

export const HUNT_MANIFEST: EntityManifest = {
  entity: 'hunt',
  label: 'Hunt',
  verify: 'none',
  // The stops step takes a pasted list (one stop per line, the clue after a colon). No URL, no
  // document and no image door: there is nothing to research and no flyer to read.
  accepts: ['paste'],
  // The mood dial is the kernel's (owner decision: every wizard entity has it). The creator screens
  // do not draft clues with a model, so nothing reads it yet; it is declared for the day a coach does.
  steer: { mood: true },
  sections: [
    { key: 'identity', title: 'Name it', desc: 'The title, the one-line hook, the area and who it is for.' },
    { key: 'stops', title: 'Stops', desc: 'Three to ten stops in order. Each one has a place, a clue and a way to prove the visit.' },
    { key: 'publishing', title: 'Publish', desc: 'Where the trail can be found once it is live.' },
  ],
  fields: [
    { path: 'title', label: 'Title', kind: 'text', section: 'identity', placement: 'spark', required: true, editPlane: 'rail' },
    { path: 'hook', label: 'One-line hook', kind: 'text', section: 'identity', placement: 'spark', editPlane: 'rail' },
    { path: 'area', label: 'Area', kind: 'text', section: 'identity', placement: 'spark', editPlane: 'rail' },
    { path: 'audience', label: 'Who it is for', kind: 'text', section: 'identity', placement: 'spark', editPlane: 'rail' },
    { path: 'visibility', label: 'Who can find it', kind: 'select', section: 'publishing', options: HUNT_PUBLISH_VISIBILITY, placement: 'rail' },
  ],
  repeats: [
    {
      arrayPath: 'stops',
      label: 'Stops',
      over: 'array',
      section: 'stops',
      itemLabel: (item, index) => (typeof item.place === 'string' && item.place) || `Stop ${index + 1}`,
      fields: [
        { path: 'place', label: 'Place', kind: 'text', required: true },
        { path: 'clue', label: 'Clue', kind: 'longtext', required: true, prose: true },
        { path: 'hint', label: 'Hint (optional)', kind: 'text' },
        { path: 'placementReady', label: 'A code is printed or placed here', kind: 'toggle' },
      ],
    },
  ],
}
