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

### 2. The element registry — `lib/elements/registry.ts`

The single catalog mapping an element key to its canonical mount + config + gate:

```ts
ELEMENTS = {
  'loom-picker': { label, component (lazy), defaults, gate },
  'qr-studio':   { … },
  'email-editor':{ … },
  'crm-board':   { … },
}
```

A page "requests" an element by key (a thin `<AppElement name="loom-picker" … />` mounter, or the
element's own thin wrapper that resolves from the registry). Because the registry is the only door,
every occurrence is identical. This mirrors the admin MENU-CONTRACT (`APPS` / `SPACE_MODULES`), now
extended from menu items to embeddable UI.

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
