# E0 — Foundations: the implementation breakdown

> **The answer, first.** E0's data migration is **41 documents**, not a fleet. Every risk below is
> about *code paths*, not backfill volume. The critical path is one chain of six items
> (§1.7 → 8→9→10→11→12→13); everything else runs beside it.
>
> Parent spec: [`EDITOR-ARCHITECTURE.md`](EDITOR-ARCHITECTURE.md) · Decisions:
> [ADR-974](DECISIONS.md) · [ADR-975](DECISIONS.md) · [ADR-976](DECISIONS.md).
> **Verified against the live tree and the production database on 2026-08-10.**
> `tsc --noEmit` exits 0; `rows-ops` + `layout` + `templates` suites are 128/128 green.
>
> Legend: ✅ built · ⏳ partial · 📋 specced · 🔴 blocked / wrong today.
> Lift: **XS** under an hour · **S** one PR · **M** 1–3 PRs · **L** a wave · **XL** multiple waves.

---

## 0. The measurement that should shape everyone's expectations

| Store | Rows | Note |
|---|---:|---|
| `spaces.preferences.profileLayout` | **17** | all already in `rows` shape; **0** legacy `slots`; 17 carry `content`, 15 carry `style` |
| `spaces.preferences.profileLayoutDraft` | **0** | no in-flight drafts to reconcile |
| `profiles.meta.entityGrid` | **0** | 🎉 the member grid has **zero** stored documents |
| `pages` | **5** (2 published) | all root-Space marketing |
| `campaigns.block_json` | **12** | `EntityLayout`, email kind |
| `email_templates.block_json` | **7** | `EntityLayout`, email kind |
| `nurture_steps.block_json` | **0** | — |
| `app_instances` | **0** | confirms "zero writers, zero readers" |
| `page_settings` | 36 | untouched by node-id keying; relevant to §4 |

**41 documents total.** The scary-sounding storage-shape migration is a fixture file. The genuine
risk is concentrated in **19 email documents on two cron send paths with no visual gate** (and email
is actively sending — 297 in the last 30 days, most recent today), and in
the ~40 code files that assume one block per type.

---

## 1. Node-id keying

### 1.1 What is actually true today

`lib/entity-blocks/rows-ops.ts:52` opens `normalize()` with `const seenBlocks = new Set<string>()`
and `:61` refuses any block id already in it. **The same dedupe is implemented five more times,
independently:**

| Site | Function | Line |
|---|---|---|
| `lib/entity-blocks/rows-ops.ts` | `normalize` | 52, 61 |
| `lib/entity-blocks/layout.ts` | `parseRows` | 204, 226 |
| `lib/entity-blocks/layout.ts` | `sanitizeRows` | 258, 266 |
| `lib/entity-blocks/layout.ts` | `sanitizeEntityLayout` | 405, 408 |
| `lib/entity-blocks/layout.ts` | `resolveRows` | 644, 652 |
| `lib/entity-blocks/layout.ts` | `mergeEntityLayout` (`placed`) | 373 |

The invariant is enforced on parse, on sanitize (twice), on merge, on every mutation, **and again on
render.** Fixing one does nothing. ⚠️ An earlier draft counted five sites and missed
`sanitizeEntityLayout` — the count is **six**, and a missed site is exactly how this survives a
refactor.

Three structures depend on uniqueness and collapse without it:

- **`content` / `style` are keyed by block id** (`EntityLayout.content?: Record<string, …>`,
  `layout.ts:168-171`). Two `text` blocks would share one bag.
- **`deriveBench()`** (`rows-ops.ts:142`) is `blocksForKind(kind) − placed − hidden`. "The palette
  minus what you used" is only meaningful when a type can be used once.
- **`hidden: string[]`** is a set of block ids, so hiding one `text` hides every `text`.

The renderer contract is `renderBlock: (blockId: string) => ReactNode` (`entity-grid.tsx:62`), fed by
`nodes: Record<string, ReactNode>` (`live-profile-grid.tsx:47`). **The block-id key runs from storage
to DOM.**

### 1.2 The target shape — go straight to the inline tree

Do **not** ship the intermediate "cells hold node ids, `content` stays a sibling map re-keyed by node
id." The reason is security, not elegance.

`sanitizeContentMap` / `sanitizeStyleMap` (`block-content.ts:1291`, `:1305`) iterate
`KNOWN_BLOCK_IDS` as the write-key allowlist **precisely so a user-supplied key is only ever read,
never used as a write property name** — CodeQL `js/remote-property-injection`, stated outright at
`layout.ts:443-447`. Node ids are minted client-side and arrive over the wire. Re-keying those maps
by node id **destroys the allowlist** and replaces it with a regex guard, which is strictly weaker.

An inline tree has no user-controlled property names at all, because `cells` is an array of objects:

```ts
// lib/entity-blocks/layout.ts
type BlockNode = {
  nid: string        // NODE_ID_RE = /^n[0-9a-z]{6,12}$/i — generated, STABLE FOREVER
  type: string       // the registry block id (what `cells: string[]` used to hold)
  v: number
  content?: Record<string, unknown>
  style?: BlockStyle
  hidden?: boolean   // replaces the document-level `hidden: string[]`
}

interface RowDef { id, columns, cells: BlockNode[][], ratio?, title?, headerOn?, mt?, mb? }
```

`EntityLayout.content` and `.style` are **deleted, not re-keyed.**

### 1.3 What replaces the dedupe

Per-**type** limits, not global uniqueness — and the policy already exists in the sibling system.
`lib/page-editor/block-limits.ts` caps `PRIMARY_BLOCK_LIMIT = 1` and `DESIGN_BLOCK_LIMIT = 3`
"because a second instance would double-render the same live content." Port that reasoning: cap
`data`-category and `CORE_PROFILE_BLOCK_IDS` blocks at 1 per document; leave `content`-category
blocks (`heading`, `text`, `image`, `quote`, `divider`, `button`) unlimited.

**That is what makes two text blocks legal while keeping two `offerings` blocks illegal** — which is
the actual requirement, not "remove the check."

`deriveBench` splits in two: `palette(kind)` (every legal type, always insertable, no subtraction)
and a **stored** `bench: BlockNode[]`. Benching then moves the node out of `cells` with its content
intact — which is what the docstring at `rows-ops.ts:13-15` already claims and cannot deliver,
because today a benched node has no identity off the row.

### 1.4 Files that change

**Core model (7)** — `layout.ts` · `rows-ops.ts` · `block-content.ts` · `layout-equal.ts` ·
`member-grid-meta.ts` · `registry.ts` · a new `lib/entity-blocks/block-limits.ts`.

**Renderers + editor (13)** — `entity-grid.tsx` (`renderBlock(id)` → `renderNode(node)`) ·
`live-profile-grid.tsx` · `profile-layout-context.tsx` (`selectedId` → `selectedNid`) ·
`profile-page-builder.tsx` · `space-canvas/*` (4) · `admin/email-studio/*` (4) ·
`member-profile-modules.tsx` · `space-profile-modules.tsx` · `owner-profile-layout-preview.tsx` ·
`profile-spotlight-blocks.tsx` · `owner-space-layout-preview.tsx`.

**Actions + routes (12)** and **downstream libs (14)** — email-studio (6), nurture (3), importer (5),
`spotlight/data.ts`, `beta/launch-emails.ts`, `ai/messaging-generator.ts`.

**68 files import the three core modules.** ~2,800 lines of test to rewrite.

### 1.5 Ordered steps

1. Add `BlockNode`, `NODE_ID_RE`, `genNodeId()`. Ship the type only.
2. Write `upgradeLayout(raw): EntityLayout` — pure, total, **idempotent**, minting `nid`
   **deterministically** (`n` + hash of `rowId:col:index:type`) so re-running is stable. Test against
   all 41 real production documents in a frozen fixture.
3. Call it at the top of `parseEntityLayout`. **Every reader is now node-shaped and nothing has been
   written.** This is the safe halfway point — the app runs on both shapes.
4. Convert `resolveRows`, `sanitizeRows`, `mergeEntityLayout`: delete the five `seen` sets, add the
   per-type limit.
5. Convert `rows-ops.ts` to `nid` ops; fold content/style into the node; split `deriveBench`.
6. Convert `entity-grid.tsx`, then the 13 renderer/editor files, then the store.
7. Convert the 12 action/route files and the 14 downstream libs.
8. Replace `sanitizeContentMap`/`sanitizeStyleMap` with per-node `sanitizeBlockContent(node.type, …)`.
9. Backfill. **Keep `upgradeLayout` in the read path forever** — it costs nothing on an upgraded
   document and it is the only defence against a stale row in a preview branch.

### 1.6 Data migration

**No SQL migration.** All five stores are opaque JSONB. Recommended: **lazy upgrade-on-read plus a
one-shot script.** `upgradeLayout` in `parseEntityLayout` makes every read correct on day one; then
`scripts/upgrade-entity-layouts.mjs` (service-role, `--dry-run`, per-row diff) normalizes the 41
rows. If it is never run, nothing breaks.

A SQL `jsonb`-surgery migration is **not** viable: the transform needs the registry to know a type's
category and validate its content, and SQL does not have the registry.

Snapshot first — `create table _entity_layout_backup_20260810 as select id, preferences from
public.spaces where preferences ? 'profileLayout'`, and the same for the 19 email documents.

### 1.7 What could break

| Risk | Detail |
|---|---|
| 🔴 **The email crons — TWO, not three** | `/api/cron/nurture` and `/api/cron/space-campaigns` render the 19 email documents through `renderEmailLayout` (`render.ts:637`), which does `content[id]`. ⚠️ **`/api/cron/space-drips` does NOT touch block documents at all** — `lib/spaces/drip-runner.ts:63` builds HTML from a plain-text `space_drip_steps.body` and never imports `compileEmailDoc`. An earlier draft counted it. **Two outbound send paths, no visual gate.** Golden-string tests land *before* `render.ts` is touched, not after |
| 🔴 **`layout-equal.ts` is a byte comparison** | It powers the "unpublished changes" badge and draft-discard. Changing the canonical shape makes every Space read dirty exactly once — harmless, but expect it. Worse: `layout-equal.test.ts:94-111` asserts on the **source text** of `actions.ts`, so those fail on any rename |
| ⚠️ **`selectedId` is the shared editor selection** | With duplicate types allowed, selection must key on `nid` or clicking the second text block focuses the first |
| ⚠️ **`MEMBER_CHROME_BLOCK_IDS` locked rows** | `profile-page-builder.tsx:1062` passes `lockedIds` — a type-level lock over what is now a node list. Becomes "lock every node of these types" |
| ⚠️ **`lib/importer/compose.ts`** | Builds `content[id] = bag` from Vera's plan (`:120`, `:128`). Both `compose_page` and `planToLayout()` assume one node per type |
| ✅ **Member grids** | Zero stored rows. No migration risk at all on `profiles.meta.entityGrid` |

**Lift: L** on its own. With §7 (the CRDT) it is the reason E0 is **XL**.

---

## 2. Unknown-block preservation

### 2.1 The bug, and how much of the fix already exists

`lib/page-editor/templates/index.ts:50-54` — `content.every(b => KNOWN_BLOCKS.has(b.type))`. **10
call sites in 9 route files.** Eight of them degrade a live page to a template. The ninth is the
destructive one:

`app/(main)/edit/[slug]/page.tsx:28` — *"Prefer the saved draft, but only if every block in it is
still a known block type."* **One renamed block type and the operator opens the editor to a code
template, publishes, and the draft is gone.**

✅ **The renderer is already correct and the plan should absorb that.** `block-render.tsx:171`
(`if (!ctx.config.components[item.type]) return null`), `:185` and `:223` already skip an unknown
item without throwing — documented as deliberate Puck parity. The editor is already tolerant too
(`desktop-editor.tsx:448`, `mobile-editor.tsx:598`/`:677`, `data-ops.ts:57` all fall back to
`entry?.label ?? block.type`). **Nothing preserves-or-discards at the render layer. The entire bug is
one loader predicate.**

### 2.2 The replacement

```ts
/** Well-formed: content is a non-empty array of {type:string}. Says NOTHING about whether the
 *  types are known — that is the renderer's problem, not the loader's. */
export function isWellFormed(data: unknown): data is Data

/** Every block resolves. Used ONLY to decide whether to seed a brand-new page from a template.
 *  NEVER to discard a stored document. */
export function isFullyKnown(data: Data): boolean

/** The unknown types present, for the editor placeholder and check:doc-safety. */
export function unknownTypes(data: Data): string[]
```

- **Live page:** `isWellFormed(published) ? published : template`. An unknown node renders nothing
  (already true). The rest of the page survives.
- **Editor:** the draft is never discarded. An `UnknownBlock` placeholder renders a selectable,
  movable, deletable card naming the type — `puck.isEditing`-only, so a visitor never meets it.
- **Round-trip:** the placeholder holds the original `props` **by reference** and re-emits it
  untouched. `data-ops.ts` mutations already spread `Item` opaquely, so this is free. `makeItem`
  throwing on an unknown type (`data-ops.ts:100`) is correct and stays.

### 2.3 What could break

- ⚠️ **`check:render-path` is exact-match** and all 8 gated route files are in the change set. It
  counts top-level components declared **beside the default export**, so `UnknownBlock` must live in
  `lib/page-editor/config.tsx` or a `components/page-editor/blocks/` sibling — **not** in a route
  file. Any count that does move edits `scripts/render-path-bodies.txt` in the same PR.
- ⚠️ **A document that was silently falling back is now rendered.** If either of the 2 published
  `pages` rows currently fails the predicate, its page **changes appearance on deploy.** Diff
  `isFullyKnown` over both before shipping.
- ⚠️ `pricing/page.tsx:303` uses the predicate as a branch, not a ternary — verify the else-branch.

**Lift: M.** One predicate, nine routes, one new CI gate and its corpus.

---

## 3. `page_versions` + publish as a pointer swap

### 3.1 Today

`app/(main)/edit/actions.ts:24-41` — publish is a single upsert writing `data` **and**
`published_data` to the same value. **The previous published document is gone.** `unpublishPage`
nulls `published_data` and keeps `data`; that is the only recovery that exists, and it only rescues
the draft.

### 3.2 On RLS — the house convention here is *not* a quad

`pages` is service-role-only and fail-closed: RLS on, **no policies**, listed `internal` in
`scripts/table-grants.txt:188` and in `scripts/rls-deny-all.txt:60`. **A version table holding the
same documents must not be more reachable than the table it versions.** So the correct posture is
RLS-on-no-policy plus the explicit `revoke` that `check:grants` requires — exactly `claim_tokens` and
`signup_leads`.

The permissive quad becomes correct only when E10 un-gates per-Space authoring. Write it into the
migration as a **commented Phase 2 block**, which is precisely what `20260924000100_app_instances.sql`
did, and it worked.

```sql
create table if not exists public.page_versions (
  id            uuid primary key default gen_random_uuid(),
  page_id       uuid not null references public.pages(id) on delete cascade,
  space_id      uuid references public.spaces(id) on delete cascade,  -- denormalized: the tenancy wall
  revision      integer not null,        -- monotonic per page_id, 1-based
  data          jsonb not null,          -- IMMUTABLE. Never updated after insert.
  title         text,
  seo_title     text,
  seo_description text,
  og_image_url  text,
  note          text,                    -- optional operator label
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create unique index if not exists page_versions_page_revision_key
  on public.page_versions (page_id, revision);
create index if not exists page_versions_page_created_idx
  on public.page_versions (page_id, created_at desc);
-- An unindexed FK makes a profile delete scan this table.
create index if not exists page_versions_created_by_idx on public.page_versions (created_by);

alter table public.page_versions enable row level security;
revoke all on table public.page_versions from anon, authenticated;
```

Plus on `pages`: `add column if not exists published_version_id uuid references public.page_versions(id) on delete set null`.

**Publish becomes:** insert an immutable version row, then `update pages set published_version_id = …`.
That update is the pointer swap. **Rollback is one row update** — no data movement — which is what
makes it a real rollback rather than a restore.

`published_data` is kept and dual-written for one full release, then dropped once the read path moves.

⚠️ **Ledger edits in the same PR:** `scripts/table-grants.txt` (`page_versions internal`) and
`scripts/rls-deny-all.txt`. `check:grants` enforces a **bijection**, so a new table with no verdict
fails CI.

### 3.3 What could break

- 🔴 **`published_data` has two readers on the marketing critical path.** Dual-write for a full
  release; **do not flip the read in the same PR as the write.**
- ⚠️ **Concurrent publish races** on `max(revision)+1`. The unique index is what makes the race
  *safe*; retry on `23505` or take an advisory lock on `page_id`.
- ⚠️ **Unbounded growth.** Ship a retention decision now (keep last 50 per page + every version ever
  pointed at) or it becomes an E2 cleanup.
- ⚠️ `pages.space_id` is nullable; `page_versions.space_id` must mirror that or the FK fails on an
  untenanted row.

**Lift: M.**

---

## 4. `app_instances` writers

### 4.1 🔴 A vocabulary collision that blocks the first writer

`surface_type` carries `check (surface_type in ('page','space','email','spotlight','rail','other'))`.
[`EDITOR-ARCHITECTURE`](EDITOR-ARCHITECTURE.md) §3 declares a **different** vocabulary:
`profile-inapp | spotlight-public | space-profile | space-site`.

**These do not map one-to-one.** The architecture's headline finding is that `profile-inapp` and
`spotlight-public` are two surfaces of one kind — and the CHECK constraint has a single value
(`spotlight`) covering both. This *is* E0's "surface-vocabulary reconciliation" line item, and it is
**blocking**: the first writer either conforms to the old enum and immediately needs a widening
migration, or the enum is widened first. **Widen it first.** A CHECK change is drop-and-add, so it is
**NOT ADDITIVE** under `docs/WORKFLOW.md` and needs the deliberate-apply treatment. Pre-flight is
trivial — 0 rows.

### 4.2 The first writer

Not the Puck page editor and not `page_settings`. It is **`saveSpaceGridLayout`**
(`app/(main)/spaces/[slug]/settings/profile/actions.ts:158`) — the one place a node acquires a
durable placement identity, which §1 is what grants.

```ts
// lib/apps/instances.ts (new, ~120 LOC)
syncInstancesForSurface(
  spaceId: string,
  surface: { type: SurfaceType; ref: string | null },
  nodes: Array<{ nid; type; slot; position }>,
  actorProfileId: string,
): Promise<void>
```

Every clause earns its place:

1. **`app_instances.id = node.nid`.** The migration's own comment says `id == the layout slot's
   block_id`. §1's `nid` **is** that identity — which is why §4 lands after §1 and not before.
2. **`manifest_key` = the registry block type.** `app_asset_id` stays NULL; the column is nullable
   exactly so a code-only App still places.
3. **Reconcile, never replace.** Delete-all-then-insert loses `created_at` and breaks any analytics
   keyed on placement age.
4. **The layout JSONB stays the placement authority.** Do **not** start reading placements from this
   table in E0 — that is E2. E0's writer makes the table *true* so E2 can build the usage index on it.
5. **Best-effort, never blocking.** A failed instance sync must not fail a layout save; the table has
   no reader yet and a gap is recoverable by the rebuild scan §5 of the architecture already requires.
6. **Service-role**, matching every other writer. The Phase 2 quad exists for future anon reads.
7. **`space_id` comes from the server-resolved Space, never from the wire.**

Call it on **publish**, not on every 600 ms autosave.

**Lift: M** (S for the writer; M once the non-additive vocabulary migration is counted).

---

## 5. `platform_flags.render_path`

### 5.1 The constraint that shapes it

**`platform_flags.value` is `boolean`** (`lib/database.types.ts:9501`). There is no jsonb column, so
a per-surface map cannot live in one row.

**Decision: one boolean key per surface** — `render_path_marketing`, `render_path_space_profile`,
`render_path_spotlight`, `render_path_email`, `render_path_site`. Five rows, and every one gets
`platform_flag_events` audit and the existing `setPlatformFlag` writer for free.

Rejected: a JSON string in `platform_settings`. It loses the audit ledger (`listFlagEvents` reads
`platform_flag_events`, which `setPlatformSetting` never writes) and it needs a parser that can fail.

### 5.2 Default direction — the reflex is wrong

Seed every key **`false`** (the old path) and flip per surface at cutover. **The `catch` default must
also be `false`:** a database hiccup must never silently promote an unproven renderer onto a live
page.

⚠️ Note the asymmetry against `demoModeEnabled` and `referralsEnabled`, which default **true** on
error. A reviewer pattern-matching on those will copy the wrong default — **say why in the comment**,
the way `veraBreakerArmedFlag:210-212` does.

### 5.3 Where the toggle lives

`app/(main)/admin/page-layout/` — the console already exists, already has `actions.ts`, and already
manages per-route chrome, **so no `ADMIN_MODULES` / `SPACE_MODULES` row is needed and `check:menu`
stays green.**

⚠️ **A flag nobody reads is worse than no flag.** Ship the reader wired into at least one branch
point in the same PR, or it becomes another `surfaces.page = {}`.

**Lift: S.**

---

## 6. The `bindings.tsx` claim — 🔴 it was wrong

**`lib/apps/bindings.tsx` does not exist, nothing imports it, and the build is green.** An earlier
draft of [`EDITOR-ARCHITECTURE`](EDITOR-ARCHITECTURE.md) §2.4 and of E0's scope line said three
modules still imported a deleted file. That was false and both are corrected.

Evidence: `lib/apps/` has 16 files and no `bindings.tsx`; `git log` has never seen that path; the
three cited lines (`catalog.ts:7-8`, `types.ts:7-8`, `app-registry.tsx:14`) are **header comments**,
and two of them say the module is deliberately *not* used from there; a repo-wide grep returns 12
hits, **all comments**, in 8 files; `tsc --noEmit` exits **0**, and a missing module is `TS2307`,
which is not suppressible here.

**The underlying gap is real and worse than a broken import.** The resolver was never written, so
349 App rows still cannot resolve to a component — and unlike a broken import, that fails *silently*,
by letting the rows look resolvable. It is `check:surface-binding` work, and that gate lands in **E0** with the other four
([ADR-977](DECISIONS.md) D-10) — only its *green-on-the-new-registry* proof belongs to E1.

**Lift: XS**, and it *removes* an item from E0.

---

## 7. The CRDT — what [ADR-976](DECISIONS.md) D-2 adds

Multiplayer is the reason E0 is **XL** rather than **L**. Full design in
[`EDITOR-ARCHITECTURE`](EDITOR-ARCHITECTURE.md) §4.1; the E0-specific work:

| Item | Detail | Lift |
|---|---|:---:|
| **Add the dependencies** | ⚠️ `yjs`, `y-prosemirror`, `@tiptap/extension-collaboration` — **none is installed.** Tiptap 3.29 + ProseMirror are, but v3 dropped v2's `y-prosemirror` re-export, so this is three new packages, not zero. Check bundle impact against the public-render ratchet in the same PR | S |
| **Yjs document schema** | `Y.Array` of nodes, `Y.Map` per node's `content`, `Y.Text` for rich text | M |
| **Bidirectional mapping** | `toYDoc(tree)` / `serialize(ydoc)`, with `serialize(toYDoc(t)) === t` as a hard test over the frozen 41-document corpus | M |
| **Realtime channel + authz** | Supabase Realtime broadcast; a client may only join a page it can edit — checked server-side, not by the client's own claim | M |
| **Awareness** | Presence + cursors, ephemeral. **A cursor that reaches the database is a bug** | S |
| **Debounced snapshot** | Encoded state into the draft row; `page_versions` stores **serialized trees, not CRDT state**, so a restored version is readable without a CRDT runtime | S |
| **`Y.UndoManager`, per client** | Undo reverts *your* edit, never a collaborator's. A shared undo stack is a defect, not a simplification | S |
| **Reconnect / offline** | Update buffering and replay | M |

🔴 **The hard constraint: zero editor bytes on the public render.** No CRDT, no Realtime client, no
awareness in a visitor bundle. Ratcheted in `EDITOR-ARCHITECTURE` §7.3 because this regresses via an
innocent shared import, not via a decision.

⚠️ **Server authority weakens.** The server cannot reject an edit — clients converge independently —
so **schema validation moves to a boundary at snapshot-and-publish time**, and an invalid
intermediate state is normal rather than an error. This is a real change to where validation lives
and it must be designed in, not discovered.

**Sequencing:** the CRDT work depends on §1 (nodes must have stable ids before they can be CRDT
entries) and is otherwise parallel to §2–§6.

---

## 8. The ordered task list

Sequenced by hard dependency, not by size. One PR per row unless noted.

| # | Task | Depends on | Lift | Gate to land it |
|---:|---|---|:---:|---|
| **1** | Correct the `bindings.tsx` claim in the docs; tidy the three header comments | — | XS | — |
| **2** | `render_path` flags — 5 seeded-**false** rows, reader, `/admin/page-layout` toggle | — | S | Readable + auditable in `platform_flag_events` |
| **3** | **`isWellFormed`/`isFullyKnown`/`unknownTypes`**; stop discarding documents at all 10 call sites; `UnknownBlock` placeholder | — | M | `check:render-path` green, ledger untouched |
| **4** | `check:doc-safety` + the frozen corpus (41 real documents + synthetic unknown-type cases) | 3 | S | New gate green, wired into `ci.yml` |
| **5** | `page_versions` migration + both ledger rows + regenerate types | — | S | `check:migrations` · `check:rls` · `check:grants` |
| **6** | Publish as pointer swap; dual-write; `revertToVersion`; version-history **Focus** panel (one line in `page-chrome.ts`) | 5 | M | publish → revert → publish round-trips |
| **7** | Drop `published_data` from the read path, then the schema | 6, +1 release | S | Zero readers remain |
| **8** | `BlockNode` + `upgradeLayout()` — pure, total, idempotent, deterministic ids | 4 | M | `upgrade(upgrade(x)) === upgrade(x)` for all 41 |
| **9** | Call `upgradeLayout` in `parseEntityLayout` — readers node-shaped, nothing written | 8 | S | Full suite green; visual diff zero |
| **10** | Delete the five dedupe sets; per-type limits; `bench` becomes stored | 9 | M | Two `text` blocks coexist; two `offerings` refused |
| **11** | `rows-ops.ts` → node ops; content/style fold in; per-node sanitize | 10 | M | CodeQL clean; no user-originated write key anywhere |
| **12** | Renderers + editor — `renderNode`, the 13 files, `selectedNid` | 11 | M | old ⇄ new `renderToStaticMarkup` equal per block |
| **13** | 🔴 **Email path** — `render.ts` + 6 siblings | 12 | M | **Email golden strings land first.** 19 live documents on 3 crons |
| **14** | Actions, routes, importer, AI — 12 route/action + 8 lib files | 12 | M | `check:doc-safety` green on the corpus |
| **15** | Backfill `scripts/upgrade-entity-layouts.mjs` — dry-run, per-row diff, snapshot first | 14 | S | 41 rows normalized; re-run is a no-op |
| **16** | `app_instances` surface-vocabulary widening (**NOT ADDITIVE**, deliberate apply) | 11 | S | 0 rows, so no validation risk |
| **17** | `lib/apps/instances.ts` + first writer on `saveSpaceGridLayout`'s publish path | 16, 11 | M | Publishing writes N rows whose `id` = the node ids |
| **18** | **CRDT** (§7) — schema, mapping, channel + authz, awareness, snapshot, undo, reconnect | 11 | L | Round-trip exact; two clients converge; **zero editor bytes public** |

**Critical path: 8 → 9 → 10 → 11 → 12 → 13**, with **18** branching off 11. Items 1–7 and 16 are
fully parallel.

⚠️ **Item 3 should land first regardless of everything else.** It is the only item on this list that
is *currently destroying author work* every time a block type is renamed.

---

## 9. Two prerequisites from outside E0

- ⏳ **`FINALIZE-PLAN` 1.2/1.3** (recapture the 72 stale visual baselines) **gate E0's START**
  ([ADR-976](DECISIONS.md) D-8); the *rest* of FINALIZE Phase 1 gates E1. An earlier draft of this
  bullet said 1.2 gates "E1, not E0" and then cited D-8 saying the opposite in the same sentence.
  Items 8–14 are additionally covered by `renderToStaticMarkup` equivalence, which works even while
  the visual suite is red — that is a second net, not the reason to start early.
- ✅ **Branch protection — CLOSED 2026-08-10.** The ruleset now requires `checks` · `analyze` ·
  **`lint`** · **`test`**, verified by reading it back. Every gate specified above is a real gate.
  ⚠️ `pr-compare` remains advisory on purpose: requiring it before the baselines are recaptured
  would block every PR on a pre-existing failure. Pair the two changes.
