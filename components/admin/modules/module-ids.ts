// THE KEY SET OF `MODULE_COMPONENTS`, AND NOTHING ELSE (LIVE-009 · ADR-1074).
//
// ── WHY A SECOND FILE EXISTS FOR A LIST OF STRINGS ──────────────────────────────────────────────
//
// `settings-panel.tsx` sits on the shell's static path — `app/(main)/layout.tsx` → `app-shell.tsx`
// → `AdminBar` → here — with no code-split boundary anywhere on it. Everything it imports
// statically is eager first-load JS for every MEMBER on every route under `app/(main)`.
//
// The rail needs ONE fact synchronously: does this module id have an inline body at all? An id with
// no body draws nothing, and that decision feeds the section count, which feeds `hasContent`, which
// decides whether the bar renders at all. It cannot wait on a chunk without the rail painting empty
// section headers on the way to finding out.
//
// It does NOT need the components to answer that. Until LIVE-009 it imported them anyway — the whole
// of `module-map.tsx`, 14.3 KB of registry plus 42 `next/dynamic` loader stubs and the chunk-manifest
// entries for the 42 chunks they name, on every member's phone, to answer a membership test. This
// file is that membership test with the components left behind: `module-map.tsx` now enters the
// browser only when `AdminModuleBody` is actually mounted, which happens when an operator opens the
// rail and never otherwise.
//
// ── KEEP THIS FILE IMPORT-FREE ──────────────────────────────────────────────────────────────────
//
// It has no imports today and must not acquire any — not React, not a type from a component module,
// not the registry. An import here is on the shell's eager path by construction, and its transitive
// graph comes with it. lib/analytics/sanitize.ts carries the same rule for the same reason, and its
// header records what happened the last time a pure helper sat in a file that reached the database.
//
// ── IT CANNOT DRIFT FROM THE MAP ────────────────────────────────────────────────────────────────
//
// `components/admin/modules/module-map.test.ts` asserts this set equals `Object.keys(MODULE_COMPONENTS)`
// EXACTLY, in both directions: an id here with no component would make the rail render an empty box,
// and a component with no id here would make its module silently vanish from the rail. Adding a
// module is still "one catalog row + one line in module-map.tsx", plus one line here, and the test
// names the missing line rather than letting either failure ship.

/** Every module id `MODULE_COMPONENTS` can render an inline body for. Order is the map's order. */
export const INLINE_MODULE_IDS: ReadonlySet<string> = new Set([
  'circle.guided',
  'circle.settings',
  'circle.text',
  'circle.placeAndTime',
  'circle.people',
  'circle.engage',
  'circle.insights',
  'circle.transfer',
  'hub.settings',
  'hub.people',
  'hub.layout',
  'hub.insights',
  'hub.danger',
  'nexus.settings',
  'nexus.people',
  'nexus.layout',
  'nexus.insights',
  'nexus.danger',
  'event.guided',
  'event.settings',
  'event.people',
  'practice.guided',
  'practice.settings',
  'practice.insights',
  'channel.settings',
  'channel.insights',
  'channel.danger',
  'journey.guided',
  'journey.settings',
  'journey.builder',
  'journey.export',
  'journey.danger',
  'space.basics',
  'space.layout',
  'account.profile',
  'account.spotlight',
  'account.layout',
  'account.spotlightAppearance',
])
