// ─────────────────────────────────────────────────────────────────────────────
// THE SPACE PLAN MANIFEST (docs/STUDIO.md, ADR-986 · ADR-1386).
//
// A Plan is the working record behind Pencils and Productions. The drawer is a rail
// composed from this declaration: title, notes, links, images, stage, target. No Spark wizard:
// staff start a Plan from a calendar date or Calendar settings.
//
// STRICT BOUNDARY: entities import from the kernel; the kernel never imports from entities.
// ─────────────────────────────────────────────────────────────────────────────

import { REPEAT_ITEM_SELF, type EntityManifest } from '../kernel/manifest'
import { PLAN_STAGES, PLAN_TARGETS, planStageLabel } from '@/lib/calendar/plans'

// The stage WORD is the calendar registry's, through planStageLabel: the picker in this drawer and
// the chip on the grid are the same stage, so they are the same word (LIVE-470).
const STAGE_OPTIONS = PLAN_STAGES.map((value) => ({ value, label: planStageLabel(value) }))

const TARGET_OPTIONS = PLAN_TARGETS.map((value) => ({
  value,
  label:
    value === 'event'
      ? 'Event'
      : value === 'journey'
        ? 'Journey'
        : value === 'program'
          ? 'Program'
          : 'Maintenance',
}))

export const SPACE_PLAN_MANIFEST: EntityManifest = {
  entity: 'space-plan',
  label: 'Plan',
  verify: 'none',
  sections: [
    { key: 'basics', title: 'The Plan', desc: 'The working record behind one or more gatherings.' },
    { key: 'links', title: 'Links', desc: 'Docs and pages the team needs while they plan.' },
    { key: 'files', title: 'Images', desc: 'Pictures from the Loom that belong with this Plan.' },
  ],
  // Field ORDER is the drawer's order (PROG-CAL2 composes the drawer from this). Owner ruling
  // 2026-09-22: the two short selects sit under Title, side by side; the long Notes box last.
  fields: [
    {
      path: 'title',
      label: 'Title',
      kind: 'text',
      section: 'basics',
      required: true,
      placement: 'spark',
      editPlane: 'rail',
    },
    {
      path: 'stage',
      label: 'Stage',
      kind: 'select',
      section: 'basics',
      options: STAGE_OPTIONS,
      placement: 'rail',
    },
    {
      path: 'targetKind',
      label: 'Production opens',
      kind: 'select',
      section: 'basics',
      options: TARGET_OPTIONS,
      placement: 'rail',
    },
    {
      path: 'notes',
      label: 'Notes',
      kind: 'longtext',
      section: 'basics',
      placement: 'rail',
      prose: true,
    },
  ],
  repeats: [
    {
      arrayPath: 'links',
      label: 'Links',
      over: 'array',
      section: 'links',
      itemLabel: (item, index) => (typeof item.label === 'string' && item.label) || `Link ${index + 1}`,
      fields: [
        { path: 'url', label: 'URL', kind: 'url' },
        { path: 'label', label: 'Label', kind: 'text' },
      ],
    },
    // WHAT A PLAN CAN HOLD BESIDES WORDS (PROG-CAL14). PROG-CAL2 promised notes, links and files
    // and shipped the first two; this is the third, through the seam that row named: the item is a
    // REFERENCE to a Loom asset, so the picture rides the library every other image rides and the
    // Loom can see the Plan before anyone retires that asset. No new bucket, no new upload path.
    //
    // OWNER RULING 2026-09-22, and the label says it rather than hiding it: the Loom picker is
    // image-only, so this holds IMAGES and is called Images. A document goes in Links, where a
    // link to a document has always worked.
    {
      arrayPath: 'files',
      label: 'Images',
      over: 'array',
      section: 'files',
      itemLabel: (_item, index) => `Image ${index + 1}`,
      fields: [{ path: REPEAT_ITEM_SELF, label: 'Image', kind: 'asset' }],
    },
  ],
}
