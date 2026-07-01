# The Loom — the built-in asset library

> **Status: foundation shipped (catalog + storage).** The rest is sequenced in
> [BUILD-LIST.md → The Loom](BUILD-LIST.md). Decision record: [ADR-478](DECISIONS.md).

## What it is

The Loom is the built-in asset library for the whole web editor. Every entity gets its own
library; Frequency shares a master set. It holds **images, themes, app assets, and Puck-droppable
elements/templates/flows**, and it is meant to grow for years without a code deploy per asset.

The headline feature is search. We build it Supabase-native: Postgres full-text + `pg_trgm`
(typo-tolerant) with faceted filters now, and `pgvector` semantic search as a fast-follow.

## Data model (shipped)

One polymorphic catalog table, `public.library_assets`
(migration `supabase/migrations/20260919000000_library_assets.sql`):

| Concern | Columns |
|---|---|
| What it is | `kind` (`image · icon · element · template · flow · theme · app_asset`), `title`, `slug`, `description`, `category`, `tags[]`, `colors[]` |
| Ownership | `space_id` (**null = Frequency shared master**, set = that entity's own), `visibility` (`private · space · public`), `status` (`draft · in_review · approved · final · archived`) |
| File payload | `storage_bucket`, `storage_path`, `url`, `mime`, `width`, `height`, `bytes` |
| Parametric payload | `config jsonb` — an element registry ref, a Puck block/fragment, or a theme token set. Kept as data so it stays theme-aware and re-colorable, not a flat image |
| Provenance / lifecycle | `source`, `license`, `attribution`, `usage_count`, `version`, `parent_id`, `created_by`, timestamps |
| Search | generated `search_tsv` (GIN) + `title` `pg_trgm` GIN + `tags` GIN; `embedding vector(384)` reserved for semantic |

Slug is unique per scope (once across the shared set, once per space) via partial unique indexes.

### Storage

File-backed assets live in the public `library-media` bucket (20 MB cap; image types + SVG +
JSON). Reuses the `site-media` pattern: public read for CDN rendering, writes through
staff/operator-gated server actions.

### Access

Phase 1 is **service-role only** (RLS enabled, no policies), exactly like `public.pages`: the
catalog is managed and read through gated server actions with the admin client. Per-tenant,
client-facing RLS lands with the tenancy phase.

## Scoping model

- `space_id IS NULL` → the **Frequency shared master library** (curated centrally).
- `space_id = <id>` → that **entity's own library**.
- A tenant's effective library = its own rows ∪ the shared rows. (Read composition + RLS: tenancy
  phase.)

## Roadmap

Foundation (this doc + the migration + `lib/library/types.ts`) is shipped. Everything after it is
tracked in [BUILD-LIST.md → The Loom](BUILD-LIST.md):

1. **Seed** the existing kit/themes/flows into the catalog (the 17 illustration elements as
   `element` rows, the LeadFunnel as a `flow` row, the theme registry as `theme` rows).
2. **Editor integration** — a `type:'custom'` "insert from library" picker + Library panel; a
   `LibraryImage` / `LibraryElement` / `LibraryFlow` block.
3. **Tenancy + roles** — per-space libraries, upload-to-library, client RLS, capability keys
   (`library.view` / `library.manage`), entitlements `library.*`, feature flags.
4. **Semantic search** — populate `embedding`, hybrid FTS+vector ranking (RRF, matching the
   practice-library pattern), AI auto-tagging + color extraction, collections/favorites.
5. **The Weave composer** — brand-token-aware element/texture designer, versioning UI,
   cross-tenant publishing.
