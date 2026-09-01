// ─────────────────────────────────────────────────────────────────────────────
// THE SPACE ENTITY MANIFEST (docs/STUDIO.md §0, ADR-597).
//
// The MEMBER-CREATED Space: someone runs a studio, a shop, a practice, or a project, and they
// start a Space for it by hand. This declares what they fill in themselves, from the create
// wizard (app/(main)/spaces/new) through Basics and the Business Info form.
//
// ITS RELATIONSHIP TO business.ts. `lib/studio/entities/business.ts` declares the SAME kind of
// destination reached by a different road: the Business Seeder researches a real business from
// a website, drafts it, and carries a provenance ledger plus an adversarial refuter over every
// commercial fact before any of it may publish. This file is the other road, and it is
// deliberately NOT a copy of that one:
//   • verify 'none', no ledger, and no `commercial` flag anywhere. The member IS the source, so
//     their own phone number and their own prices are trusted the moment they type them. There
//     is nothing to cite and nothing to refute.
//   • no `url` in `accepts`. A pasted website is the Seeder's door, not this one.
//   • no rating. A Space's rating is DERIVED from real Reviews (components/spaces/space-landing.tsx
//     overrides it from the reviews aggregate; the manual rating box was removed), so a
//     self-entered star rating is not a field a member owns.
// If a member's Space later needs verified commercial facts, that is the Seeder's manifest,
// not a second set of flags bolted onto this one.
//
// STRICT BOUNDARY: entities import from the kernel; the kernel never imports from entities
// (`pnpm check:studio`). Everything below is data plus a few PURE read functions.
//
// The field paths mirror the shapes the code already persists a Space through: `CreateSpaceInput`
// (lib/spaces/provision.ts) and `SpaceSettingsValues` (the Basics form) for the `spaces` row, and
// `profileData.*` for the central single-source business blob (lib/spaces/profile-data.ts), which
// is where the Contact card, the Offerings grid, and every other surface read from.
// ─────────────────────────────────────────────────────────────────────────────

import type { EntityManifest, FieldOption } from '@/lib/studio/kernel/manifest'
// Both imports are PURE data modules and stay that way: profile-config.ts imports one TYPE and
// nothing else; space-themes.ts imports nothing at all. Neither reaches React, Next, or Supabase,
// so the closed sets below come from the real source of truth and cannot drift out of step with it.
import { provisionableTypes } from '@/lib/spaces/profile-config'
import { SPACE_THEMES } from '@/lib/theme/space-themes'

/** Render a scalar as display text. Mirrors the kernel's own reader. PURE + total. */
function str(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

/**
 * The social / business link platforms, as choices. RESTATED, not imported, for two reasons:
 * the validator's own list (`KNOWN_PLATFORMS` in lib/spaces/profile-data.ts, which silently drops
 * an unknown platform) is module-private and carries no labels, and the labelled list lives in
 * components/spaces/space-business-info-form.tsx, a 'use client' component a pure module must not
 * import. This mirrors both: the same ten keys the form offers, which are exactly KNOWN_PLATFORMS
 * minus `website` (the Space's website has its own field in Contact).
 */
const SOCIAL_PLATFORM_OPTIONS: readonly FieldOption[] = [
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'yelp', label: 'Yelp' },
  { value: 'google', label: 'Google' },
  { value: 'x', label: 'X' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'insighttimer', label: 'Insight Timer' },
  { value: 'spotify', label: 'Spotify' },
]

export const SPACE_MANIFEST: EntityManifest = {
  entity: 'space',
  label: 'Space',

  // The member is the source. No ledger, nothing withheld, nothing to refute.
  verify: 'none',

  // Paste what you have already written, drop in a document (a service list, a menu, a bio),
  // and add your logo and header image. No URL door: researching a website is the Seeder's job.
  accepts: ['paste', 'document', 'image'],

  // Pick a mood, steer with directions, and hold the name, handle, and brand across a re-seed.
  steer: { mood: true, directions: true, lock: ['identity'] },

  sections: [
    { key: 'model', title: 'What you run', desc: 'Your operating model and who can find you. You can switch it later.' },
    { key: 'identity', title: 'Identity', desc: 'Name, handle, and brand. What people see across the network.' },
    { key: 'story', title: 'About and story', desc: 'The words a visitor reads. Vera drafts a starting point you edit.' },
    { key: 'contact', title: 'Contact and hours', desc: 'The details every surface reads from. Fill them once and they show up everywhere.' },
    { key: 'links', title: 'Links', desc: 'Your website and social profiles, shown as branded chips.' },
    { key: 'offerings', title: 'Offerings', desc: 'What you offer, with the pricing you set. One list, used across your Space.' },
  ],

  fields: [
    // ── What you run. The wizard's first question: a Mode, its Focus, and reach. ──
    // The Mode (spaces.type). Sets up the console, the lexicon, and the starter pipeline. The
    // options come straight from `provisionableTypes()`, the same list the create wizard, the staff
    // view-as selector, and the admin defaults grid read, so `root` can never be offered here.
    { path: 'type', label: 'Mode', kind: 'select', section: 'model', placement: 'spark', required: true, options: provisionableTypes() },
    // The Focus sub-mode. Empty is legitimate: it resolves to the Mode's default Focus in code.
    // `optionsFrom`, not `options`: the valid Focus set DEPENDS on the Mode chosen above
    // (lib/spaces/modes.ts `listVariantsForType`), so it is not one closed list a manifest can
    // state up front. The surface resolves the name against the Mode registry.
    { path: 'modeVariant', label: 'Focus', kind: 'select', section: 'model', placement: 'spark', optionsFrom: 'space-mode-focus' },
    // Mirrors `CreateSpaceInput['visibility']`; the copy matches the wizard's visibility control.
    {
      path: 'visibility',
      label: 'Who can find it',
      kind: 'select',
      section: 'model',
      placement: 'spark',
      options: [
        { value: 'network', label: 'Listed in the Spaces directory' },
        { value: 'private', label: 'Private, only you and your members' },
      ],
      read: (d) => str(d.visibility) || 'network',
    },

    // ── Identity. Name and handle are what creation genuinely cannot complete without. ──
    { path: 'name', label: 'Name', kind: 'text', section: 'identity', placement: 'spark', required: true },
    { path: 'slug', label: 'Handle', kind: 'slug', section: 'identity', placement: 'spark', required: true },
    // Seeds from the name at create and is editable in Basics after.
    { path: 'brandName', label: 'Display name', kind: 'text', section: 'identity', read: (d) => str(d.brandName) || str(d.name) },
    // A DAWN token name OR a 6-digit hex the owner picked (ADR-516 D2), which is exactly what the
    // `color` kind is for: the control offers on-brand swatches and a picker, and no renderer ever
    // prints a raw token key at a visitor.
    { path: 'brandAccent', label: 'Brand color', kind: 'color', section: 'identity', omitWhenEmpty: true },
    { path: 'brandLogoUrl', label: 'Logo', kind: 'image', section: 'identity', veraDrafts: false, omitWhenEmpty: true },
    { path: 'coverImageUrl', label: 'Header image', kind: 'image', section: 'identity', veraDrafts: false, omitWhenEmpty: true },
    // The Space page's TYPOGRAPHY identity (ADR-578); shape is no longer a theme knob. A closed set: every theme
    // is a CSS block plus a row in SPACE_THEMES, so the registry is the whole truth.
    {
      path: 'theme',
      label: 'Page theme',
      kind: 'select',
      section: 'identity',
      options: SPACE_THEMES.map((t) => ({ value: t.id, label: t.label })),
      omitWhenEmpty: true,
    },

    // ── About and story. Two different lengths, two different homes, both real. ──
    // The short line under the name.
    { path: 'tagline', label: 'Tagline', kind: 'text', section: 'story', placement: 'inline', prose: true, veraDrafts: true },
    // The short intro (the `spaces.about` column): one or two sentences that greet a visitor.
    { path: 'about', label: 'About', kind: 'longtext', section: 'story', placement: 'inline', prose: true, veraDrafts: true },
    // The long version, on the central blob: who you are, how you started, what to expect.
    { path: 'profileData.about', label: 'Story', kind: 'longtext', section: 'story', placement: 'inline', prose: true, veraDrafts: true },

    // ── Contact and hours. The member's own details, so Vera never drafts them. ──
    { path: 'profileData.address', label: 'Address', kind: 'address', section: 'contact', veraDrafts: false },
    { path: 'profileData.hours', label: 'Hours', kind: 'hours', section: 'contact', veraDrafts: false },
    { path: 'profileData.phone', label: 'Phone', kind: 'phone', section: 'contact', veraDrafts: false },
    { path: 'profileData.email', label: 'Email', kind: 'email', section: 'contact', veraDrafts: false },
    { path: 'profileData.website', label: 'Website', kind: 'url', section: 'contact', veraDrafts: false },
  ],

  repeats: [
    // One row per social / business link, so a bad URL is fixed on its own row.
    {
      arrayPath: 'profileData.socials',
      section: 'links',
      itemLabel: (item, index) => str(item.platform) || `Link ${index + 1}`,
      fields: [
        { path: 'platform', label: 'platform', kind: 'select', veraDrafts: false, options: SOCIAL_PLATFORM_OPTIONS },
        { path: 'url', label: 'url', kind: 'url', veraDrafts: false },
      ],
    },
    // Each offering expands into its own rows, so its price, length, and visibility are edited
    // and read one service at a time. Prices are stored in MAJOR units (dollars, never cents).
    {
      arrayPath: 'profileData.offerings',
      section: 'offerings',
      itemLabel: (item, index) => str(item.title) || `Offering ${index + 1}`,
      fields: [
        { path: 'title', label: 'title', kind: 'text' },
        { path: 'blurb', label: 'blurb', kind: 'longtext', prose: true, veraDrafts: true, omitWhenEmpty: true },
        {
          // Composed for display: the model, the amount (or the sliding-scale band), the
          // currency, and the cadence read as one line. The member sets every part of it.
          path: 'price',
          label: 'price',
          kind: 'price',
          veraDrafts: false,
          read: (o) => {
            const amount = typeof o.price === 'number' ? String(o.price) : ''
            const band =
              typeof o.slidingScaleMin === 'number' && typeof o.slidingScaleMax === 'number'
                ? `${o.slidingScaleMin} to ${o.slidingScaleMax} sliding scale`
                : ''
            return [str(o.priceModel), band || amount, str(o.currency), str(o.recurring)].filter(Boolean).join(' ')
          },
        },
        {
          path: 'durationMinutes',
          label: 'length',
          kind: 'duration',
          veraDrafts: false,
          omitWhenEmpty: true,
          read: (o) => (typeof o.durationMinutes === 'number' ? `${o.durationMinutes} min` : ''),
        },
        { path: 'deposit', label: 'deposit', kind: 'price', veraDrafts: false, omitWhenEmpty: true },
        { path: 'packageCount', label: 'sessions in a package', kind: 'number', veraDrafts: false, omitWhenEmpty: true },
        // Listed is the default: an unset value shows on the storefront. Mirrors `ServiceVisibility`
        // (lib/spaces/profile-data.ts), whose own `VISIBILITY` guard is module-private.
        {
          path: 'visibility',
          label: 'visibility',
          kind: 'select',
          veraDrafts: false,
          options: [
            { value: 'listed', label: 'Listed on your Space' },
            { value: 'private', label: 'Private, by direct link only' },
          ],
          read: (o) => str(o.visibility) || 'listed',
        },
      ],
    },
  ],
}
