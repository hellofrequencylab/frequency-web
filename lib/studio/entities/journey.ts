// ─────────────────────────────────────────────────────────────────────────────
// THE JOURNEY ENTITY MANIFEST (docs/STUDIO.md, ADR-597 · ADR-142/ADR-302).
//
// The Journey is the Studio's oldest wizard and the one every other builder was copied from,
// so declaring it here is the moment the copying stops: the Spark's five questions, the
// identity the author reviews, the weekly arc, and the whole Settings panel become ONE list
// that creation and editing both read (the ADR-450 `placement` seam).
//
// This file is a DECLARATION, the same law as SPACE_MODULES (ADR-553) and PLAYBOOK_REGISTRY
// (ADR-382): it says WHAT a Journey draft contains and how it groups, and nothing about how
// any of it renders. It replaces nothing yet; it is what `components/journey/v2/journey-spark.tsx`
// and `journey-settings.tsx` should be re-derived from.
//
// STRICT BOUNDARY: entities import from the kernel; the kernel never imports from entities
// (`pnpm check:studio`). Everything below is data plus a few PURE read functions.
//
// FIELD PATHS mirror what is really persisted:
//   * `journey_plans` columns (lib/journey-plans.ts `JourneyPlan` + the ADR-302 attribute
//     migration): title, summary, intro, emoji, accent, cover_image, difficulty, category,
//     tags, daily_minutes, enroll_cap, completion_gems, drip_interval_days,
//     certificate_enabled, visibility, status, official, source_overview.
//   * the `meeting` jsonb (JourneyMeeting): the FLAT fields are the Circle Meetup, the nested
//     `gathering` is the Weekend Gathering. Both normalize through normalizeJourneyMeeting.
//   * `answers.*` and `arc[]` are the CREATION payload (createJourneyFromSparkAction), not
//     columns: `answers.weeks` materializes as the number of Phase rows, `answers.pace` as
//     `daily_minutes`, and each `arc[i]` as one `journey_plan_items` row with
//     block_type='phase' (title "Week N: <title>", body = focus). They are declared because
//     they are what the Spark actually asks and what a re-seed actually re-reads.
//
// NO LEDGER: a Journey is the author's own work, so `verify: 'none'` and nothing is flagged
// `commercial` (the kernel rejects a commercial field under verify:'none', by design).
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
// RESTATED, not imported. Every one of these lives in a module that would drag server-only or
// client-only code into what has to stay a pure declaration: lib/journey-plans.ts opens with
// the Supabase admin client, lib/ai/journey-spark.ts pulls the Anthropic SDK, and
// components/journey/v2/journey-settings.tsx is a 'use client' component. Each set names the
// file it mirrors so a drift is a one-line fix in one place.

/** How a touchpoint meets. Mirrors `JourneyTouchpoint['format']` (lib/journey-plans.ts) and the
 *  MEETING_FORMATS chips shared by the Spark and the Settings panel. Used by both touchpoints. */
const MEETING_FORMATS = [
  { value: 'virtual', label: 'Virtual' },
  { value: 'in_person', label: 'In person' },
  { value: 'hybrid', label: 'Hybrid' },
] as const

export const JOURNEY_MANIFEST: EntityManifest = {
  entity: 'journey',
  label: 'Journey',

  // No provenance ledger: the author writes their own course, so what they wrote publishes.
  verify: 'none',

  // The Spark's second door: paste your course write-up, or upload it as PDF / Word / text
  // (extractOverviewAction). No URL fetch and no photo import on this entity today.
  accepts: ['document', 'paste'],

  // Pick a mood, steer with directions, and pin the identity + the arc across a re-seed so a
  // second pass never overwrites the name and the weeks the author already settled.
  steer: { mood: true, directions: true, lock: ['identity', 'arc'] },

  sections: [
    { key: 'brief', title: 'The brief', desc: 'What Vera asks before she drafts. Who it is for, what it covers, and how long it runs.' },
    { key: 'identity', title: 'Identity', desc: 'The name and the face. What people see first on the card.' },
    { key: 'story', title: 'Promise and overview', desc: 'The one line and the write-up that say what this is and who it is for.' },
    { key: 'arc', title: 'The weekly arc', desc: 'One Phase per week, in order. Each week builds on the one before it.' },
    { key: 'discovery', title: 'Discovery', desc: 'How people find it, and what it asks of them each day.' },
    { key: 'delivery', title: 'Delivery and rewards', desc: 'How the weeks unlock, and what finishing is worth.' },
    { key: 'meetup', title: 'Circle Meetup', desc: 'The mid-week check-in where the Circle keeps the Journey on track.' },
    { key: 'gathering', title: 'Weekend Gathering', desc: 'The weekend get-together. The group decides what it is for.' },
    { key: 'publishing', title: 'Publishing', desc: 'Who can see it, and where it stands with the Guides.' },
  ],

  fields: [
    // ── The brief. The five guided questions, plus the outline an author can bring instead. ──
    // Only `title` is genuinely required: the outline door skips these questions entirely, and
    // the action redirects on an empty title and on nothing else.
    { path: 'answers.who', label: 'Who it is for', kind: 'longtext', section: 'brief', placement: 'spark' },
    { path: 'answers.topic', label: 'What it is about', kind: 'longtext', section: 'brief', placement: 'spark' },
    { path: 'answers.outcome', label: 'What people walk away with', kind: 'longtext', section: 'brief', placement: 'spark' },
    // Weeks becomes the number of Phase rows. Four is the default shape when the author leaves it open.
    { path: 'answers.weeks', label: 'How many weeks', kind: 'number', section: 'brief', placement: 'spark', read: (d) => str((d.answers as Record<string, unknown> | undefined)?.weeks) || '4' },
    // Pace is the daily ask; it lands on the row as daily_minutes (5 or 15). Mirrors `JourneyPace`
    // (lib/ai/journey-spark.ts); the hints beside each choice are the Spark's own wording.
    {
      path: 'answers.pace',
      label: 'Time a day',
      kind: 'select',
      section: 'brief',
      placement: 'spark',
      options: [
        { value: 'light', label: 'Light, a few minutes' },
        { value: 'medium', label: 'Medium, ten to twenty minutes' },
      ],
      read: (d) => str((d.answers as Record<string, unknown> | undefined)?.pace) || 'light',
    },
    // The author's own outline, kept on the row so Vera can re-read it when filling later weeks.
    // Given on the first screen but held as reference, not asked as a question, so it sits in the rail.
    { path: 'source_overview', label: 'Your own outline', kind: 'longtext', section: 'brief', omitWhenEmpty: true, veraDrafts: false },

    // ── Identity ──
    { path: 'title', label: 'Name', kind: 'text', section: 'identity', placement: 'inline', required: true, veraDrafts: true },
    // Despite the column name, this stores an ICON key (lib/studio/journey-icons.ts), e.g. 'compass'.
    { path: 'emoji', label: 'Icon', kind: 'icon', section: 'identity', read: (d) => str(d.emoji) || 'compass' },
    // An accent TOKEN name, not a hex (lib/studio/accents.ts). The `color` control offers swatches.
    { path: 'accent', label: 'Accent', kind: 'color', section: 'identity', omitWhenEmpty: true },
    { path: 'cover_image', label: 'Cover image', kind: 'image', section: 'identity', omitWhenEmpty: true },
    { path: 'slug', label: 'Slug', kind: 'slug', section: 'identity', omitWhenEmpty: true },

    // ── Promise and overview. The content that IS the page, so it edits in place. ──
    { path: 'summary', label: 'One-line promise', kind: 'text', section: 'story', placement: 'inline', prose: true, veraDrafts: true },
    { path: 'intro', label: 'Overview', kind: 'longtext', section: 'story', placement: 'inline', prose: true, veraDrafts: true },

    // ── Discovery ──
    // Mirrors `SparkSettings['difficulty']` (lib/ai/journey-spark.ts) and the DIFFICULTIES chips
    // in components/journey/v2/journey-settings.tsx.
    {
      path: 'difficulty',
      label: 'Difficulty',
      kind: 'select',
      section: 'discovery',
      omitWhenEmpty: true,
      options: [
        { value: 'gentle', label: 'Gentle' },
        { value: 'standard', label: 'Standard' },
        { value: 'deep', label: 'Deep' },
      ],
    },
    { path: 'category', label: 'Category', kind: 'text', section: 'discovery', omitWhenEmpty: true },
    { path: 'tags', label: 'Tags', kind: 'tags', section: 'discovery', omitWhenEmpty: true },
    { path: 'daily_minutes', label: 'Minutes a day', kind: 'duration', section: 'discovery', omitWhenEmpty: true },
    { path: 'enroll_cap', label: 'Max people', kind: 'number', section: 'discovery', omitWhenEmpty: true, veraDrafts: false },

    // ── Delivery and rewards. Column defaults: 30 Gems, a 7 day drip, no certificate. ──
    { path: 'completion_gems', label: 'Completion Gems', kind: 'number', section: 'delivery', veraDrafts: false, read: (d) => str(d.completion_gems) || '30' },
    { path: 'drip_interval_days', label: 'Days between Phases', kind: 'number', section: 'delivery', veraDrafts: false, read: (d) => str(d.drip_interval_days) || '7' },
    { path: 'certificate_enabled', label: 'Certificate', kind: 'toggle', section: 'delivery', veraDrafts: false },
    // The play window is two columns (window_starts_at / window_ends_at) read as one range, the
    // way the rating is composed on the Business manifest. Empty on an always-open Journey.
    {
      path: 'window_starts_at',
      label: 'Open dates',
      kind: 'daterange',
      section: 'delivery',
      veraDrafts: false,
      omitWhenEmpty: true,
      read: (d) => [str(d.window_starts_at), str(d.window_ends_at)].filter(Boolean).join(' to '),
    },

    // ── Circle Meetup. The FLAT meeting fields (kept flat for rows that predate touchpoints). ──
    { path: 'meeting.format', label: 'Format', kind: 'select', section: 'meetup', veraDrafts: false, options: MEETING_FORMATS },
    { path: 'meeting.schedule', label: 'When it meets', kind: 'text', section: 'meetup', veraDrafts: false },
    { path: 'meeting.timezone', label: 'Timezone', kind: 'text', section: 'meetup', veraDrafts: false },
    { path: 'meeting.location', label: 'Where it meets', kind: 'place', section: 'meetup', veraDrafts: false },
    { path: 'meeting.link', label: 'Join link', kind: 'url', section: 'meetup', veraDrafts: false },
    { path: 'meeting.notes', label: 'Notes', kind: 'longtext', section: 'meetup', omitWhenEmpty: true },
    // A pointer to an `events` row, stored as its id and shown as its name. The surface loads the
    // Circle's Events; the manifest only names the collection.
    { path: 'meeting.eventId', label: 'Linked Event', kind: 'reference', section: 'meetup', veraDrafts: false, omitWhenEmpty: true, optionsFrom: 'events' },

    // ── Weekend Gathering. The nested touchpoint; null until the author touches it, so every
    //    row drops out of the board while it is unset. ──
    { path: 'meeting.gathering.format', label: 'Format', kind: 'select', section: 'gathering', veraDrafts: false, omitWhenEmpty: true, options: MEETING_FORMATS },
    { path: 'meeting.gathering.schedule', label: 'When it meets', kind: 'text', section: 'gathering', veraDrafts: false, omitWhenEmpty: true },
    { path: 'meeting.gathering.timezone', label: 'Timezone', kind: 'text', section: 'gathering', veraDrafts: false, omitWhenEmpty: true },
    { path: 'meeting.gathering.location', label: 'Where it meets', kind: 'place', section: 'gathering', veraDrafts: false, omitWhenEmpty: true },
    { path: 'meeting.gathering.link', label: 'Join link', kind: 'url', section: 'gathering', veraDrafts: false, omitWhenEmpty: true },
    { path: 'meeting.gathering.notes', label: 'Notes', kind: 'longtext', section: 'gathering', omitWhenEmpty: true },
    { path: 'meeting.gathering.eventId', label: 'Linked Event', kind: 'reference', section: 'gathering', veraDrafts: false, omitWhenEmpty: true, optionsFrom: 'events' },

    // ── Publishing. createPlan births every Journey private; a Guide clears the rest. ──
    // Both sets mirror `PlanVisibility` and `PlanStatus` (lib/journey-plans.ts); the visibility
    // labels are the ones the Settings panel already shows.
    {
      path: 'visibility',
      label: 'Who can see it',
      kind: 'select',
      section: 'publishing',
      veraDrafts: false,
      options: [
        { value: 'private', label: 'Just me' },
        { value: 'unlisted', label: 'Anyone with the link' },
        { value: 'public', label: 'Community library' },
      ],
      read: (d) => str(d.visibility) || 'private',
    },
    {
      path: 'status',
      label: 'Review state',
      kind: 'select',
      section: 'publishing',
      veraDrafts: false,
      options: [
        { value: 'draft', label: 'Draft' },
        { value: 'pending', label: 'In review' },
        { value: 'approved', label: 'Approved' },
        { value: 'rejected', label: 'Needs changes' },
      ],
    },
    { path: 'official', label: 'Official Journey', kind: 'toggle', section: 'publishing', veraDrafts: false },
  ],

  // The weekly arc is the one genuine repeated child: each week is drafted, edited, and
  // committed on its own, and each becomes its own Phase row. Expanding it here is what lets a
  // week be re-drafted without touching its siblings.
  repeats: [
    {
      arrayPath: 'arc',
      section: 'arc',
      itemLabel: (item, index) => {
        const title = str(item.title)
        return title ? `Week ${index + 1}: ${title}` : `Week ${index + 1}`
      },
      fields: [
        { path: 'title', label: 'focus', kind: 'text', veraDrafts: true },
        { path: 'focus', label: 'what the week is about', kind: 'longtext', prose: true, veraDrafts: true, omitWhenEmpty: true },
      ],
    },
  ],
}
