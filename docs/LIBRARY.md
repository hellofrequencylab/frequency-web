# The Loom — the built-in asset library (DAM)

> **Status: spine shipping.** Catalog ([ADR-478](DECISIONS.md)) + DAM tables
> ([ADR-480](DECISIONS.md)) are the foundation; the functional phases (D1–D7) are sequenced in
> [BUILD-LIST.md → The Loom](BUILD-LIST.md). No UI/editor built yet.

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
  **vector or raster** art (illustrations/trophies/cards/textures) ([ADR-488](DECISIONS.md)). One-tap
  **smart prompts** fill an on-brand starter per type; a **Quick / Rich** toggle lets icons/spot art
  choose Vera vs the Studio. Both engines are **preview-first** ([ADR-491](DECISIONS.md)): the Studio
  generates **drafts** you review in a preview strip (adjust the style/count and **Regenerate**), then
  **Publish** into the Loom, **Save draft** (kept under a **Drafts** folder in the rail, hidden from the
  published library until published), or **Discard**. Drafts can also be published later from the
  drawer's Publish banner. Studio types are hidden/disabled unless `RECRAFT_API_KEY` is set; the Studio
  is janitor + budget-gated (`recraft` cap, $0.04 raster / $0.08 vector) and called server-side only.
  Clients: `create-studio.tsx`, `lib/loom/recraft.ts`; actions: `vera-actions.ts` + `recraft-actions.ts`
  (`generateStudioDraft`/`publishAssets`/`discardDrafts`).
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

The five DAM entities (migrations `20260919000000_library_assets.sql` +
`20260920000000_library_dam.sql`):

| Table | Purpose | Notable columns |
|---|---|---|
| `library_assets` | The **master** record | `kind`, `title`, `slug`, `description`, `category`, `tags[]`, `colors[]`; `space_id` (NOT NULL; **root space = shared**); file payload (`storage_*`/`url`/`mime`/`width`/`height`/`bytes`) or parametric `config jsonb`; ingest meta (`sha256`, `alt`, `blurhash`, `focal_x/y`, `orig_width/height`); protection hooks (`is_protected`, `download_policy`, `expires_at`); `search_tsv` + `embedding vector(384)` |
| `library_renditions` | Derived files off a master | `kind` (thumb/grid/hero/og/source/custom), `recipe jsonb` (on-the-fly transform), storage + dims |
| `library_versions` | Non-destructive edit history | `version`, `recipe jsonb` (a full **asset snapshot** — url/storage/mime/dims/config — from any edit source: a Recraft edit, a Vera SVG save, or a Filerobot recipe), `is_current` (one per asset), `note`; see `lib/library/versions.ts` |
| `library_styles` | Trained Recraft brand styles for matching sets ([ADR-489](DECISIONS.md)) | `name`, `recraft_style_id`, `lane` (vector/raster), `ref_count`; space-scoped, service-role/fail-closed; see `lib/library/styles.ts` |
| `library_collections` + `_items` | Arbitrary groupings ("Q3 sales funnel"), space-scoped | `title`, `slug`; items are many-to-many with `sort` |
| `library_usages` | Where each asset is referenced | `context` (page/space_brand/spotlight/email/other), `ref_id`, `block_id` |

Typed contract: `lib/library/types.ts`; rendition + crop-frame presets: `lib/library/renditions.ts`.
Access is **service-role only** for now (like `public.pages`); per-space client RLS lands with the
tenancy phase.

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
- **Every upload ingests.** Validate → checksum + **dedupe** → strip EXIF → extract
  dimensions/colors/blurhash → generate the standard rendition set → write the catalog row. Heavy
  work runs in a background/edge job so uploads feel instant.
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

1. **D1 — Ingest + gallery** (the standard site image gallery: ingest pipeline, `/admin/library`
   browser, view/edit-meta/download).
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
