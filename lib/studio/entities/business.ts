// ─────────────────────────────────────────────────────────────────────────────
// THE BUSINESS ENTITY MANIFEST (docs/STUDIO.md, ADR-986 · docs/BUSINESS-IMPORTER.md).
//
// The FIRST entity declared against the Studio kernel, and the reference instance: if the
// kernel can carry the Business Seeder (the most demanding entity we own, with an adversarial
// verifier and a provenance ledger over every commercial fact), it can carry the rest.
//
// This file is a DECLARATION, the same law as SPACE_MODULES (ADR-553) and PLAYBOOK_REGISTRY
// (ADR-382): it says WHAT a business draft contains and how it groups, and nothing about how
// any of it renders. It replaces the hand-written `extractFields` + `SECTION_META` that used
// to live in app/(main)/admin/business-seeder/review-model.ts.
//
// STRICT BOUNDARY: entities import from the kernel; the kernel never imports from entities
// (`pnpm check:studio`). Everything below is data plus a few PURE read functions.
//
// The field paths mirror `BusinessProfile` (lib/importer/schema.ts) exactly, because they are
// also the keys the provenance ledger is stored under. The commercial flags mirror
// COMMERCIAL_FACT_PATHS, so the review board and the materializer's gate can never disagree.
// ─────────────────────────────────────────────────────────────────────────────

import type { EntityManifest, FieldOption } from '@/lib/studio/kernel/manifest'

/** The two member-facing Space designators. Mirrors `BusinessType` (lib/importer/schema.ts),
 *  which is a union type with no runtime value to import. `root` is the hidden platform host and
 *  is never a choice here. */
const BUSINESS_TYPES: readonly FieldOption[] = [
  { value: 'business', label: 'Business' },
  { value: 'nonprofit', label: 'Nonprofit' },
]

/** Render a scalar as display text. Mirrors the kernel's own reader. PURE + total. */
function str(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

export const BUSINESS_MANIFEST: EntityManifest = {
  entity: 'business',
  label: 'Business',

  // Every commercial fact is refuted by the adversarial Opus pass before it may clear
  // (docs/BUSINESS-IMPORTER.md §4.2). This is the strictest mode the kernel offers.
  verify: 'adversarial',

  // The Seeder takes a website, pasted content, uploaded documents, and photos.
  accepts: ['url', 'document', 'image', 'paste'],

  // The steering dials: pick a mood, steer with directions, and pin the hero across a re-seed.
  steer: { mood: true, directions: true, lock: ['hero'] },

  sections: [
    { key: 'identity', title: 'Identity', desc: 'Name, type, and brand. The Space this becomes.' },
    { key: 'story', title: 'Story and about', desc: 'The reframed narrative. AI copy is marked and held until you confirm it.' },
    { key: 'contact', title: 'Contact and hours', desc: 'Commercial facts. Each needs a source or your confirm before it goes live.' },
    { key: 'offerings', title: 'Offerings', desc: 'What the business offers. Prices are held until a source clears them.' },
    { key: 'reputation', title: 'Reputation', desc: 'Ratings and reviews. Held until a source clears them.' },
    { key: 'other', title: 'Other', desc: 'Fields the research found that do not fit a standard section.' },
  ],

  fields: [
    // ── Identity ──
    { path: 'name', label: 'Name', kind: 'text', section: 'identity', placement: 'spark', required: true },
    { path: 'brandName', label: 'Brand name', kind: 'text', section: 'identity', omitWhenEmpty: true },
    // Type defaults to 'business' when the draft leaves it unset (a nonprofit is the explicit choice).
    { path: 'type', label: 'Type', kind: 'select', section: 'identity', placement: 'spark', options: BUSINESS_TYPES, read: (d) => str(d.type) || 'business' },
    { path: 'slug', label: 'Slug', kind: 'slug', section: 'identity', omitWhenEmpty: true },
    { path: 'category', label: 'Category', kind: 'text', section: 'identity', placement: 'spark', omitWhenEmpty: true },
    { path: 'accent', label: 'Accent', kind: 'text', section: 'identity', omitWhenEmpty: true },

    // ── Story (prose: can hide a commercial claim, so it is gated too) ──
    { path: 'tagline', label: 'Tagline', kind: 'text', section: 'story', placement: 'inline', prose: true, veraDrafts: true },
    { path: 'about', label: 'About', kind: 'longtext', section: 'story', placement: 'inline', prose: true, veraDrafts: true },
    { path: 'story', label: 'Story', kind: 'longtext', section: 'story', placement: 'inline', prose: true, veraDrafts: true },

    // ── Contact and hours (commercial facts, except the website) ──
    { path: 'contact.address', label: 'Address', kind: 'address', section: 'contact', commercial: true, veraDrafts: false },
    { path: 'contact.phone', label: 'Phone', kind: 'phone', section: 'contact', commercial: true, veraDrafts: false },
    { path: 'contact.email', label: 'Email', kind: 'email', section: 'contact', commercial: true, veraDrafts: false },
    { path: 'contact.website', label: 'Website', kind: 'url', section: 'contact', veraDrafts: false },
    { path: 'contact.hours', label: 'Hours', kind: 'hours', section: 'contact', commercial: true, veraDrafts: false },

    // ── Reputation. Composed for display ("4.8 (126)"); omitted entirely when there is no rating. ──
    {
      path: 'rating',
      label: 'Rating',
      kind: 'rating',
      section: 'reputation',
      commercial: true,
      veraDrafts: false,
      omitWhenEmpty: true,
      read: (d) => {
        const r = d.rating as { value?: unknown; count?: unknown } | undefined
        if (!r) return ''
        const count = str(r.count)
        return [str(r.value), count ? `(${count})` : ''].filter(Boolean).join(' ')
      },
    },
  ],

  // Each offering expands into its own rows so its individually-gated price clears on its own
  // evidence, never on a sibling's.
  repeats: [
    {
      arrayPath: 'offerings',
      section: 'offerings',
      itemLabel: (item, index) => str(item.title) || `Offering ${index + 1}`,
      fields: [
        { path: 'title', label: 'title', kind: 'text' },
        { path: 'blurb', label: 'blurb', kind: 'longtext', prose: true, veraDrafts: true, omitWhenEmpty: true },
        {
          path: 'price',
          label: 'price',
          kind: 'price',
          commercial: true,
          veraDrafts: false,
          read: (o) => {
            const price = typeof o.price === 'number' ? String(o.price) : ''
            return [str(o.priceModel), price, str(o.currency)].filter(Boolean).join(' ')
          },
        },
      ],
    },
  ],
}
