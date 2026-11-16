// ─────────────────────────────────────────────────────────────────────────────
// THE HUNT ENTITY MANIFEST (FH-013, docs/hunts/CREATOR-FLOW.md, docs/STUDIO.md §0).
//
// A Hunt is a clue trail a resident writes: a name, a hook, an area, three to ten stops in order,
// previewed as a player and then published as an immutable version. This file says WHAT a draft
// contains and how it groups, nothing about how it renders: the creator screens read it through
// the kernel (`sparkFields`, `FieldControl`) like every other entity.
//
// The field paths mirror `TrailDraft` (lib/hunts/draft.ts), the shape the editor saves and the
// publish checklist reads. The resident never edits graph edges: the Trail preset derives them, and
// the Passport preset (FH-030S) derives a count group from one number.
//
// NO LEDGER (`verify: 'none'`): the resident is the source. The clue coach only asks questions
// (docs/hunts/CREATOR-FLOW.md, the same rule as Vera), so nothing here is drafted by a model.
//
// STRICT BOUNDARY: entities import from the kernel; the kernel never imports from entities.
// ─────────────────────────────────────────────────────────────────────────────

import type { EntityManifest, FieldOption } from '@/lib/studio/kernel/manifest'

/** Where a published trail can be found. `private` is the draft state, never chosen. */
const HUNT_PUBLISH_VISIBILITY: readonly FieldOption[] = [
  { value: 'unlisted', label: 'Unlisted (anyone with the link)' },
  { value: 'public', label: 'Public (on the list, after a person looks at it)' },
]

/** FH-030S: how the stops connect. A Trail is in order; a Passport is any order with a number of places to finish. */
const HUNT_SHAPES: readonly FieldOption[] = [
  { value: 'trail', label: 'Trail (stops in order, finish at the last)' },
  { value: 'passport', label: 'Passport (any order, finish after a number of places)' },
]

/**
 * FH-030S: the collections the editor loads for the count rules. `hunt-stops` is the draft's own stops
 * (stop-1, stop-2, ...). `hunt-venues` is the Hunt's own Space plus each partner Space live right now
 * (lib/hunts/store.ts `loadTrail`), so a stop can only name a place that has agreed.
 */
export const HUNT_OPTIONS = { stops: 'hunt-stops', venues: 'hunt-venues' } as const

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
    { key: 'shape', title: 'Shape', desc: 'In order or any order, how many places finish it, and the regions a player can finish on their own.' },
    { key: 'venues', title: 'Partner places', desc: 'The venue whose code a stop uses, and a second place that can stand in for it.' },
    { key: 'publishing', title: 'Publish', desc: 'Where the trail can be found once it is live.' },
  ],
  fields: [
    { path: 'title', label: 'Title', kind: 'text', section: 'identity', placement: 'spark', required: true, editPlane: 'rail' },
    { path: 'hook', label: 'One-line hook', kind: 'text', section: 'identity', placement: 'spark', editPlane: 'rail' },
    { path: 'area', label: 'Area', kind: 'text', section: 'identity', placement: 'spark', editPlane: 'rail' },
    { path: 'audience', label: 'Who it is for', kind: 'text', section: 'identity', placement: 'spark', editPlane: 'rail' },
    { path: 'visibility', label: 'Who can find it', kind: 'select', section: 'publishing', options: HUNT_PUBLISH_VISIBILITY, placement: 'rail' },
    // FH-030S: the shape and the Passport's threshold. lib/hunts/draft.ts `publishRows` turns them into
    // the finish group (`count` with its `min_count`); the resident never edits a group.
    { path: 'shape', label: 'Shape', kind: 'select', section: 'shape', options: HUNT_SHAPES, placement: 'rail' },
    { path: 'finishCount', label: 'Places needed to finish', kind: 'number', section: 'shape', placement: 'rail' },
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
        // FH-020X: staff at the place confirm each visit, so the stop's mission publishes at staff
        // assurance (lib/hunts/draft.ts `publishRows`). A scan alone no longer counts there.
        { path: 'staffConfirmed', label: 'Staff at this place confirm each visit', kind: 'toggle' },
        // FH-020V: the resident's switch for `evidence_policy.hold_for_review` on the stop's placement.
        // It is a plain switch, never a JSON field: lib/hunts/draft.ts `stopEvidencePolicy` is the one
        // place that turns it into the stored key, and it only matters at a stop that staff confirm.
        { path: 'holdForReview', label: 'If staff cannot confirm a visit on the spot, keep it for them to check later', kind: 'toggle' },
      ],
    },
    // FH-030S: where a stop's code sits, and a substitute place that counts the same. Kept apart from the
    // stop fields: a place is a partner agreement, not part of the clue the resident writes.
    {
      arrayPath: 'venues',
      label: 'Partner places',
      over: 'array',
      section: 'venues',
      itemLabel: (item, index) => (typeof item.stop === 'string' && item.stop ? item.stop.replace('stop-', 'Stop ') : `Place ${index + 1}`),
      fields: [
        { path: 'stop', label: 'Stop', kind: 'select', optionsFrom: HUNT_OPTIONS.stops, required: true },
        { path: 'venue', label: 'Venue', kind: 'reference', optionsFrom: HUNT_OPTIONS.venues, required: true },
        { path: 'substitute', label: 'Substitute place (counts the same if the venue closes)', kind: 'reference', optionsFrom: HUNT_OPTIONS.venues },
      ],
    },
    // FH-030S: the regions of a Passport (graph chapters). Each has its own on and off switch.
    {
      arrayPath: 'regions',
      label: 'Regions',
      over: 'array',
      section: 'shape',
      itemLabel: (item, index) => (typeof item.name === 'string' && item.name) || `Region ${index + 1}`,
      fields: [
        { path: 'name', label: 'Region name', kind: 'text', required: true },
        { path: 'enabled', label: 'Open to visits', kind: 'toggle' },
        { path: 'stops', label: 'Stops in this region', kind: 'multiselect', optionsFrom: HUNT_OPTIONS.stops },
      ],
    },
  ],
}
