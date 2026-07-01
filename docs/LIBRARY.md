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

## Data model

The five DAM entities (migrations `20260919000000_library_assets.sql` +
`20260920000000_library_dam.sql`):

| Table | Purpose | Notable columns |
|---|---|---|
| `library_assets` | The **master** record | `kind`, `title`, `slug`, `description`, `category`, `tags[]`, `colors[]`; `space_id` (NOT NULL; **root space = shared**); file payload (`storage_*`/`url`/`mime`/`width`/`height`/`bytes`) or parametric `config jsonb`; ingest meta (`sha256`, `alt`, `blurhash`, `focal_x/y`, `orig_width/height`); protection hooks (`is_protected`, `download_policy`, `expires_at`); `search_tsv` + `embedding vector(384)` |
| `library_renditions` | Derived files off a master | `kind` (thumb/grid/hero/og/source/custom), `recipe jsonb` (on-the-fly transform), storage + dims |
| `library_versions` | Non-destructive edit history | `version`, `recipe jsonb` (the Filerobot edit), `is_current` (one per asset), `note` |
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
- **Non-destructive editing.** Edits are a `recipe`; saving produces a new `library_versions` row
  and flips `is_current`. Rollback = flip back. The original is immutable.
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
