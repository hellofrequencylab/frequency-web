// THE FOUR PILLAR SLUGS — the closed set, with no imports (LIVE-009).
//
// WHY THIS FILE EXISTS. `PILLAR_SLUGS` lived in `lib/pillars.ts`, whose other export
// (`getMemberPillarBalance`) reads `getMemberPractices` from `lib/practices` — and from there the
// service-role admin client, @supabase/supabase-js, lib/zaps, lib/achievements, lib/automations,
// lib/queue/outbox and a crypto-browserify polyfill graph. `components/circles/builder/circle-builder.tsx`
// is `'use client'` and imported this ONE array of four strings, so all of that was in the circle
// builder's browser bundle, and `import 'server-only'` could not be added to `lib/practices.ts`
// without failing the build.
//
// Same shape of fix, same reasoning, as `lib/analytics/sanitize.ts` and `lib/journeys/meeting.ts`:
// a pure value parked in a file whose other exports reach the database, extracted so the bundler's
// module graph matches the intent that was only ever written in a comment.
//
// ⚠️ KEEP THIS FILE DEPENDENCY-FREE. `lib/pillars.ts` re-exports both names, so every existing
// server caller — and every `import type` — is unchanged; CLIENT code must import from here.
//
// Naming is locked (docs/NAMING.md): these are the 4 Pillars, surfaced product-wide as Channels.

/** The four Pillars: Mind · Body · Spirit · Expression. Matches the `pillars.slug` column. */
export type PillarSlug = 'mind' | 'body' | 'spirit' | 'expression'

/** The four pillar slugs in display order. */
export const PILLAR_SLUGS: readonly PillarSlug[] = ['mind', 'body', 'spirit', 'expression']
