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
const HUNT_PUBLISH_VISIBILITY: readonly FieldOption[] = [
  { value: 'unlisted', label: 'Unlisted (anyone with the link)' },
  { value: 'public', label: 'Public (on the list, after a person looks at it)' },
]

/** A challenge's fork or stand-in set (lib/hunts/challenges.ts). Empty is none. */
const HUNT_CHALLENGE_GROUPS: readonly FieldOption[] = [
  { value: '', label: 'None' },
  { value: '1', label: 'Set 1' },
  { value: '2', label: 'Set 2' },
  { value: '3', label: 'Set 3' },
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
    { key: 'challenges', title: 'Challenges', desc: 'Optional. A question to answer at a stop, a fork where players pick one stop, or two stops where either one counts.' },
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
        // FH-020X: staff at the place confirm each visit, so the stop's mission publishes at staff
        // assurance (lib/hunts/draft.ts `publishRows`). A scan alone no longer counts there.
        { path: 'staffConfirmed', label: 'Staff at this place confirm each visit', kind: 'toggle' },
        // FH-020V: the resident's switch for `evidence_policy.hold_for_review` on the stop's placement.
        // It is a plain switch, never a JSON field: lib/hunts/draft.ts `stopEvidencePolicy` is the one
        // place that turns it into the stored key, and it only matters at a stop that staff confirm.
        { path: 'holdForReview', label: 'If staff cannot confirm a visit on the spot, keep it for them to check later', kind: 'toggle' },
      ],
    },
    // FH-020Y: a partner venue named per stop, so a Trail no Space runs (a resident's) can still have a
    // stop that staff confirm. Stored as TrailDraft.venues ({ stop, venueSpaceId }) and written as the
    // stop binding's venue_space_id at publish. The choices are the Spaces with a live hunt_partners row
    // for this Hunt (lib/hunts/store.ts loadTrail); publish checks liveness again (publishVenueBlocks).
    {
      arrayPath: 'venues',
      label: 'Partner venues',
      over: 'array',
      section: 'stops',
      itemLabel: (item, index) => (typeof item.stop === 'number' ? `Stop ${item.stop + 1}` : `Venue ${index + 1}`),
      fields: [
        { path: 'stop', label: 'Stop', kind: 'select', required: true, optionsFrom: 'trail-stops' },
        { path: 'venueSpaceId', label: 'Partner venue whose staff confirm visits here', kind: 'select', optionsFrom: 'hunt-partner-venues' },
      ],
    },
    // FH-042S (ADR-1977): the challenges, their own list beside the stops, saved by their own action
    // (app/(main)/hunts/challenge-actions.ts) to hunt_versions.policy.challenges. Each names a stop and
    // publishes onto that stop's mission (lib/hunts/challenges.ts): a Mystery as kind `answer` with only
    // the answer's hash (hashAnswer, lib/hunts/mystery.ts), a fork as hunt_missions.choice_group, a
    // stand-in set as hunt_missions.fallback_group. The plain answer is a write-only field: it is hashed
    // by the action and never read back.
    {
      arrayPath: 'challenges',
      label: 'Challenges',
      over: 'array',
      section: 'challenges',
      itemLabel: (item, index) => (typeof item.stop === 'number' ? `Stop ${item.stop + 1}` : `Challenge ${index + 1}`),
      fields: [
        // The stops of this trail, loaded by the editor (a stop is named by its position).
        { path: 'stop', label: 'Stop', kind: 'select', required: true, optionsFrom: 'trail-stops' },
        { path: 'mystery', label: 'Players answer a question here', kind: 'toggle' },
        { path: 'question', label: 'The question', kind: 'text' },
        { path: 'answer', label: 'The answer (kept scrambled, so leave it blank to keep the one you set)', kind: 'text' },
        { path: 'hint', label: 'Hint after the second wrong try (optional)', kind: 'text' },
        { path: 'fork', label: 'Fork: players pick one stop', kind: 'select', options: HUNT_CHALLENGE_GROUPS },
        { path: 'standIn', label: 'Stand-in: either stop counts', kind: 'select', options: HUNT_CHALLENGE_GROUPS },
      ],
    },
    // FH-036S: what a paid pass for this trail includes. Published with the version as `policy.benefits`
    // (lib/hunts/benefit-codes.ts), which is the only list a pass binding or a store offer may pick from.
    // The editor offers it only while HUNTS_COMMERCE_ENABLED is on; a trail that sells nothing has none.
    {
      arrayPath: 'benefits',
      label: 'Pass benefits',
      over: 'array',
      section: 'publishing',
      itemLabel: (item, index) => (typeof item.label === 'string' && item.label) || `Benefit ${index + 1}`,
      fields: [
        { path: 'label', label: 'What the pass includes', kind: 'text', required: true },
        { path: 'code', label: 'Short code', kind: 'text', required: true },
      ],
    },
  ],
}
