# The Loom — the built-in asset library (DAM)

> **This doc explains the Loom; it does not track whether the Loom is done.** Status lives only in
> [`BUILD-BACKLOG.json`](BUILD-BACKLOG.json) (the `PROG-D*` rows) and, for the phase runway, in
> [BUILD-LIST.md → The Loom](BUILD-LIST.md). Catalog ([ADR-478](DECISIONS.md)) + DAM tables
> ([ADR-480](DECISIONS.md)) are the foundation the phases D1–D7 build on. The line this replaced —
> "No UI/editor built yet" — was contradicted by the Loom Studio section three paragraphs below it,
> which is exactly why prose does not get to hold status.

## What it is

The Loom is the built-in **digital-asset-management** system for the whole web editor: one place
that hosts every image and asset for the site, protects them, lets you edit and version them, and
is callable from every upload point in Puck. Frequency runs a master library; **every entity also
gets its own Loom**. It grows for years without a code deploy per asset.

## Owner decisions (2026-07-01)

- **In-browser editor:** **Filerobot Image Editor** (OSS) — crop with aspect frames, rotate,
  adjust, filters, compress.
- **Privacy:** build a **full** protection system, but **develop it later** — only the schema
  hooks land now (`is_protected`, `download_policy`, `expires_at`, private-bucket-ready).
- **Scope:** **every asset is space-scoped.** Frequency's shared/master library is the **root
  space's** Loom (`space_id` is NOT NULL). A child space's effective library = its own ∪ root's.
- **Transforms:** **on-the-fly** (a width/format request against the master). **Editing an image
  saves a new version** (non-destructive; the original is never overwritten).
- **Backfill:** **everything** — existing `site-media` URLs get ingested into the catalog and
  references rewritten.

## Loom Studio (`/admin/library`)

The janitor-facing studio ([ADR-483](DECISIONS.md)):

- **Layout** uses the shared **`RailGrid`** template (mobile-first): the folder rail is a **mini menu
  on the left** at every width — a slim rail on phones, never stacked above the grid — with the card
  grid beside it. On phones the grid opens with a full-width single card, then falls to two-up.
- **Folder rail** (left): **All** · by **Type** · by **Category** (smart folders from the
  `category` field) · **Collections** (custom folders — `library_collections`; an asset can be in
  many). Navigation is URL-driven and preserves the search + sort. New / rename / delete collection
  live in the rail.
- **Header** (full width): Create-with-Vera, the active-folder heading + count, search, type, sort,
  and a **view-mode** switch — so the rail and grid columns align vertically beneath it.
- **Grid** (right): searchable, sorted, paginated (48/page). Three view modes — **Cards** (default),
  **Compact**, and **List** (URL `?view=`). Click a card to open the detail drawer.
- **Semantic search** (Phase 1, [RESEARCH-ASSET-GEN.md](RESEARCH-ASSET-GEN.md)): a **"Most relevant"**
  sort runs meaning-based search (query embedding → nearest assets), and **"Find similar"** in the
  drawer (`?similar=<id>`) surfaces an asset's neighbours. Powered by the reserved
  `library_assets.embedding` (384‑d, key‑free gte‑small via `embedText()`), the `match_library_assets`
  / `similar_library_assets` RPCs, and the `embed-library` cron (content‑hash gated). Degrades to
  keyword search when AI is off or nothing is embedded yet.
- **Bulk edits**: select cards (or the whole page), then **add to collection**, **set category**,
  **add tags**, **archive**, or **delete** across the selection.
- **Design with Vera**: every SVG element has a "Design with Vera" panel in the drawer with two
  modes — **Tweak** (a surgical change that keeps the graphic nearly identical; default) and
  **Redraw** (rebuild it from an understanding of the render, for bigger changes). Both **preserve
  the original's colors + style** — edits never impose the create-vibe. Vera can SEE the current
  render (vision) and **checks her own work** conservatively (only fixing clear breakage: Redraw
  auto-checks, Tweak checks on demand). Saved edits land in `config.svg`; clearing it restores the
  original code render ([ADR-484](DECISIONS.md)/[485](DECISIONS.md)/[486](DECISIONS.md)).
- **Create (one smart panel)**: a single `CreateStudio` surface where you pick **what** you're making
  (Icon · Spot art · Illustration · Trophy/reward · Card · Texture) and it routes to the right engine
  ([ADR-490](DECISIONS.md)). **Vera** draws quick house-style **line marks** (icons/spot art) as inline
  SVG you review before saving — instant, no cost. The **Image Studio** (Recraft) generates richer
  **vector or raster** art (illustrations/trophies/cards/textures) and adds it straight to the library
  ([ADR-488](DECISIONS.md)). One-tap **smart prompts** fill an on-brand starter per type; a **Quick /
  Rich** toggle lets icons/spot art choose Vera vs the Studio. Studio types are hidden/disabled unless
  `RECRAFT_API_KEY` is set; the Studio is janitor + budget-gated (`recraft` cap, $0.04 raster / $0.08
  vector) and called server-side only. Clients: `create-studio.tsx`, `lib/loom/recraft.ts`; actions:
  `vera-actions.ts` + `recraft-actions.ts`.
- **Edit (drawer)**: a file-backed asset can be edited in place with **Vectorize**, **Remove BG**, or
  **Variation** — each **non-destructive** (snapshots the current state to `library_versions` first). A
  **Versions** list restores any prior state with one click (rollback snapshots current first, so it's
  reversible). Backbone: `lib/library/versions.ts`.
- **Brand styles (matching sets)**: train a reusable **house style** so a whole generated set looks
  like one family ([ADR-489](DECISIONS.md)). Select 1–5 on-brand images in the grid → **"Train style"**
  in the selection bar → name it + pick the lane. The style is saved (`library_styles`, the Recraft
  `style_id` + a name), and the Create panel's **Style** picker offers it when generating; every image
  with that style selected matches. Styles are per-space and forgettable. Data layer: `lib/library/styles.ts`.

## Code-drawn elements (registries)

Beyond stored files, The Loom catalogues the app's hand-authored house-style SVG art as
`kind='element'` rows. Each stores `config = { registry, name }` (plus `pillar` for circle
templates). The registry tells the renderer which live source component to draw from, so the
catalogue never drifts into stale copies ([ADR-482](DECISIONS.md)):

| `registry` | Source | What | viewBox |
| --- | --- | --- | --- |
| `illustration` | `components/marketing/illustrations` | Marketing spot art (kit, lead funnel, onboarding, On Air reveal) | 240×150 |
| `icon` | `components/on-air/icons.tsx` | On Air control icon kit (currentColor) | 24×24 |
| `spot` | `components/feed/zap-menu-art.tsx` | Zap-menu / On Air row tiles | 120×80 |
| `circle-template` | `components/circles/template-art.tsx` | The twelve Starter Circle scenes | 240×110 |
| `texture` | `components/marketing/vector-art.tsx` | Abstract brand textures | various |

- **Single source:** `lib/library/element-catalog.ts` (plain data — titles/categories/tags/pillar,
  used for seeding + validation) and `lib/library/element-registry.tsx` (client resolver —
  `renderRegistryElement`/`isRenderableElement`). Add art to a source component, add a catalog entry,
  seed a row: it appears (and sorts) in Loom Studio, with SVG/PNG export.
- **Vera** (`vera-actions.ts`) draws NEW elements in either mode — a `graphic` (240×150 spot art) or
  an `icon` (24×24 line mark) — saved with the SVG in `config.svg` under "Vera cards" / "Vera icons".
- **Not catalogued:** data-driven visuals (admin charts, the frequency-signature radar, season/breath
  gauges, mockup frames, one-off UI marks) are dynamic components, not reusable assets.

## Data model

The DAM entities (migrations `20260919000000_library_assets.sql` +
`20260920000000_library_dam.sql`). **Two of the original five no longer exist** — see the 🔴 note
under the table before building against either.

| Table | Purpose | Notable columns |
|---|---|---|
| `library_assets` | The **master** record | `kind`, `title`, `slug`, `description`, `category`, `tags[]`, `colors[]`; `space_id` (NOT NULL; **root space = shared**); file payload (`storage_*`/`url`/`mime`/`width`/`height`/`bytes`) or parametric `config jsonb`; ingest meta (`sha256`, `alt`, `blurhash`, `focal_x/y`, `orig_width/height`); protection hooks (`is_protected`, `download_policy`, `expires_at`); `search_tsv` + `embedding vector(384)` |
| `library_versions` | Non-destructive edit history | `version`, `recipe jsonb` (a full **asset snapshot** — url/storage/mime/dims/config — from any edit source: a Recraft edit, a Vera SVG save, or a Filerobot recipe), `is_current` (one per asset), `note`; see `lib/library/versions.ts` |
| `library_styles` | Trained Recraft brand styles for matching sets ([ADR-489](DECISIONS.md)) | `name`, `recraft_style_id`, `lane` (vector/raster), `ref_count`; space-scoped, service-role/fail-closed; see `lib/library/styles.ts` |
| `library_collections` + `_items` | Arbitrary groupings ("Q3 sales funnel"), space-scoped | `title`, `slug`; items are many-to-many with `sort` |

> 🔴 **`library_renditions` and `library_usages` were created and then DROPPED.** Corrected
> 2026-08-24 (the renditions half; the usages half was already corrected in
> [BUILD-LIST.md](BUILD-LIST.md) and [LOOM-PLATFORM.md](LOOM-PLATFORM.md) and never here). Both were
> created in `supabase/migrations/20260920000000_library_dam.sql` (lines 47 and 101) and dropped
> five days later in `supabase/migrations/20260925000000_retire_orphaned_tables_and_functions.sql`
> (lines 16 and 17), each verified to have 0 code references, 0 incoming FKs, 0 triggers and 0
> policy dependencies first. Measured against the live database on 2026-08-24, `public` holds
> `library_assets`, `library_collection_items`, `library_collections`, `library_styles` and
> `library_versions` — and neither of the two.
>
> - **Usages** has a named replacement: `block_usage`, derived rather than written directly
>   ([ADR-975](DECISIONS.md)), after [ADR-979](DECISIONS.md) deleted every reader of the old table.
>   D4 below builds that write path from zero.
> - **Renditions has no replacement, and does not need one.** The owner decision above says
>   transforms are **on-the-fly**, which means a rendition is a *request* (a width + format against
>   the master) and never a row, so `RENDITION_PRESETS` belongs to the D3 resolver and no table
>   returns. `HYG-017` settled it; [ADR-1121](DECISIONS.md) struck "the rendition set" from D1's
>   scope, which was the last line in the tree still reading the other way. Do not add rendition
>   writers.

Typed contract: `lib/library/types.ts`; rendition + crop-frame presets (targets for the on-the-fly
resolver, not a table schema): `lib/library/renditions.ts`. Access is **service-role only** for now
(like `public.pages`); per-space client RLS lands with the tenancy phase.

## Best-practice architecture

- **Blocks store an asset reference** (`assetId` + rendition/crop), not a raw URL, so we can
  re-version, track usage, and swap globally. A denormalized URL is cached alongside for legacy
  compatibility; the render path resolves reference → CDN URL.
- **One master, many renditions.** Serve web-optimized renditions (thumb/grid/hero/og), never the
  master, in pages and grids. Transforms are on-the-fly against the master.
- **Non-destructive editing.** Every edit (Recraft op, Vera SVG save, Filerobot recipe) first
  **snapshots** the asset's current state into a new `library_versions` row (`lib/library/versions.ts`
  `recordVersion`) and flips `is_current`, then overwrites the live row. Rollback restores a snapshot
  (and snapshots current first, so it's reversible). The prior states are never lost.
- **Every upload ingests** ([ADR-1121](DECISIONS.md)). Validate → **strip EXIF/XMP/IPTC** →
  **checksum + dedupe** → read dimensions → write the catalog row. One function does the server half:
  `ingestImageBytes` in `lib/library/ingest.ts`, called by every upload site with the bytes it is
  about to store.
  - **Order matters.** The checksum is taken AFTER the strip, so it describes the object that is
    really on disk — and two exports of one photo that differ only in metadata dedupe to one asset.
    Dedupe reads `(space_id, sha256)`, the pair `library_assets_sha256_idx` indexes; it is
    space-scoped, because a global match would hand one space another space's asset.
  - **The strip keeps orientation.** EXIF's rotation tag lives in the same APP1 block as the GPS
    coordinates, so the strip re-emits a 32-byte APP1 carrying Orientation alone. Dropping APP1
    wholesale renders every portrait phone photo sideways. `ICC_PROFILE` and the `Adobe` marker are
    kept too: neither is personal and both change how the file decodes.
  - **🔴 The server decodes no pixels, and it must stay that way.** Blurhash and the colour palette
    need a decode, and server-side that means `sharp` — already at 67 functions of `check:og-trace`'s
    100 budget, in a seam the picker, page editor, importer and email studio all reach. They are
    computed in the BROWSER (`lib/library/image-describe.ts`) and posted as three validated fields.
    See `docs/DEPLOY-SAFETY.md`.
  - **Not everything can ingest.** A path that files an object already in storage (the importer, an
    event photo) never holds the bytes: it writes `bytes: null` — "unknown", not the `0` it used to
    claim — and no checksum. A server-side generator gets a checksum and dimensions but no blurhash
    (`HYG-021`).

- **Search is ranked over two indexes** ([ADR-1121](DECISIONS.md)). A query runs BOTH arms the schema
  already carries and merges them: full text (`search_tsv @@ websearch_to_tsquery`, stemmed and
  word-oriented) and trigram (`ilike '%q%'`, served by the title `gin_trgm_ops` index, which is what
  survives a typo). Neither is a superset of the other. Ordering is computed in process by
  `lib/library/search-rank.ts`, because PostgREST can filter on a tsvector but cannot `order by
  ts_rank` — no migration, and `rankLibraryMatches` is the one seam a `search_library_assets` RPC
  would replace if a Loom outgrew the candidate cap.
- **Usage index** powers "used on N pages," archive-not-destroy, and global swap.
- **One `AssetField`** (Upload / Pick from library / Paste URL) replaces `ImageField` at every
  upload point (Puck first, then branding / Spotlight / OG / email).

## Scoping

- `space_id = <root space>` → the **Frequency shared/master** library.
- `space_id = <entity>` → that **entity's own** Loom.
- Effective view for a space = its rows ∪ root's, badged "Frequency" vs "Yours". Using a shared
  asset **references** it; editing **forks** a private copy (`parent_id` → master). No space→space
  sharing in v1; per-plan storage quota via entitlements.

## Build sequence (D1–D7)

See [BUILD-LIST.md → The Loom](BUILD-LIST.md) for the ranked, statused list:

1. **D1 — Ingest + gallery + ranked search** (the standard site image gallery: the ingest pipeline
   above, `/admin/library` browser, view/edit-meta/download, FTS+trigram ranked search). Shipped;
   see [ADR-1121](DECISIONS.md).
2. **D2 — AssetField seam** (unified picker; store references; render resolution; backfill
   `site-media`).
3. **D3 — Editor + versions** (Filerobot crop-frames + adjustments; version-on-edit; rollback).
4. **D4 — Organization at scale** (collections, saved views, tag governance; usage index + safe
   delete + global swap).
5. **D5 — Per-space Looms** (space-scoped libraries, fork-on-edit, quotas, per-space console,
   client RLS, entitlements/flags).
6. **D6 — Privacy system** (private bucket, signed URLs, storage RLS, download gating + audit,
   EXIF strip, optional watermark) — full build, done later.
7. **D7 — Semantic + AI** (pgvector search, AI auto-tag/color, background removal/upscale).

## Non-goals (v1)

Video/audio, full Figma-grade editing (layers/vector/text), space→space sharing, a public asset
marketplace, and the Weave generative composer — all later.
