# Migration plan: off the deprecated `@measured/puck`

> **Recommendation:** own the block layer in-house. Keep the persisted Puck `Data`
> shape (`{ content, root }`) byte-for-byte so **no stored document is migrated**, then
> (1) pin the dependency now, (2) replace the public `<Render>` with a small in-house
> renderer over the existing block registry, (3) replace the desktop `<Puck>` editor
> (the mobile editor is already Puck-free), then delete the package. Reject a wholesale
> swap to another editor: it would force a migration of every stored doc for no gain.
> Effort: pin ~1 hour; renderer ~3–5 days; editor parity ~2–3 weeks. Fully phaseable,
> each phase independently shippable and behind a flag.

Premise for this plan: `@measured/puck` (pinned at `^0.20.2` in `package.json`) is
flagged deprecated / no longer actively maintained upstream. Confirm the exact upstream
status before scheduling, but the plan below holds regardless — it is about removing a
single-vendor runtime dependency from the render path and the editor.

---

## 1. Current-state map

The editor is a single shared block library (`lib/page-editor/config.tsx`) driving three
surfaces (marketing pages, Space profiles, member Spotlight). The npm package is reached
in three distinct ways: the **desktop editor** (`<Puck>`), the **public renderer**
(`<Render>`), and **type-only** imports.

### 1a. Runtime coupling (the package actually executes)

| Concern | Files | What breaks without the package |
|---|---|---|
| Desktop editor `<Puck>` + CSS | `components/page-editor/editor.tsx` (marketing), `components/spotlight/puck-editor.tsx` (Spotlight), `components/spaces/space-landing-editor.tsx` (Space); styles `@measured/puck/puck.css` + override `components/page-editor/puck-theme.css` | The 3-panel desktop authoring UI + drag/drop + `usePuck()` live-doc read |
| Public renderer (server) `@measured/puck/rsc` | `app/page.tsx`, `app/(marketing)/{about,spaces,the-community,the-lab,the-quest}/page.tsx`, `app/(main)/circles/page.tsx`, `app/(main)/spaces/[slug]/edit-page/page.tsx`, `components/spaces/space-landing.tsx`, `components/spotlight/puck-render.tsx` | **Every public page that renders operator content** (highest-traffic path) |
| Public renderer (client) `@measured/puck` `<Render>` | `components/page-editor/mobile/{mobile-editor,block-list}.tsx`, `components/spotlight/spotlight-live-preview.tsx` | The mobile editor live-preview + Spotlight WYSIWYG preview |
| Live-doc hook `usePuck()` | the 3 desktop editors above | Desktop dirty-tracking / autosave watchers |
| Slots / `DropZone` (nested block areas) | `Container` (`content`), `Columns` (`col1/col2/col3`) in `components/page-editor/blocks/primitives.tsx`; `SpaceLayout` (`main`/`side`) in `components/page-editor/blocks/profile.tsx` | Nested block regions in both render and edit |

### 1b. Type-only coupling (trivial to replace)

`import type { Data | Config | ComponentConfig }` appears in ~40 files — all templates
(`lib/page-editor/templates/*`), all block registries
(`components/page-editor/blocks/*`), the converters, the data layer, and the server
actions. These are pure TypeScript types with no runtime; they can be re-exported from a
single local module in an afternoon (Phase 1).

### 1c. The block registry (what we already own)

`lib/page-editor/config.tsx` is pure assembly — it merges 12 block-module registries and
declares the left-bar categories. No block is defined in the package; every block is a
plain `ComponentConfig` (`fields` → `defaultProps` → `render`) authored in this repo:

| Module | Blocks (approx) | Notable |
|---|---|---|
| `blocks/kit.tsx` | 1 (Heading) + shared kit | Frozen block contract |
| `blocks/primitives.tsx` | 7 | Container/Columns use **slots** |
| `blocks/sections.tsx` | ~12 (via category) | Hero, FeatureGrid, Tiers, … |
| `blocks/collections.tsx` | 6 | |
| `blocks/media.tsx` | 4 | Cover/Image/Gallery |
| `blocks/marketing.tsx` | 4 | |
| `blocks/product-story.tsx` | 5 | |
| `blocks/dynamic.tsx` | 3 | Live* blocks read `metadata` |
| `blocks/circles.tsx` | 6 | |
| `blocks/linktree.tsx` | 10 | Shared Spotlight `Spotlight*` blocks |
| `blocks/spaces.tsx` | 4 | SpaceUpdates/Reviews/FAQ |
| `blocks/profile.tsx` | 15 | SpaceLayout uses **slots** |

~68 `render:` declarations total. Custom controls use Puck's `type: 'custom'`
`render({ value, onChange })` field API — `lib/page-editor/fields.tsx` (`imgField` →
`image-field.tsx`), `lib/page-editor/loom-image-field.tsx`,
`lib/page-editor/spotlight-asset-field.tsx`. These are self-contained (they do **not**
touch the Puck store — confirmed by `components/page-editor/mobile/field-form.tsx`).

### 1d. How documents are stored (the serialized `Data` shape)

| Surface | Store | Shape | Notes |
|---|---|---|---|
| Marketing pages | `pages` table — `data` (draft) + `published_data` (live) JSONB (`supabase/migrations/20240226000000_pages_cms.sql`) | Puck `Data` `{ content:[], root:{} }` | Space-scoped via untyped `space_id` column (ADR-246); read/write in `lib/page-editor/data.ts` + `app/edit/actions.ts` |
| Space profiles | `spaces.preferences` JSONB — `preferences.pageDocs[slug]` (per page) + legacy `preferences.puck` (single doc) | Puck `Data` per page | Additive, no column; resolver `lib/spaces/profile-pages.ts`; actions `app/(main)/spaces/[slug]/edit-page/actions.ts` |
| Member Spotlight | `profiles.meta.spotlight.layout` | **Bespoke `SpotlightLayout`, NOT Puck `Data`** | Bridged to/from `Data` on read/write by the pure `lib/spotlight/puck/convert.ts`; validated server-side |

The public render already resolves fail-safe: `isRenderable`
(`lib/page-editor/templates/index.ts`) and `isRenderableSpaceDoc`
(`lib/page-editor/templates/space.ts`) reject any doc containing an unknown block type
and fall back to the coded template / universal default, so an unrenderable doc never
throws.

### 1e. In-house pieces that already prove the exit is cheap

- **`components/page-editor/mobile/*`** is a complete phone-native editor that
  reads/writes the exact Puck `Data` shape using only `config` — **without the Puck
  runtime**. `field-form.tsx` deliberately reimplements field rendering (text/textarea/
  number/select/radio/array/object/custom) rather than use Puck's `AutoField`;
  `data-ops.ts` reimplements add/remove/move/update/find on `Data`. Slots + external are
  the only field kinds it declines ("edit on a larger screen").
- **`lib/spotlight/puck/convert.ts`** proves `Data` is a stable, serializable,
  round-trippable contract that is independent of the package.

Together these mean the *editing* and *data* layers are already ~80% decoupled; the load-
bearing package usage is really just `<Render>` and the desktop drag/drop canvas.

---

## 2. Risk of staying on a deprecated dependency

| Severity | Risk |
|---|---|
| ⚠️ | No security patches — the editor mounts in an admin/operator surface and the renderer runs on every public page; an unpatched CVE would be unfixable except by forking. |
| ⚠️ | Framework drift — this repo runs Next 16 / React 19 (bleeding edge). A future React/Next major could break an unmaintained `<Puck>`/`<Render>` with no upstream fix. |
| ⚠️ | `@measured/puck/puck.css` ships opinionated CSS into the admin bundle; a future Tailwind v4 change could conflict with no upstream remedy. |
| 🔴 | The caret range `^@measured/puck@0.20.2` still floats within `0.20.x`. Pin to an exact version immediately so a transitive re-resolve can't pull a surprise. |
| ✅ | No immediate breakage — frozen at the current version the app keeps working; this is a managed-debt problem, not a fire. |

---

## 3. Options

### Option A — Pin and vendor / fork the current version
Drop the caret (exact pin), optionally vendor the built package into the repo or fork the
GitHub repo and depend on the fork.

- ➕ Lowest effort (pin ~1 hour); zero behavior change; buys time.
- ➖ You now own an unmaintained ~full page-builder codebase for security + compat forever.
- ➖ A vendored/forked editor is heavy to actually maintain (it is a large surface you did
  not write). Solves ownership but not the maintenance burden.

### Option B — Migrate to an alternative editor (Plasmic, Builder.io, GrapesJS, Plate/react-page, a Puck successor, …)
- ➕ Actively maintained upstream; possibly richer features.
- ➖ Highest effort + highest risk: every one of ~68 blocks re-authored against a new
  block API, and every alternative uses a **different document model** → a one-way data
  migration of every stored `pages.data`/`published_data`, every `spaces.preferences.
  pageDocs`, and the Spotlight bridge. Migration bugs corrupt live pages.
- ➖ Most mature options are SaaS/hosted or heavier than needed; we lose the clean,
  fully-owned, DAWN-token block registry we already have.
- ➖ Trades one vendor dependency for another.

### Option C — Build a minimal in-house block editor on the existing registry
Keep the `Data` shape + `config` contract **exactly**. Replace only the two package-owned
runtime pieces: the renderer and the desktop canvas. Reuse the block registry and the
mobile editor's `data-ops` + `field-form` unchanged.

- ➕ **Zero stored-doc migration** — the persisted shape never changes.
- ➕ Removes the dependency entirely; full control; no CSS bleed; no vendor.
- ➕ The renderer is small and pure (walk `content`, look up `config.components[type].
  render`, pass resolved props + `metadata`); blocks already return plain JSX.
- ➕ Editing is already ~80% done in `components/page-editor/mobile/*`.
- ➖ Real work is the **desktop drag-and-drop editor with nested slot regions**
  (`Container`/`Columns`/`SpaceLayout`) — the genuinely hard part of any page builder.
- ➖ We own accessibility + polish of the authoring UX going forward.

---

## 4. Recommendation

**Adopt Option C, staged, with an immediate Option A pin as step 0.** Reject Option B.

Rationale specific to this codebase: the `Data` shape is our own serialized contract (not
a vendor format), the block registry is entirely ours, and a Puck-free editor already
exists for mobile. The only load-bearing package code is `<Render>` (small, pure,
replaceable) and the desktop canvas (replaceable incrementally, with `<Puck>` retained as
a fallback until parity). Option C therefore removes the vendor with **no data migration
and no big-bang cutover**, which neither A (keeps the burden) nor B (forces a migration)
achieves.

---

## 5. Phased migration sequence

Each phase is independently shippable, guarded, and reversible.

### Phase 0 — Pin (immediate, ~1 hour) ✅ safe now
- Change `package.json` `@measured/puck` from `^0.20.2` to the exact resolved version;
  refresh `pnpm-lock.yaml`. Stops any float within `0.20.x`.
- No code change.

### Phase 1 — Own the type surface (~0.5–1 day)
- Add `lib/page-editor/types.ts` re-exporting `PageData` / `BlockConfig` /
  `BlockComponent` (aliases of `Data` / `Config` / `ComponentConfig`), sourced from the
  package for now.
- Repoint the ~40 `import type … from '@measured/puck'` sites to the local module.
- Net effect: one file imports the package types; everything else is vendor-neutral. No
  behavior change; pure refactor (git-only, no Notion).

### Phase 2 — Own the renderer (~3–5 days) — highest leverage
- Add `components/page-editor/render.tsx`: an in-house `<BlockRender config data
  metadata>` that maps `data.content` → `config.components[type].render(props)`, threads
  `metadata` (the dynamic blocks + Spotlight/Space blocks read it — see
  `space-landing.tsx`, `puck-render.tsx`), and **recurses into slots** (a slot prop
  becomes a component that renders its nested array, matching how `SpaceLayout`/
  `Container`/`Columns` consume `main`/`content`/`col*`). Provide both an RSC-safe and a
  client entry to match today's two import paths.
- **Golden-render test** (the safety net): render every template in
  `lib/page-editor/templates/*` plus representative stored docs through both the Puck
  `<Render>` and `<BlockRender>` and assert identical markup. Build on the existing
  `*.blocks.test.ts` + `convert.test.ts`.
- Roll out per surface behind a flag, in order of blast radius: marketing routes →
  circles → Space landing → Spotlight. Each flip is diffable against the golden snapshot.
- After all public surfaces are on `<BlockRender>`, the package no longer runs on any
  public page — the biggest risk (an unpatched renderer on public traffic) is gone even
  before the editor is touched.

### Phase 3 — Own the desktop editor (~2–3 weeks)
- The mobile editor (`components/page-editor/mobile/*`) is already Puck-free; promote its
  `data-ops.ts` + `field-form.tsx` into a shared core.
- Build the desktop canvas on that core: left-bar palette from `config.categories`
  (`derivePickerGroups` already exists), a preview using `<BlockRender>`, an inspector
  reusing `FieldForm`, and **drag-and-drop into nested slots** (the one net-new hard
  part). Reuse the field `custom` controls (`ImageField`, Loom, Spotlight asset) as-is.
- Keep `<Puck>` mounted behind a flag until the in-house desktop editor reaches parity on
  the 3 editors (`editor.tsx`, `puck-editor.tsx`, `space-landing-editor.tsx`).
- Preserve each surface's save/publish contract unchanged: `publishPage`
  (`app/edit/actions.ts`), `publishSpaceLanding`/`resetSpaceLanding`
  (`spaces/[slug]/edit-page/actions.ts`), `saveSpotlightDraft`/`publishSpotlightDraft`
  via the `convert.ts` bridge.

### Phase 4 — Remove the dependency (~0.5 day)
- Delete the `@measured/puck` import in `lib/page-editor/types.ts`, drop `puck.css`,
  remove the package from `package.json` + lockfile. Keep `puck-theme.css` only if the
  in-house editor still uses its tokens (rename it).

### Data-migration strategy: none required
Phases 2–3 keep `{ content, root }` identical, so `pages.data`/`published_data`,
`spaces.preferences.pageDocs[*]` / legacy `preferences.puck`, and the Spotlight
`convert.ts` bridge all keep working unchanged. Going forward, stamp a `schemaVersion` on
newly written docs (additive, ignored by old readers) so any *future* shape change is
detectable. The existing `isRenderable` / `isRenderableSpaceDoc` guards already fail safe
on unknown blocks, so a stale doc degrades to the coded fallback rather than erroring.

---

## 6. Test & rollback strategy

| Layer | Test | Rollback |
|---|---|---|
| Renderer (Phase 2) | Golden-markup parity: Puck `<Render>` vs `<BlockRender>` over every template + sampled stored docs | Per-surface flag → flip back to `<Render>` |
| Registry contract | Existing `marketing.blocks.test.ts` / `profile.blocks.test.ts` / `spaces.blocks.test.ts` (well-formed `ComponentConfig`) — keep green through the refactor | n/a (compile-time + unit) |
| Data round-trip | Existing `lib/spotlight/puck/convert.test.ts` + `data-ops.test.ts` guard the `Data` contract | n/a |
| Editor (Phase 3) | Manual + e2e authoring pass per surface; verify save→publish→public render each still round-trips | Flag → re-mount `<Puck>` |
| Public render smoke | Load each of the 6 marketing routes + a Space profile + a Spotlight after each flip | Flag flip |

No destructive DB step exists, so rollback is always a flag flip or a revert — never a
data restore.

---

## 7. Effort estimate

| Phase | Effort | Risk |
|---|---|---|
| 0 · Pin | ~1 hour | ✅ none |
| 1 · Type surface | ~0.5–1 day | ✅ low (pure refactor) |
| 2 · In-house renderer + golden tests + rollout | ~3–5 days | ⚠️ medium (slot recursion; guarded by parity tests) |
| 3 · Desktop editor parity (drag/drop + slots) | ~2–3 weeks | ⚠️ medium-high (net-new authoring UX) |
| 4 · Remove dependency | ~0.5 day | ✅ low |
| **Total (Option C)** | **~4–6 weeks eng, phaseable** | manageable, no big-bang |
| Option A only | ~1 hour | keeps the maintenance burden |
| Option B | ~6–10+ weeks + live-data migration | 🔴 high |

Recommended near-term action: ship **Phase 0 now** and **Phase 1–2** next; Phase 3 can be
scheduled independently since Phase 2 already removes the package from all public traffic.

---

*Authority: running code + `supabase/migrations/` > this doc. Decision recorded as
ADR-493 in [DECISIONS.md](DECISIONS.md).*
