// The unified App contract (LP1 / ADR-502, docs/LOOM-PLATFORM.md §3, §7). The ONE shape every
// functional feature on the site takes — an editor module, a page block, a rail card, a code-drawn
// element — so The Loom can browse, apply, configure, restyle, and version them all the same way.
//
// PURE METADATA ONLY. No React, no Supabase, no IO — importable on client and server alike. The
// `Icon` on the editor surface is a Lucide icon COMPONENT reference (a plain, client-safe value that
// flows through from the existing AdminModule catalog); component/RSC/SVG bindings live separately in
// lib/apps/bindings.tsx (the existing registry.tsx discipline), never here.
//
// This file DEFINES the contract; it does not invert the three live registries onto it (that is LP2).
// lib/apps/catalog.ts COMPOSES the existing registries into App rows (the read-direction adapter), and
// lib/apps/adapters.ts derives the legacy shapes back out (the direction LP2 will call).
//
// Types are imported from the real sources, never redefined:
//   Capability / Scope        ← lib/core/capabilities.ts (the community capability system)
//   SpaceFunctionKey          ← lib/spaces/functions.ts  (the per-Space function system)
//   AdminSlot                 ← lib/admin/modules/registry.ts (the 9-category spine)
//   TemplateId                ← lib/widgets/templates.ts (the interior-container templates)

import type { LucideIcon } from 'lucide-react'
import type { Capability, Scope } from '@/lib/core/capabilities'
import type { SpaceFunctionKey } from '@/lib/spaces/functions'
import type { SpaceType } from '@/lib/spaces/types'
import type { AdminSlot } from '@/lib/admin/modules/registry'
import type { TemplateId } from '@/lib/widgets/templates'

/** Which surface an App presents. An App declares one or more (docs/LOOM-PLATFORM.md §2, §3). */
export type AppSurfaceKind = 'editor' | 'page' | 'rail' | 'element'

/**
 * Where an App may attach — the union of placement scopes, one per registry world it bridges:
 *   - `scopeKind`  — an AdminModule scope (circle / event / hub / …), matched against `Scope['kind']`.
 *   - `route`      — a ROUTE_MODULE_IDS key ('*', a section '/seg/*', or an exact route '/lead').
 *   - `spaceType`  — a Space profile type ('*' = every type; a Space module applies to every type).
 *   - `library`    — a code-drawn element (no placement scope; it lives in The Loom).
 */
export type AppScope =
  | { on: 'scopeKind'; kind: Scope['kind'] }
  | { on: 'route'; key: string }
  | { on: 'spaceType'; type: SpaceType | '*' }
  | { on: 'library' }

/**
 * THE bridge: one gate over both capability systems + the staff axis + always-on. An App names the
 * SAME gate its server action re-checks (capabilities are UX on the client, law on the server —
 * docs/LOOM-PLATFORM.md §7, §10). Resolved by `appGatePasses` in lib/apps/access.ts, fail-closed.
 *   - `capability`    — a community capability, resolved by `resolveCapabilities(viewer, scope)`.
 *   - `spaceFunction` — a per-Space function key, resolved by `spaceFunctionAccess`; `entitlement`
 *                       optionally names the plan switch the function needs.
 *   - `staff`         — the web_role staff axis; `domain` optionally narrows to a staff domain.
 *   - `none`          — always-on (Basics, a public element).
 */
export type AppGate =
  | { system: 'capability'; capability: Capability }
  | { system: 'spaceFunction'; fn: SpaceFunctionKey; entitlement?: string }
  | { system: 'staff'; domain?: string }
  | { system: 'none' }

/** The viewer the gate resolver reads (filled once per request by the server seam; the resolver never
 *  touches IO — docs/LOOM-PLATFORM.md §7). Fail-closed: an absent predicate / flag denies. */
export interface AppViewer {
  /** The community capabilities resolved for the current scope (`resolveCapabilities`). */
  caps: ReadonlySet<Capability>
  /** Whether the viewer may use a per-Space function on the active Space (`spaceFunctionAccess`).
   *  Omitted ⇒ the viewer is not in a Space world, so every `spaceFunction` gate fails closed. */
  canUseSpaceFn?: (fn: SpaceFunctionKey) => boolean
  /** The web_role staff axis (admin OR janitor). Omitted / false ⇒ every `staff` gate fails closed. */
  isStaff?: boolean
}

/** An external wiring an App declares (The Loom shows connect state per App — docs/LOOM-PLATFORM.md
 *  §3, Layer 2). Metadata only; the actual secrets/config live in Layer 2 data, never in the catalog. */
export interface AppConnection {
  /** Stable key, e.g. 'stripe' or 'google-maps'. */
  id: string
  /** Operator-facing label (voice canon: no em dashes). */
  label: string
  /** The provider/integration this connection targets, when it names one. */
  provider?: string
  /** Whether the App is inert until this connection is wired. */
  required?: boolean
}

/** One editable field in an App's global-config schema (Layer 2 — docs/LOOM-PLATFORM.md §3). The Loom
 *  renders these to edit the App's defaults; values persist as data (`library_assets kind='app'`),
 *  never as edits to Layer-1 source. Styling stays token-only (Layer 4), never hex. */
export interface AppConfigField {
  /** Stable key the config value is stored under. */
  key: string
  /** Operator-facing label (voice canon: no em dashes). */
  label: string
  /** The editor control this field renders as. `token` = a DAWN design-token picker (never raw hex). */
  type: 'text' | 'richtext' | 'number' | 'boolean' | 'select' | 'token'
  /** One plain line of help, when the label needs it. */
  description?: string
  /** Whether a value is required for the App to render. */
  required?: boolean
  /** The default value merged under any global-config / instance override at resolve time. */
  default?: string | number | boolean
  /** For `select`: the allowed choices. */
  options?: readonly { value: string; label: string }[]
}

/** A gateable action an App declares (its server action re-checks a gate before mutating —
 *  docs/LOOM-PLATFORM.md §7, §10). LP3/LP4 read this to wire and re-check actions; `gate` defaults to
 *  the App's own gate when omitted (view = the App's gate; the action re-checks the same bar). */
export interface AppAction {
  /** Stable id, e.g. 'circle.settings.save'. */
  id: string
  /** Operator-facing label (voice canon: no em dashes). */
  label: string
  /** The gate this action re-checks; omitted ⇒ the App's own gate. */
  gate?: AppGate
}

/**
 * THE App — one uniform row for every functional feature (docs/LOOM-PLATFORM.md §3). Composed from the
 * live registries in lib/apps/catalog.ts; derived back out in lib/apps/adapters.ts (LP2's direction).
 */
export interface App {
  /** Stable id. Editor Apps reuse the AdminModule id ('circle.settings'); page Apps reuse the layout
   *  module id ('community-pulse'); element Apps are namespaced 'element:<registry>/<name>'. */
  id: string
  /** Member/operator-facing label — MIRRORS the source registry's label (voice canon, no em dashes). */
  label: string
  /** One-line purpose, when the source carries one. */
  description?: string
  /** The 9-category spine slot, or 'element' for a code-drawn element (docs/LOOM-PLATFORM.md §3). */
  category: AdminSlot | 'element'
  /** Where it may attach (the union of placement scopes). */
  scopes: readonly AppScope[]
  /** The single bridged gate (view). */
  gate: AppGate
  /** External wiring it declares (The Loom shows connect state). */
  connections?: readonly AppConnection[]
  /** The editable global-config schema (Layer 2). */
  config?: readonly AppConfigField[]
  /** Which surfaces it presents (one or more). */
  surfaces: {
    /** The editor surface. `surface` is ADR-138's tune-vs-manage axis (inline on the page vs manage
     *  in the dock). `render` is a SEPARATE axis (the inline-first rail, ADR below): how the STANDARDIZED
     *  admin bar draws this editor — `inline` mounts its editor component in the flattened bar
     *  ("everything in view"); `link` draws a compact link-row out to the feature's own management page.
     *  Config surfaces render inline; only feature workflows link out.
     *
     *  `tier` + `priority` are the THREE-TIER rail axis (ADR-514 three-tier reorg): `tier` groups an
     *  editor into `standard` (identity/profile, rendered inline at the very top), `primary` (the
     *  most-used management surfaces, ordered by importance) or `extra` (obscured under a "More"
     *  disclosure). `priority` orders editors WITHIN a tier (lower = higher up); it defaults to `order`.
     *  ORTHOGONAL to `render`: the inline-vs-link decision still dispatches purely on `render`.
     *
     *  `placement` is the UNIFORM-RAIL axis (ADR-515): where a surface lives on the standardized rail —
     *  `inline` (the default) renders it in the body via `render`/`tier`; `bank` promotes it into the
     *  bottom BANK button-grid (the fixed per-scope quick-links) instead of the body. Default `inline`
     *  everywhere; nothing is tagged `bank` yet (later phases opt surfaces in). ORTHOGONAL to `render`
     *  and `tier`: a `bank` surface skips the body entirely and resolves a plain href. */
    editor?: {
      surface: 'inline' | 'sidebar'
      Icon: LucideIcon
      order: number
      render: 'inline' | 'link'
      tier?: 'standard' | 'primary' | 'extra'
      priority?: number
      placement?: 'inline' | 'bank'
      /** The per-module SURFACE predicate (ADR-516 Phase B): routes on which this editor's SUBJECT
       *  lives; the rail mounts the inline editor only where the path matches. Absent = anywhere. */
      surfaces?: readonly RegExp[]
    }
    page?: { defaultTemplate?: TemplateId; defaultSlot?: string }
    rail?: { side: 'left' | 'right' }
    /** A code-drawn element's render config. `registry` + `name` are the config a `library_assets`
     *  element row stores and the ONLY fields the render path needs (docs/LOOM-PLATFORM.md §7). The
     *  display metadata (`category`, `tags`, and `pillar` for circle-templates) is carried alongside
     *  so `toElementDef` can reconstruct a full ElementDef byte-for-byte for LP2 (the element-catalog
     *  arrays are private, so the catalog re-declares this data under a drift guard). */
    element?: {
      registry: string
      name: string
      pillar?: string
      category?: string
      tags?: readonly string[]
    }
  }
  /** Whether Layer 4 (per-theme token styling) applies. */
  themeable: boolean
  /** The Layer-1 lifecycle status (a version bump is a commit — docs/LOOM-PLATFORM.md §3). */
  status: 'draft' | 'in_review' | 'approved' | 'final' | 'archived'
  /** The Layer-1 version (shown read-only in The Loom; a bump = a commit). */
  version: number
}

/**
 * A scope QUERY — "what is on this page/surface?" — matched against an App's `scopes` union by
 * `surfacesFor` (lib/apps/access.ts). The read-side twin of `AppScope` (which is the App's declared
 * placement); a query names a single concrete placement, an App may declare many.
 */
export type AppScopeQuery =
  | { on: 'scopeKind'; kind: Scope['kind'] }
  | { on: 'route'; key: string }
  | { on: 'spaceType'; type: SpaceType }
  | { on: 'library' }
