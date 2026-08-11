// ─────────────────────────────────────────────────────────────────────────────
// THE PRACTICE ENTITY MANIFEST (docs/STUDIO.md, ADR-597 · ADR-143/ADR-358).
//
// A Practice is the smallest real thing a person does, and the atom a Journey is built from.
// It is also the entity that proves the kernel bends: it carries no emoji/accent face (it has
// its own lucide icon set), no repeated children, and a long markdown guide that IS the page.
//
// This file is a DECLARATION, the same law as SPACE_MODULES (ADR-553) and PLAYBOOK_REGISTRY
// (ADR-382): it says WHAT a Practice draft contains and how it groups, and nothing about how
// any of it renders. Unlike the Journey, the Spark drafts the WHOLE Practice in one pass
// (there is no arc to fill in later), so almost everything here arrives from Vera at once.
//
// STRICT BOUNDARY: entities import from the kernel; the kernel never imports from entities
// (`pnpm check:studio`). Everything below is data plus a few PURE read functions.
//
// FIELD PATHS mirror what is really persisted:
//   * `practices` columns (lib/practices.ts `Practice` + `PracticeEdit`): title, summary,
//     description, body, cadence, duration_min, duration_locked, timer_kind, movement_config,
//     mindless_mode, warmup_message, warmup_sec, category, icon, header_image, domain_id,
//     focus_details, subcategory_id, weight_class, reward_zaps, reward_note, is_public,
//     is_template, status, slug.
//   * `tags` is the practice_tags join, written through setPracticeTags and read back as the
//     label list the builder edits.
//   * `answers.*` is the CREATION payload (createPracticeFromSparkAction / PracticeSparkAnswers),
//     not columns: `answers.cadence` lands on `cadence` and `answers.pace` on `duration_min`.
//     They are declared because they are what the Spark actually asks and what a re-draft reads.
//
// NO LEDGER: a Practice is the author's own work, so `verify: 'none'` and nothing is flagged
// `commercial` (the kernel rejects a commercial field under verify:'none', by design). The Zap
// fields below are reward tuning, not a price.
// ─────────────────────────────────────────────────────────────────────────────

import type { EntityManifest } from '@/lib/studio/kernel/manifest'

/** Render a scalar as display text. Mirrors the kernel's own reader. PURE + total. */
function str(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

// ── Closed option sets ───────────────────────────────────────────────────────────────────
// RESTATED, not imported. lib/practices.ts exports TIMER_KINDS, MINDLESS_MODES and
// WEIGHT_CLASSES, but it opens with the Supabase admin client, and the CATEGORIES list lives in
// a 'use client' builder; importing either would end this file's purity. Each set names the file
// it mirrors, so a drift is a one-line fix in one place.
//
// The four Pillars are deliberately NOT restated here: `domain_id` stores a `pillars` row id, so
// it has to be loaded, which is what `optionsFrom` is for.

/** Which timer a Practice opens. Mirrors TIMER_KINDS (lib/practices.ts). Labels follow the
 *  naming canon: Mindless is THE timer, and `Be Still` / `Get Moving` are its two modes, so the
 *  shipped builder's stale "Mindless" button label is corrected here. */
const TIMER_KINDS = [
  { value: 'mindless', label: 'Be Still' },
  { value: 'movement', label: 'Get Moving' },
  { value: 'none', label: 'Log it' },
] as const

/** The Be Still flavours. Mirrors MINDLESS_MODES (lib/practices.ts) with the builder's labels. */
const BE_STILL_MODES = [
  { value: 'meditate', label: 'Meditate' },
  { value: 'breathe', label: 'Breathe' },
  { value: 'stillness', label: 'Stillness' },
  { value: 'ritual', label: 'Ritual' },
  { value: 'journal', label: 'Journal' },
  { value: 'log', label: 'Just Log' },
] as const

export const PRACTICE_MANIFEST: EntityManifest = {
  entity: 'practice',
  label: 'Practice',

  // No provenance ledger: the author writes their own practice, so what they wrote publishes.
  verify: 'none',

  // What the first screen SHOULD take. Paste is wired today (the "already written it?" door);
  // a written practice just as often arrives as a PDF or a Word file, and the Journey Spark
  // already runs that extraction, so declaring `document` is the gap this closes.
  accepts: ['document', 'paste'],

  // Pick a mood, steer with directions, and pin the guide across a re-draft so a second pass
  // never overwrites the steps the author rewrote by hand.
  steer: { mood: true, directions: true, lock: ['content'] },

  sections: [
    { key: 'brief', title: 'The brief', desc: 'What Vera asks before she drafts. Who it is for, the act, and how often it is done.' },
    { key: 'identity', title: 'Identity', desc: 'The name and the face people see on the card.' },
    { key: 'content', title: 'The practice', desc: 'The hook, the description, and the guide people actually follow.' },
    { key: 'pillars', title: 'Pillars and tags', desc: 'Where it sits across the four Pillars, and how people browse to it.' },
    { key: 'shape', title: 'Cadence and length', desc: 'How often it is done, and how long one session takes.' },
    { key: 'timer', title: 'How it is done', desc: 'The timer it opens, its tuning, and the warm-up before it starts.' },
    { key: 'rewards', title: 'Rewards', desc: 'What one log is worth. The override is for admins.' },
    { key: 'publishing', title: 'Publishing', desc: 'Who can see it, and where it stands with the Hosts.' },
  ],

  fields: [
    // ── The brief. The five guided questions. ──
    // Only `title` is genuinely required: the paste door skips these questions entirely, and the
    // action redirects on an empty title and on nothing else.
    { path: 'answers.who', label: 'Who it is for', kind: 'longtext', section: 'brief', placement: 'spark' },
    { path: 'answers.act', label: 'What they actually do', kind: 'longtext', section: 'brief', placement: 'spark' },
    { path: 'answers.outcome', label: 'What they walk away with', kind: 'longtext', section: 'brief', placement: 'spark' },
    // The `cadence` control owns its own set, so this needs no options. Note the value space: the
    // Spark hint is 'daily' | 'few-times-week' | 'weekly' (`PracticeCadenceHint`), which the create
    // action writes to the `cadence` column as its label ('Daily', 'A few times a week', 'Weekly').
    { path: 'answers.cadence', label: 'How often', kind: 'cadence', section: 'brief', placement: 'spark', read: (d) => str((d.answers as Record<string, unknown> | undefined)?.cadence) || 'daily' },
    // Pace is the session ask; it lands on the row as duration_min. Mirrors `PracticePace`
    // (lib/ai/practice-spark.ts); the hints beside each choice are the Spark's own wording.
    {
      path: 'answers.pace',
      label: 'Time a session',
      kind: 'select',
      section: 'brief',
      placement: 'spark',
      options: [
        { value: 'light', label: 'Light, five minutes or less' },
        { value: 'medium', label: 'Medium, ten to twenty minutes' },
      ],
      read: (d) => str((d.answers as Record<string, unknown> | undefined)?.pace) || 'light',
    },

    // ── Identity. A Practice wears a lucide icon, not an emoji and accent. ──
    { path: 'title', label: 'Name', kind: 'text', section: 'identity', placement: 'inline', required: true, veraDrafts: true },
    { path: 'icon', label: 'Icon', kind: 'icon', section: 'identity', read: (d) => str(d.icon) || 'sparkles' },
    { path: 'header_image', label: 'Header image', kind: 'image', section: 'identity', omitWhenEmpty: true },
    { path: 'slug', label: 'Slug', kind: 'slug', section: 'identity', omitWhenEmpty: true },

    // ── The practice itself. All three are content that IS the page, so they edit in place. ──
    { path: 'summary', label: 'Card hook', kind: 'text', section: 'content', placement: 'inline', prose: true, veraDrafts: true },
    { path: 'description', label: 'Short description', kind: 'longtext', section: 'content', placement: 'inline', prose: true, veraDrafts: true },
    { path: 'body', label: 'The guide', kind: 'longtext', section: 'content', placement: 'inline', prose: true, veraDrafts: true },

    // ── Pillars and tags ──
    // The PRIMARY Pillar (pillars.id). Mirrors the first key of focus_details; a Practice may
    // develop more than one Pillar, which is what focus_details below holds.
    // A pointer to a `pillars` row, stored as its id and shown as its name, so it must be loaded.
    { path: 'domain_id', label: 'Pillar', kind: 'reference', section: 'pillars', veraDrafts: true, optionsFrom: 'pillars' },
    // A MAP keyed by Pillar id, each holding the author's instructions and timing for that
    // Pillar. Not an array, so it cannot expand as a repeat; the read reports the coverage.
    {
      path: 'focus_details',
      label: 'Per-Pillar instructions',
      kind: 'longtext',
      section: 'pillars',
      omitWhenEmpty: true,
      read: (d) => {
        const fd = d.focus_details
        if (!fd || typeof fd !== 'object') return ''
        const n = Object.keys(fd as Record<string, unknown>).length
        return n ? `${n} ${n === 1 ? 'Pillar' : 'Pillars'} with their own instructions` : ''
      },
    },
    // A pointer to a `practice_subcategories` row. The surface loads the ones under the Pillar.
    { path: 'subcategory_id', label: 'Sub focus', kind: 'reference', section: 'pillars', omitWhenEmpty: true, optionsFrom: 'practice-subcategories' },
    // The values are Channel slugs. Mirrors the CATEGORIES list in the Practice builder (six of
    // the seven Channels; Activism is not offered there), with the canon's Channel names.
    {
      path: 'category',
      label: 'Category',
      kind: 'select',
      section: 'pillars',
      omitWhenEmpty: true,
      options: [
        { value: 'movement', label: 'Movement' },
        { value: 'holistic-health', label: 'Holistic Health' },
        { value: 'spirituality', label: 'Spirituality' },
        { value: 'creative', label: 'Creative' },
        { value: 'business-support', label: 'Business Support' },
        { value: 'human-relating', label: 'Human Relating' },
      ],
    },
    { path: 'tags', label: 'Tags', kind: 'tags', section: 'pillars', omitWhenEmpty: true },

    // ── Cadence and length ──
    { path: 'cadence', label: 'Cadence', kind: 'cadence', section: 'shape', veraDrafts: true, read: (d) => str(d.cadence) || 'Daily' },
    { path: 'duration_min', label: 'Session length', kind: 'duration', section: 'shape', veraDrafts: true, omitWhenEmpty: true },
    { path: 'duration_locked', label: 'Fixed length', kind: 'toggle', section: 'shape', veraDrafts: false },

    // ── How it is done. The timer the practice routes to, plus its tuning. ──
    // 'none' is a one-tap Log it, 'mindless' opens Be Still, 'movement' opens Get Moving.
    // The column default is 'mindless'.
    { path: 'timer_kind', label: 'How it is done', kind: 'select', section: 'timer', veraDrafts: false, options: TIMER_KINDS, read: (d) => str(d.timer_kind) || 'mindless' },
    // A nested config object (mode plus per-mode tuning), read here as its mode.
    {
      path: 'movement_config',
      label: 'Get Moving setup',
      kind: 'text',
      section: 'timer',
      veraDrafts: false,
      omitWhenEmpty: true,
      read: (d) => str((d.movement_config as Record<string, unknown> | null | undefined)?.mode),
    },
    // The Be Still flavour: Meditate, Breathe, Journal, Stillness, Ritual, or Just Log. Empty
    // means derive it from the Pillar at read time.
    { path: 'mindless_mode', label: 'Be Still mode', kind: 'select', section: 'timer', veraDrafts: false, omitWhenEmpty: true, options: BE_STILL_MODES },
    { path: 'warmup_message', label: 'Warm-up message', kind: 'longtext', section: 'timer', prose: true, omitWhenEmpty: true },
    { path: 'warmup_sec', label: 'Warm-up length', kind: 'duration', section: 'timer', veraDrafts: false, omitWhenEmpty: true },

    // ── Rewards. Effort is the author's call; the explicit Zap value is an admin override. ──
    // Mirrors WEIGHT_CLASSES (lib/practices.ts). The Zap figures are the current defaults, tunable
    // in zap_config, so they read as a starting point and never as a promise.
    {
      path: 'weight_class',
      label: 'Effort',
      kind: 'select',
      section: 'rewards',
      veraDrafts: false,
      options: [
        { value: 'light', label: 'Light' },
        { value: 'standard', label: 'Standard' },
        { value: 'heavy', label: 'Heavy' },
      ],
      read: (d) => str(d.weight_class) || 'standard',
    },
    { path: 'reward_zaps', label: 'Zap override', kind: 'number', section: 'rewards', veraDrafts: false, omitWhenEmpty: true },
    { path: 'reward_note', label: 'Reward note', kind: 'text', section: 'rewards', veraDrafts: false, omitWhenEmpty: true },

    // ── Publishing. A Crew draft waits for a Host; a Host or staff author is live at birth. ──
    { path: 'is_public', label: 'In the library', kind: 'toggle', section: 'publishing', veraDrafts: false },
    // Mirrors the `practices.status` values (lib/practices.ts): empty or draft until it is
    // proposed, then pending, then approved or rejected.
    {
      path: 'status',
      label: 'Review state',
      kind: 'select',
      section: 'publishing',
      veraDrafts: false,
      omitWhenEmpty: true,
      options: [
        { value: 'draft', label: 'Draft' },
        { value: 'pending', label: 'In review' },
        { value: 'approved', label: 'Approved' },
        { value: 'rejected', label: 'Needs changes' },
      ],
    },
    { path: 'is_template', label: 'Starter practice', kind: 'toggle', section: 'publishing', veraDrafts: false },
  ],

  // No repeats: a Practice is an atom. Its only many-valued shapes are `tags` (a flat list, the
  // `tags` kind) and `focus_details` (a keyed map, not an array), and neither is a child with
  // its own reviewable per-item fields.
}
