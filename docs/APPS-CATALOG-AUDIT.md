# The apps, elements and placement audit — 2026-08-04

> **The question this answers.** "Can I pull up any function and place it on a page at any
> time?" The honest answer today is **no**, and this document is the map of why, what is
> registered where, and what stands between here and yes. Method: three independent
> read-only investigations (registry census · placement-path trace · database audit), each
> claim carried with the file or query that proves it. Companion: [ADR-927](DECISIONS.md),
> [MENU-CONTRACT.md](MENU-CONTRACT.md), [EMBEDDABLE-ELEMENTS.md](EMBEDDABLE-ELEMENTS.md),
> [APPS-CONVERSION-PLAN.md](APPS-CONVERSION-PLAN.md).

## The headline

There are **nine registries, not four**, holding roughly **527 distinct rows**. Of those,
**157 are placeable on a page** — and only because `LAYOUT_MODULES` is the single lane in
`APPS` that carries a `page` surface. Every editor module, every Space module, every
operator destination, every embeddable element and all 88 Puck blocks carry no page surface
at all, so none is addressable by a "place this here" flow.

The table built for exactly this — `app_instances` — is migrated, indexed, RLS'd with the
only complete policy quad in the system, present in the generated types, and has **zero
rows and zero application code**. The designed placement-vs-payload split (layout owns
order and visibility, the instance row owns the config payload) cannot be performed against
the data as written, because `page_settings.layout` stores bare module-id **strings** with
no per-block identity to join on.

| Registry | Rows | Declared in | In `APPS`? | Placeable? |
|---|---:|---|---|---|
| `ADMIN_MODULES` | 42 | `lib/admin/modules/registry.ts` | ✅ editor | 🔴 no |
| `SPACE_MODULES` | 34 | `lib/admin/modules/space-modules.ts` | ✅ editor | 🔴 no |
| `LAYOUT_MODULES` | 157 | `lib/widgets/modules.ts` | ✅ **page** | ⏳ 153 of 157 |
| `STUDIO_LEAVES` | 74 | `lib/nav/studio.ts` | ✅ rail | 🔴 no |
| element catalog | 44 | `lib/library/element-catalog.ts` | ✅ element | 🔴 browse only |
| Puck blocks | 88 | `lib/page-editor/config.tsx` | 🔴 **no** | ✅ Puck surfaces only |
| `ENTITY_BLOCKS` | 36 | `lib/entity-blocks/registry.ts` | 🔴 **no** | ✅ Space/Spotlight/Email |
| `PROFILE_BLOCKS` | 13 | `lib/spaces/profile-blocks.ts` | 🔴 **no** | ⏳ renderer only |
| embeddable `ELEMENTS` | 3 (+2 phantom keys) | `lib/elements/registry.ts` | 🔴 **no** | 🔴 code-mounted |
| illustration kit | 36 | `components/marketing/illustrations` | 🔴 no (by design) | 🔴 no |

Three placement systems exist side by side and **no bridge connects them**: Puck blocks
(props in the page doc), layout modules (self-fetching components rendered with *zero*
props, so two instances can never differ), and the App catalog (designed, unwired).

## Fixed in this pass

| Bug | What it did | Fix |
|---|---|---|
| 🔴 `page_settings` cross-tenant read | `SELECT USING (true)` to `authenticated` — any signed-in member could read every Space's layout tree, draft status, visibility gate and SEO | Per-Space quad, applied to prod (`20270208000000`) |
| 🔴 Publish destroyed parked blocks | The hide flag promised "restorable"; the full editor loads without hidden blocks and publish replaced the doc wholesale, deleting them permanently | `withParkedBlocks` merge on the publish path, six tests |

## Open findings, by severity

### 🔴 Latent data loss: `pages.slug` is globally unique

`pages_slug_key UNIQUE (slug)` is the enforced constraint (confirmed in prod), while
`pages_space_slug_idx (space_id, slug)` is **non-unique** and all code treats pages as
per-Space. `app/(main)/edit/actions.ts` upserts `onConflict: 'slug'`. The moment a second
Space publishes `home`, the upsert overwrites the first Space's row and flips its
`space_id`; that Space's page silently reverts to its coded fallback and the stored
document is gone. Latent only because no caller passes `spaceId` today — it is a trap
sitting directly on the per-Space authoring seam. Fix needs a migration (drop the global
unique, make the composite unique, `space_id NOT NULL`) plus the `onConflict` change.

### 🔴 Editor placeholders are dead code

`lib/page-editor/block-render.tsx` hardcodes `puck.isEditing: false` on both render paths,
and it is the only preview renderer both editors use. Twelve profile blocks gate their
editor stubs on that flag, so placing *Upcoming events*, *Highlights*, *Stats*, *Circles*,
*Booking*, *About*, *Offerings*, *Contact* or *Team* on an empty Space renders **nothing**
in the preview. `templates/space-default.ts` documents the opposite intent.

### 🔴 The mirror bug: stubs that leak to the public page

`blocks/spaces.tsx` and `blocks/circles.tsx` gate their stubs only on absent metadata, not
on `isEditing`. Placing `CirclesGrid` or `SpaceUpdates` on `/about` shows a public visitor a
dashed grey box reading "Circles grid".

### 🔴 Scope leak in the block picker

One global `config` and no scope filter, so the marketing editor offers all 19 Space
profile blocks and all 6 Circles-index blocks, and the Space editor offers the marketing
blocks. Not a privilege escalation (the blocks are presentation and every write action is
gated) but a guarantee of dead placements. `Category.visible` is declared and never read;
uncategorized blocks fall into a "More" bucket, which is how `SpaceArrangement` — documented
as deliberately out of the palette — is offered anyway, and placing it silently disables the
page's layout preset.

### 🟠 Dead lanes and unreachable code

- `lib/apps/bindings.tsx` — referenced by three files as the App→component resolver; **does
  not exist**. Each registry keeps its own private map instead.
- `lockedAppsForScope` (the "attainable but locked, show a reason" UX) can never return a
  row: no live catalog entry carries an `entitlement`, and the filter matches `scopeKind`
  while Space apps declare `spaceType`. On plan downgrade an app vanishes silently.
- The Space and Journey rails read `app_overrides` through a scope key that has no writer —
  `SCOPE_KEYS` omits both.
- `app_overrides` PK is `(scope_key, app_id)` with `space_id` outside the key, so the
  documented per-Space override phase would collide with the global row.
- `ADMIN_NAV_APPS`' `rail` surface is rendered by nothing; the real rail still draws from
  `ADMIN_NAV`.
- Dead entries: the whole `/spaces/*` layout set (8 blocks, superseded by `ENTITY_BLOCKS`),
  `crm-members`, `space.modules`'s gate, a `faq` surface with no registry row, and
  `friends-impact`, which is unarrangeable because the editor keys off `/network/friends`
  while the page reads `/friends`.

### 🟠 Contract drift

`docs/MENU-CONTRACT.md` states three catalogs are the only module sources. In fact
`APPS` composes **five** lanes, `STUDIO_LEAVES` (74 rows) is a fourth menu catalog that
passes `check:menu` only because the guard matches `*_MODULES` by name, and two per-scope
menus are hand-declared in the rail render (`settings-panel.tsx`) and `rail-bank.ts` — one
of which links to `space.insights`, a module id that no longer exists. Either the doc is
stale or three surfaces need catalog rows; the guard cannot currently tell.

### 🟡 Naming drift against the locked canon

`docs/NAMING.md` reserves **Marketplace** for the umbrella and **Market** for the surface
where Spaces sell. Five operator destinations label the umbrella console "Market"
(`marketplace`, `marketplace-orders/reports/disputes/reviews`) while their own descriptions
confirm cross-surface scope. One description still says "makers", which the canon
supersedes. A leaf labeled bare "Store" points at Vault Store inventory, where the canon
reserves "Store" for the Frequency Store. Plus ~14 Title Case labels against the
sentence-case rule.

### 🟡 Same concept, four registries

About / Highlights / Offerings / Practices / Circles / Team each exist in `LAYOUT_MODULES`,
`ENTITY_BLOCKS`, `PROFILE_BLOCKS` and Puck with different ids, labels and descriptions. The
`stats` ↔ `highlights` split is already papered over at render time with an id rewrite —
the tell that two catalogs are one too many.

### 🔵 Housekeeping

Six orphan rows (five `page_settings` routes pointing at deleted entities, one unreachable
`pages` slug). Four modules still cast through `as unknown as` with comments saying the
table "isn't in the generated types yet" — all twelve are in the types today, so the
workaround now discards the safety that would catch exactly this class of drift. Three repo
migrations are applied in prod under MCP-assigned version numbers, and one hot-fix
(`insights_vitals_p75_numeric_cast`) is applied with no repo file.

## What "place any function anywhere" actually requires

In dependency order. Each is a real project, not a patch.

1. **Give `App.surfaces.page` a binding, and extend it past `LAYOUT_MODULES`.** Today it is
   a literal `{}` on all 157 rows and absent on the other 194. Nothing else moves until a
   page surface can resolve to a component.
2. **Decide `app_instances` versus the layout jsonb, and finish one.** Placement currently
   has no per-instance identity, which is why a placed module cannot be configured at all.
   Either migrate placement onto instance ids or formally retire the table. Leaving both is
   the status quo that produced this audit.
3. **Fold the placeable catalogs into `APPS`.** `ENTITY_BLOCKS` (36) + Puck blocks (88) +
   `ELEMENTS` (3) are the things operators actually place, and `APPS` cannot see any of
   them. Collapse `PROFILE_BLOCKS` into `ENTITY_BLOCKS` in the same pass.
4. **Then the picker becomes scope-aware** — one registry, filtered by surface, which
   removes the scope leak and the dead-placement class with it.
