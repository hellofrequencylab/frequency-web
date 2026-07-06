// THE App catalog (LP1 / ADR-502, docs/LOOM-PLATFORM.md §3, §7) — the read-direction adapter that
// COMPOSES the three live registries into one uniform `App[]`, so nothing live breaks while The Loom
// gains a single source of truth for "what features exist." LP2 inverts this (the registries derive
// FROM `APPS`); LP1 only reads them.
//
// PURE METADATA. No React import here (the editor `Icon` is a Lucide component reference that flows
// through from the AdminModule catalog — a plain value, no JSX); component bindings live in
// lib/apps/bindings.tsx.
//
// Composition, one lane per surface:
//   • editor  ← ADMIN_MODULES        (each → an App with `surfaces.editor` + a capability gate)
//   • page    ← LAYOUT_MODULES        (each → an App with `surfaces.page`; `route` scopes derived
//                                      from ROUTE_MODULE_IDS — every key whose set offers the module)
//   • element ← the element catalog   (each → an App with `surfaces.element`, gate 'none')
//
// The element-catalog per-registry arrays (ON_AIR_ICONS, SPOT_ART, …) are PRIVATE (not exported), and
// LP1 must not modify that file, so the element rows are re-declared below from the same data. A drift
// guard in catalog.test.ts asserts this set's {registry, name} pairs equal the exported REGISTRY_NAMES
// and its circle-template pillars equal TEMPLATE_PILLARS, so a rename/add/remove in the source fails
// the test. (LP2 collapses the duplication by exporting the source list.)

import { ADMIN_MODULES } from '@/lib/admin/modules/registry'
import { LAYOUT_MODULES, ROUTE_MODULE_IDS } from '@/lib/widgets/modules'
import type { ElementRegistry, PillarSlug } from '@/lib/library/element-catalog'
import { SPACE_MODULES } from '@/lib/admin/modules/space-modules'
import type { App } from './types'

// ── editor Apps ← ADMIN_MODULES ───────────────────────────────────────────────────────────────────
// Every AdminModule becomes an App with a populated `surfaces.editor`, its scope kinds mapped to
// `{ on:'scopeKind' }`, its capability mapped to the bridged `capability` gate, and its spine slot as
// the App category. Order in the array preserves AdminModule order (so per-scope order matches).
const EDITOR_APPS: App[] = ADMIN_MODULES.map((m): App => ({
  id: m.id,
  label: m.label,
  ...(m.desc !== undefined ? { description: m.desc } : {}),
  category: m.slot,
  scopes: m.scopes.map((kind) => ({ on: 'scopeKind' as const, kind })),
  gate: { system: 'capability', capability: m.requiredCapability },
  surfaces: {
    editor: {
      surface: m.surface,
      Icon: m.Icon,
      order: m.order,
      render: m.render,
      // The three-tier rail axis (ADR-514 three-tier reorg), carried through exactly like `render`.
      ...(m.tier !== undefined ? { tier: m.tier } : {}),
      ...(m.priority !== undefined ? { priority: m.priority } : {}),
      // The uniform-rail placement axis (ADR-515), carried through exactly like `render`/`tier`.
      ...(m.placement !== undefined ? { placement: m.placement } : {}),
      // The per-module surface predicate (ADR-516 Phase B), carried through by reference.
      ...(m.surfaces !== undefined ? { surfaces: m.surfaces } : {}),
    },
  },
  themeable: false,
  status: 'final',
  version: 1,
}))

// ── page Apps ← LAYOUT_MODULES + ROUTE_MODULE_IDS ───────────────────────────────────────────────────
// Index each layout-module id → the route keys that offer it (a module can be offered by several
// routes, e.g. the community blocks under '*'). Parked modules (offered by no route set today) get an
// empty scope list — intentionally, mirroring their absence from every ROUTE_MODULE_IDS set.
const ROUTE_KEYS_BY_MODULE = new Map<string, string[]>()
for (const [key, ids] of Object.entries(ROUTE_MODULE_IDS)) {
  for (const id of ids) {
    const arr = ROUTE_KEYS_BY_MODULE.get(id)
    if (arr) arr.push(key)
    else ROUTE_KEYS_BY_MODULE.set(id, [key])
  }
}

const PAGE_APPS: App[] = LAYOUT_MODULES.map((m): App => ({
  id: m.id,
  label: m.label,
  description: m.description,
  // Page blocks are layout content; they carry no admin spine slot, so they sit under 'layout'.
  category: 'layout',
  scopes: (ROUTE_KEYS_BY_MODULE.get(m.id) ?? []).map((key) => ({ on: 'route' as const, key })),
  // Blocks self-gate (return null when empty) and re-check server-side; the catalog gate is 'none'.
  gate: { system: 'none' },
  surfaces: { page: {} },
  themeable: true,
  status: 'final',
  version: 1,
}))

// ── element Apps ← the element catalog (re-declared; drift-guarded against REGISTRY_NAMES) ───────────
// The 34 code-drawn elements beyond the marketing illustration kit (illustrations are enumerated
// separately and are NOT element-catalog entries). Data mirrors lib/library/element-catalog.ts.
type ElementSeed = {
  registry: Exclude<ElementRegistry, 'illustration'>
  name: string
  title: string
  category: string
  tags: readonly string[]
  pillar?: PillarSlug
}

const ELEMENT_SEEDS: readonly ElementSeed[] = [
  // On Air control icon kit.
  { registry: 'icon', name: 'lotus', title: 'Lotus (meditation)', category: 'On Air icons', tags: ['icon', 'on-air', 'meditation', 'lotus'] },
  { registry: 'icon', name: 'breathe', title: 'Breathe visualizer', category: 'On Air icons', tags: ['icon', 'on-air', 'breathe'] },
  { registry: 'icon', name: 'dial', title: 'Timer dial', category: 'On Air icons', tags: ['icon', 'on-air', 'timer', 'dial'] },
  { registry: 'icon', name: 'bolt', title: 'Zap bolt', category: 'On Air icons', tags: ['icon', 'on-air', 'zap', 'bolt'] },
  { registry: 'icon', name: 'bell-cue', title: 'Bell cue', category: 'On Air icons', tags: ['icon', 'on-air', 'bell', 'sound'] },
  { registry: 'icon', name: 'vibration', title: 'Vibration', category: 'On Air icons', tags: ['icon', 'on-air', 'vibration', 'haptic'] },
  { registry: 'icon', name: 'on-air', title: 'On air', category: 'On Air icons', tags: ['icon', 'on-air', 'broadcast', 'live'] },
  // Zap-menu / On Air row spot art.
  { registry: 'spot', name: 'event', title: 'Event poster', category: 'Spot art', tags: ['spot', 'zap-menu', 'event'] },
  { registry: 'spot', name: 'contact', title: 'Contact card', category: 'Spot art', tags: ['spot', 'zap-menu', 'contact', 'crm'] },
  { registry: 'spot', name: 'partners', title: 'Partners storefront', category: 'Spot art', tags: ['spot', 'zap-menu', 'partners'] },
  { registry: 'spot', name: 'check-in', title: 'Event check-in', category: 'Spot art', tags: ['spot', 'zap-menu', 'check-in'] },
  { registry: 'spot', name: 'ghost', title: 'Ghost node', category: 'Spot art', tags: ['spot', 'zap-menu', 'ghost', 'map'] },
  { registry: 'spot', name: 'mindless', title: 'Mindless lotus', category: 'Spot art', tags: ['spot', 'on-air', 'mindless', 'meditation'] },
  { registry: 'spot', name: 'movement', title: 'Movement runner', category: 'Spot art', tags: ['spot', 'on-air', 'movement', 'runner'] },
  { registry: 'spot', name: 'connect', title: 'Connect QR', category: 'Spot art', tags: ['spot', 'zap-menu', 'connect', 'qr'] },
  // The twelve Starter Circle template scenes (grouped by their primary Pillar).
  { registry: 'circle-template', name: 'the-reading-room', title: 'The Reading Room', category: 'Circle templates', pillar: 'mind', tags: ['circle-template', 'mind', 'reading'] },
  { registry: 'circle-template', name: 'compound', title: 'Compound', category: 'Circle templates', pillar: 'mind', tags: ['circle-template', 'mind', 'money'] },
  { registry: 'circle-template', name: 'game-night', title: 'Game Night', category: 'Circle templates', pillar: 'mind', tags: ['circle-template', 'mind', 'games'] },
  { registry: 'circle-template', name: 'run-club', title: 'Run Club', category: 'Circle templates', pillar: 'body', tags: ['circle-template', 'body', 'running'] },
  { registry: 'circle-template', name: 'the-trailhead', title: 'The Trailhead', category: 'Circle templates', pillar: 'body', tags: ['circle-template', 'body', 'hiking'] },
  { registry: 'circle-template', name: 'pickup', title: 'Pickup', category: 'Circle templates', pillar: 'body', tags: ['circle-template', 'body', 'sport'] },
  { registry: 'circle-template', name: 'still', title: 'Still', category: 'Circle templates', pillar: 'spirit', tags: ['circle-template', 'spirit', 'meditation'] },
  { registry: 'circle-template', name: 'the-deep-end', title: 'The Deep End', category: 'Circle templates', pillar: 'spirit', tags: ['circle-template', 'spirit', 'connection'] },
  { registry: 'circle-template', name: 'the-table', title: 'The Table', category: 'Circle templates', pillar: 'spirit', tags: ['circle-template', 'spirit', 'dinner'] },
  { registry: 'circle-template', name: 'the-makers', title: 'The Makers', category: 'Circle templates', pillar: 'expression', tags: ['circle-template', 'expression', 'art'] },
  { registry: 'circle-template', name: 'sound', title: 'Sound', category: 'Circle templates', pillar: 'expression', tags: ['circle-template', 'expression', 'music'] },
  { registry: 'circle-template', name: 'the-writers-room', title: "The Writers' Room", category: 'Circle templates', pillar: 'expression', tags: ['circle-template', 'expression', 'writing'] },
  // Beta-induction product-page mockups (temporary; catalogued while they exist).
  { registry: 'render', name: 'feed', title: 'Feed screen', category: 'Onboarding screens', tags: ['onboarding', 'screen', 'induction', 'temporary', 'feed'] },
  { registry: 'render', name: 'circles', title: 'Circles screen', category: 'Onboarding screens', tags: ['onboarding', 'screen', 'induction', 'temporary', 'circles'] },
  { registry: 'render', name: 'events', title: 'Events screen', category: 'Onboarding screens', tags: ['onboarding', 'screen', 'induction', 'temporary', 'events'] },
  // Abstract brand textures.
  { registry: 'texture', name: 'frequency-arcs', title: 'Frequency arcs', category: 'Textures', tags: ['texture', 'abstract', 'frequency', 'brand'] },
  { registry: 'texture', name: 'ripple-rings', title: 'Ripple rings', category: 'Textures', tags: ['texture', 'abstract', 'ripple', 'brand'] },
  { registry: 'texture', name: 'circle-constellation', title: 'Circle constellation', category: 'Textures', tags: ['texture', 'abstract', 'network', 'brand'] },
  { registry: 'texture', name: 'organic-blob', title: 'Organic blob', category: 'Textures', tags: ['texture', 'abstract', 'blob', 'brand'] },
]

const ELEMENT_APPS: App[] = ELEMENT_SEEDS.map((e): App => ({
  // Namespaced id (docs/LOOM-PLATFORM.md §7): 'element:<registry>/<name>'.
  id: `element:${e.registry}/${e.name}`,
  label: e.title,
  category: 'element',
  scopes: [{ on: 'library' }],
  gate: { system: 'none' },
  surfaces: {
    element: {
      registry: e.registry,
      name: e.name,
      category: e.category,
      tags: e.tags,
      ...(e.pillar !== undefined ? { pillar: e.pillar } : {}),
    },
  },
  themeable: true,
  status: 'final',
  version: 1,
}))

// ── Space editor Apps ← SPACE_MODULES (modular menu P3b, ADR-546b) ────────────────────────────────────
// A Space profile lives OUTSIDE the community Capability spine (SpaceRole + spaceFunctionAccess, not a
// Capability), so its manageable modules become editor Apps keyed by `{ on:'spaceType' }` + a
// `spaceFunction` gate — the dormant Space App plumbing the contract already carried ({on:'spaceType'}
// scope, {system:'spaceFunction'} gate, AppViewer.canUseSpaceFn). P3b RENDERS this lane from the P0 module
// manifest (lib/admin/modules/space-modules.ts SPACE_MODULES) — the legacy space surface spine it once
// mirrored was retired in P4 (ADR-547): one App
// per INDEPENDENT module, so the rail renders the SAME catalog the /manage console + Module Manager do
// (service split + one CRM module + the Module Manager entry `space.modules`). The Module Manager's
// per-space order/hidden overrides ride the AdminScope and apply in `appsForScope` (for-scope.ts), not
// here — this stays the pure, catalog-wide superset. Each module's own Icon renders the rail row; the
// rail band (`tier`), within-band order (`priority`), and bottom-bank placement (`placement`) carry
// through from the module, so the shipped rail layout (QR · Email · Insights · Plan and usage banked,
// Danger under "More") is byte-identical. `render` maps `inline` → an inline editor (MODULE_COMPONENTS)
// and `panel`/`link` → a link-row (its href resolves panel-first via panelHrefForModule). An always-on
// shell module ⇒ gate 'none'; a service module ⇒ its `spaceFunction` gate (default-on, per-viewer).
const SPACE_EDITOR_APPS: App[] = SPACE_MODULES.map((m): App => ({
  id: m.id,
  label: m.label,
  description: m.desc,
  category: m.slot,
  // Every module applies to every Space type ('*'); the per-type shaping is the function gate
  // (canUseSpaceFn), exactly as the legacy surfaces (all `types: ['*']`) resolved.
  scopes: [{ on: 'spaceType', type: '*' }],
  gate: m.gate.kind === 'feature' ? { system: 'spaceFunction', fn: m.gate.fn } : { system: 'none' },
  surfaces: {
    editor: {
      surface: 'sidebar',
      Icon: m.Icon,
      order: m.order,
      // A `panel` module renders as a link-row (its body opens on-page via `?panel=`); only a truly
      // inline shell editor mounts its component. So inline ⇒ inline, panel|link ⇒ link.
      render: m.render === 'inline' ? 'inline' : 'link',
      tier: m.tier,
      // The rail within-band order + bank placement (ADR-546b), carried through from the module.
      ...(m.priority !== undefined ? { priority: m.priority } : {}),
      ...(m.placement !== undefined ? { placement: m.placement } : {}),
    },
  },
  themeable: false,
  status: 'final',
  version: 1,
}))

/** THE catalog — the composed, uniform view of every feature. LP2 will invert the registries onto it. */
export const APPS: readonly App[] = [...EDITOR_APPS, ...PAGE_APPS, ...ELEMENT_APPS, ...SPACE_EDITOR_APPS]

/** Look an App up by id. */
export function appById(id: string): App | undefined {
  return APP_BY_ID.get(id)
}

const APP_BY_ID = new Map<string, App>(APPS.map((a) => [a.id, a]))
