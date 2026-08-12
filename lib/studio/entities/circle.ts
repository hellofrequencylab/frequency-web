// ─────────────────────────────────────────────────────────────────────────────
// THE CIRCLE ENTITY MANIFEST (docs/STUDIO.md §0, ADR-597).
//
// A Circle is an ongoing club: a midweek Meetup, a Weekend Gathering, and an always-on
// Thread, run by one Host for a small group that actually knows each other. This file says
// WHAT a Circle draft contains and how it groups, and nothing about how any of it renders.
//
// It replaces the field list hand-written twice today: once in the four-door wizard
// (components/circles/builder/circle-wizard.tsx) and again, field for field, in the builder
// (components/circles/builder/circle-builder.tsx). One declaration, both surfaces.
//
// STRICT BOUNDARY: entities import from the kernel; the kernel never imports from entities
// (`pnpm check:studio`). Everything below is data plus a few PURE read functions.
//
// The field paths mirror `CircleDraft` (lib/circles/draft.ts) exactly, which is the shape the
// builder's autosave patch is keyed by: the framework fields land on the `circles` row, the
// rich content on its 1:1 `circle_profiles` companion.
//
// NO LEDGER (`verify: 'none'`). Vera's Spark (lib/ai/circle-spark.ts) drafts a starting point
// from the Host's own answers or their own pasted outline; there is no research pipeline and
// no third-party fact to cite, so what the Host writes is what publishes. Nothing here is a
// commercial fact, by design: a Circle has no price, no hours, and no address to gate.
// ─────────────────────────────────────────────────────────────────────────────

import { REPEAT_ITEM_SELF, type EntityManifest, type FieldOption } from '@/lib/studio/kernel/manifest'

/** Render a scalar as display text. Mirrors the kernel's own reader. PURE + total. */
function str(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

/**
 * The four Pillars, as choices. RESTATED, not imported: `PILLAR_SLUGS` lives in lib/pillars.ts,
 * which imports the Supabase admin client at module scope (`getPillars` reads the `pillars`
 * table), and pulling that into a manifest would break the kernel's purity rule. The four are
 * fixed by the naming canon (docs/NAMING.md) and by the `pillars` table's own seed, so the risk
 * of drift is a renamed Pillar, not a new one. Mirrors `PillarSlug` in lib/pillars.ts.
 */
const PILLAR_OPTIONS: readonly FieldOption[] = [
  { value: 'mind', label: 'Mind' },
  { value: 'body', label: 'Body' },
  { value: 'spirit', label: 'Spirit' },
  { value: 'expression', label: 'Expression' },
]

export const CIRCLE_MANIFEST: EntityManifest = {
  entity: 'circle',
  label: 'Circle',

  // No provenance ledger: the Host is the source. Everything they write publishes.
  verify: 'none',

  // The wizard's "upload an outline" door takes a PDF, a Word file, or plain text, and the
  // same screen takes a paste. No URL door (there is nothing to research) and no image door.
  accepts: ['document', 'paste'],

  // Pick a mood, steer with directions, and hold the name and the agreements across a re-seed:
  // the agreements are the group's own norms, so a re-draft must never quietly rewrite them.
  steer: { mood: true, directions: true, lock: ['identity', 'agreements'] },

  sections: [
    { key: 'identity', title: 'Identity', desc: 'The name, the hook, and the lean. What a stranger reads first.' },
    { key: 'pillars', title: 'The four Pillars inside', desc: 'One honest line each for Mind, Body, Spirit, and Expression. Every Circle works the whole person.' },
    { key: 'rhythm', title: 'The standing rhythm', desc: 'The midweek Meetup, the Weekend Gathering, and the Thread that runs between them.' },
    { key: 'shape', title: 'How it runs', desc: 'In person or online, the headcount that works, and the cap.' },
    { key: 'agreements', title: 'Agreements', desc: 'The plain norms of the group, stated once.' },
    { key: 'remix', title: 'Remix and next steps', desc: 'Variations another Host could run, and the Journey you would point members at.' },
  ],

  fields: [
    // ── Identity. The three the wizard actually asks for, plus the slug it derives. ──
    { path: 'name', label: 'Name', kind: 'text', section: 'identity', placement: 'spark', required: true },
    // The Card / one-liner lands in the Circle's About (createBlankCircleDraft: oneLiner ?? identity).
    { path: 'about', label: 'About', kind: 'longtext', section: 'identity', placement: 'spark', prose: true, veraDrafts: true },
    // The lean. The other three Pillars live inside it; a Circle is never sorted by it.
    { path: 'primaryPillar', label: 'Primary Pillar', kind: 'select', section: 'identity', placement: 'spark', options: PILLAR_OPTIONS },
    // Derived from the name at create (uniqueCircleSlug), editable after.
    { path: 'slug', label: 'Handle', kind: 'slug', section: 'identity', omitWhenEmpty: true },

    // ── The four Pillars inside. Content, edited in place on the live Circle. ──
    { path: 'pillarsInside.mind', label: 'Mind', kind: 'text', section: 'pillars', placement: 'inline', veraDrafts: true },
    { path: 'pillarsInside.body', label: 'Body', kind: 'text', section: 'pillars', placement: 'inline', veraDrafts: true },
    { path: 'pillarsInside.spirit', label: 'Spirit', kind: 'text', section: 'pillars', placement: 'inline', veraDrafts: true },
    { path: 'pillarsInside.expression', label: 'Expression', kind: 'text', section: 'pillars', placement: 'inline', veraDrafts: true },

    // ── The standing rhythm. Two named beats, each stored as { text, length }, plus the Thread. ──
    { path: 'meetup.text', label: 'Circle Meetup', kind: 'longtext', section: 'rhythm', placement: 'inline', veraDrafts: true },
    { path: 'meetup.length', label: 'Meetup length', kind: 'duration', section: 'rhythm', omitWhenEmpty: true },
    { path: 'gathering.text', label: 'Weekend Gathering', kind: 'longtext', section: 'rhythm', placement: 'inline', veraDrafts: true },
    { path: 'gathering.length', label: 'Gathering length', kind: 'duration', section: 'rhythm', omitWhenEmpty: true },
    { path: 'thread', label: 'The Thread', kind: 'longtext', section: 'rhythm', placement: 'inline', veraDrafts: true },

    // ── How it runs. In person is the default; the format always names a virtual path. ──
    // Mirrors `CircleDraft['type']` (lib/circles/draft.ts); the labels match the builder's toggle.
    {
      path: 'type',
      label: 'How it meets',
      kind: 'select',
      section: 'shape',
      options: [
        { value: 'in-person', label: 'In person' },
        { value: 'online', label: 'Online' },
      ],
      read: (d) => str(d.type) || 'in-person',
    },
    { path: 'format', label: 'Format', kind: 'longtext', section: 'shape', placement: 'inline', veraDrafts: true },
    { path: 'sizeLabel', label: 'Size', kind: 'text', section: 'shape', placement: 'inline', veraDrafts: true },
    // The hard cap on memberships. Seeded from the size label at create, then edited by hand.
    { path: 'memberCap', label: 'Member cap', kind: 'number', section: 'shape', read: (d) => str(d.memberCap) || '12' },

    // ── The Journey a Host points members at. One Pillar, optional. ──
    { path: 'recommendedJourneyPillar', label: 'Recommended Journey Pillar', kind: 'select', section: 'remix', options: PILLAR_OPTIONS, omitWhenEmpty: true },
  ],

  // The two lists a Host adds to and removes from one row at a time. Each row is its own
  // reviewable, individually-editable line rather than one blob of text.
  //
  // SHAPE NOTE: both are stored as bare `string[]` (lib/circles/draft.ts `asStrArray`), so an item
  // has no named sub-field to point at. `REPEAT_ITEM_SELF` is how the kernel says exactly that
  // (ADR-992): the row reads the item ITSELF and is keyed by the item's own path, `agreements[0]`.
  //
  // This used to declare a made-up sub-key, `text`, which produced `agreements[0].text`: a stable
  // row key that was not a path anything is stored at. Harmless while `verify: 'none'` means no
  // ledger keys anything here, and wrong the first day a Circle grew one. The kernel now models the
  // shape instead of the manifest working around it.
  repeats: [
    {
      arrayPath: 'agreements',
      section: 'agreements',
      itemLabel: (_item, index) => `Agreement ${index + 1}`,
      fields: [{ path: REPEAT_ITEM_SELF, label: 'wording', kind: 'text', placement: 'inline', veraDrafts: true }],
    },
    {
      arrayPath: 'remixOptions',
      section: 'remix',
      itemLabel: (_item, index) => `Remix idea ${index + 1}`,
      fields: [{ path: REPEAT_ITEM_SELF, label: 'wording', kind: 'text', veraDrafts: true }],
    },
  ],
}
