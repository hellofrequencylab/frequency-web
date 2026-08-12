# Embeddable elements — one canonical element, invoked by key, configured once

**Status:** Proposed (ADR pending in `docs/DECISIONS.md`). The standard for reusable in-product
"mini-apps" (the Loom picker, QR Studio, the Email editor popup, the Resonance CRM board, …) so a
page **requests an element by key and gets the one canonical implementation**, with rules edited in
one place and applied site-wide. No hand-rolling per page; no divergence from the original.

## The problem

Reusable features were being wired per surface: each page imported a component and passed its own
props/behaviour, so "the same" element drifted between pages and its rules lived in code, edited
instance by instance. We want the opposite: **build a page, ask for an element, get the standard one.**

## The three parts

### 1. One canonical implementation per element

Each element has exactly ONE component + ONE server-actions module — never a per-page copy. This is
already true for the Loom picker (`components/loom/loom-picker.tsx` + `lib/loom/picker-actions.ts`),
the Email editor (`EmailCanvasEditor`), QR Studio (`app/(main)/admin/qr/style-editor.tsx`), and the
Space CRM board. The rule: a surface may only MOUNT the canonical element; it may not fork it.

### 2. The element registry — `lib/elements/registry.ts` (one catalog, no render half)

ONE pure catalog, and only one. `lib/elements/registry.ts` holds the `ElementKey` union plus
`ELEMENTS`: per element, its label, its `studioHref`, and its FEATURES (functions + settings) each
with a `defaultRole` gate. No React, no components, no lazy imports; it is client-safe and safe to
import anywhere. Its consumers are the elements admin (`app/(main)/admin/elements/*`), the previews
(`components/elements/previews.tsx`), and `lib/loom/picker-actions.ts`.

```ts
ELEMENTS: ElementDef[] = [
  { key: 'loom-picker', label, description, studioHref, features: [ { key: 'tab.images', defaultRole, … } ] },
  { key: 'header',      … },
  { key: 'qr-studio',   … },
]
```

A page mounts an element by importing the ONE canonical component directly (`LoomPicker`,
`StyleEditor`, …) and reading its resolved config through the store. Because there is one component
per element, every occurrence is identical. This mirrors the admin MENU-CONTRACT (`APPS` /
`SPACE_MODULES`), now extended from menu items to embeddable UI.

**The registered-but-unbuilt keys are deliberate.** `ElementKey` carries `email-editor` and
`crm-board` with no `ELEMENTS` entry: a key may be reserved before its features are declared, so
`ElementKey ⊇ catalog keys` is expected, not drift.

**There is no generic mounter, and no component map** (resolved 2026-08-12; the 🔴 that stood here
is closed on the delete branch the doc itself offered). The design once called for a render half:
`components/elements/registry.tsx` (`ELEMENT_COMPONENTS` + `ElementPropsMap`) behind a generic
`<AppElement name="loom-picker" …/>` whose `name` discriminated the props. `app-element.tsx` was
deleted long before, leaving the component map with zero importers, so the map and its drift test
(`components/elements/registry.test.ts`) were deleted too rather than left as scaffolding that reads
as wired. **The invariant they were meant to protect already holds without them**: `LoomPicker` has
one definition imported by eight surfaces and `StyleEditor` one imported by seven, with zero forks,
and `ElementDef.key: ElementKey` is compile-checked by `tsc`. If a future element genuinely needs
key-discriminated mounting, re-add both halves together; a component map with no mounter buys nothing.

**Enforcement (hard, in CI).** `scripts/check-elements.test.ts` (under `pnpm test`; it left the
`checks` guard array on 2026-08-12 — ADR-1011 — because vitest auto-discovers tests and an array
entry can be forgotten) fails a PR that (a) declares a second `ElementDef[]` catalog outside the registry, or
(b) reaches the `element_settings` table outside `lib/elements/store.ts`. Escape hatch:
`// element-ok: <reason>` on the line. This is the elements twin of `check:menu` (ADR-553).

### 3. The shared config layer — `element_settings` (with role gating)

ONE generic table, so every element's rules are editable without touching code:

```
element_settings(
  element_key text,             -- 'loom-picker', 'qr-studio', …
  space_id    uuid null,        -- null = the PLATFORM MASTER; a Space id = that Space's override
  config      jsonb,            -- { settings: {...}, roles: { <feature>: <minRole> } }
  updated_by, updated_at
)
```

Resolution is pure + fail-safe: `defaults (registry) ← platform master (space_id null) ← per-space
override`. An element reads its resolved config at runtime (a server action returns it alongside the
mount data). Editing the master row changes the element everywhere at once. Missing table / row →
registry defaults (so it is safe before the migration is applied).

**Role gating (the master has everything; each function/setting is gated by role).** The registry
declares, per element, its FEATURES (functions + settings) each with a `defaultMinRole`. `config.roles`
holds per-feature min-role OVERRIDES (sparse), exactly like `spaces.feature_roles` +
`spaceFunctionAccess` already do for Space functions. At runtime the element resolves, for the current
viewer's role, which features are unlocked:

```
elementFeatureAccess(elementKey, feature, viewerRole)
  = atLeastRole(viewerRole, config.roles[feature] ?? registry.defaultMinRole[feature])
```

So the ONE master component ships every function, and each is shown/enabled only for roles that meet
its (operator-tunable) threshold. Role resolution uses the viewer's effective role in context: the
platform `community_role` for the master surface, the `SpaceRole` for a per-space mount — the same
ladder (`atLeastRole`) both scopes already use, so there is no second permission system.

A shared admin editor (in each element's studio, or a single "Elements" console) lists the registry
and edits each element's `settings` + `roles` — the "master file you edit, site-wide."

## Second citizen: the page header

The page header/hero (`components/templates/page-hero.tsx`) is registered as `'header'` (ADR-793). It is
the ONE header band for the whole site with a few **layout variants** — `overlay` (centered, the shipped
default), `identity` (cover + scrim with the lockup anchored bottom-left + an optional leading chip), and
`minimal` (cover only) — and the SAME editing functions everywhere (height · focal point · header links ·
darken-cover), each a role-gated `ElementFeature`. It shows that not every element is client-mounted: the
header is server-rendered (its `<h1>` must stay server-side for SEO), so it is registered for config +
role-gating only — templates import the canonical `PageHero` directly, which is still the one mount.
Registration buys the config layer and the role gates; it never implied a client component.

A surface resolves its header config with `resolveHeaderElement({ spaceId?, defaults })`
(`lib/elements/header.ts`): it reads the `element_settings` layers and folds them with the surface's own
`defaults` — an operator value set in `/admin/elements` (or a Space override) WINS over the default and
applies with no deploy, else the surface keeps its baseline. So the master genuinely retunes every
header that defers, while each section still has a sensible layout/height. The size ladder is the single
`lib/layout/header-sizes.ts` (PageHero renders it; the registry lists it).

## First citizen: the Loom picker

The Loom picker is the reference implementation of all three parts:
- Canonical component + actions (done).
- Registered as `'loom-picker'` in the registry.
- Config keys (owner decision): `tabs` (Images / Elements / Tags / Spaces / Airwaves), `aiCreate`
  (AI generation in Elements on/off), `defaultScope` (open on personal vs a space). Read from
  `element_settings`; edited in Loom Studio.

## Adoption path (incremental — not a big-bang rewrite)

1. **Loom** — register + config-drive (this PR).
2. **QR Studio** — register `'qr-studio'`; every QR logo/style surface mounts the one editor.
3. **Email editor** — register `'email-editor'`; the compose popup is the one `EmailCanvasEditor`.
4. **Resonance CRM board** — register `'crm-board'`; one board wherever it embeds.

Each conversion is: (a) ensure one canonical component, (b) add a registry row, (c) move its rules
into `element_settings`, (d) mount via the registry. New elements start here by definition.

## Do / don't

- **Do** mount an element through the registry (or its thin registry-backed wrapper).
- **Do** put an element's editable rules in `element_settings`, read via its config loader.
- **Don't** fork an element's component or copy its markup into a page.
- **Don't** hardcode a rule in the component that an operator should be able to change — put it in
  the registry defaults + `element_settings`.
