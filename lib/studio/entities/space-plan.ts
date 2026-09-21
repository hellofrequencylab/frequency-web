// ─────────────────────────────────────────────────────────────────────────────
// THE SPACE PLAN MANIFEST (docs/STUDIO.md, ADR-986 · ADR-1386).
//
// A Plan is the working record behind Pencils and Productions. The drawer is a rail
// composed from this declaration: title, notes, links, stage, target. No Spark wizard:
// staff start a Plan from a calendar date or Calendar settings.
//
// STRICT BOUNDARY: entities import from the kernel; the kernel never imports from entities.
// ─────────────────────────────────────────────────────────────────────────────

import type { EntityManifest } from '../kernel/manifest'
import { PLAN_STAGE_DEFS, PLAN_TARGET_DEFS } from '@/lib/calendar/plans'

// Both option sets are the calendar registries' own labels. They were ternaries here, which is how
// the middle stage came to read "Plan" in the manifest and "Planning" on the workflow board.
const STAGE_OPTIONS = PLAN_STAGE_DEFS.map((d) => ({ value: d.stage, label: d.label }))

const TARGET_OPTIONS = PLAN_TARGET_DEFS.map((d) => ({ value: d.kind, label: d.label }))

export const SPACE_PLAN_MANIFEST: EntityManifest = {
  entity: 'space-plan',
  label: 'Plan',
  verify: 'none',
  sections: [
    { key: 'basics', title: 'The Plan', desc: 'The working record behind one or more gatherings.' },
    { key: 'links', title: 'Links', desc: 'Docs and pages the team needs while they plan.' },
  ],
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
      path: 'notes',
      label: 'Notes',
      kind: 'longtext',
      section: 'basics',
      placement: 'rail',
      prose: true,
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
  ],
}
