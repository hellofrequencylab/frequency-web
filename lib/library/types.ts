// The Loom — asset library catalog types. The single typed contract over the
// `library_assets` table (migration 20260919000000). Kept dependency-free so both
// server actions and future editor UI can import it. See docs/LIBRARY.md, ADR-478.

/** What a library asset is. File-backed kinds carry a storage path plus url; parametric
 *  kinds (element/template/flow/theme) carry `config` so they stay theme-aware, not flat images. */
export const LIBRARY_KINDS = [
  'image', // a raster/photo asset
  'icon', // a small single glyph
  'element', // a house illustration element (parametric, draw-in-code)
  'template', // a reusable single Puck block instance
  'flow', // a reusable multi-block Puck fragment (e.g. the LeadFunnel)
  'theme', // a token set / skin
  'app_asset', // logos, favicons, brand files
] as const
export type LibraryKind = (typeof LIBRARY_KINDS)[number]

/** Lifecycle, mirroring the brand-build ladder (draft → in_review → approved → final). */
export const LIBRARY_STATUSES = ['draft', 'in_review', 'approved', 'final', 'archived'] as const
export type LibraryStatus = (typeof LIBRARY_STATUSES)[number]

/** Who can see the asset within/across scopes. */
export const LIBRARY_VISIBILITIES = ['private', 'space', 'public'] as const
export type LibraryVisibility = (typeof LIBRARY_VISIBILITIES)[number]

/** Parametric payload for non-file kinds. An element points back into the code registry;
 *  a template/flow carries Puck content; a theme carries a token set. Loosely typed on
 *  purpose (the shape varies by kind and grows over time). */
export type LibraryConfig = Record<string, unknown>

/** A row in `public.library_assets`. Mirrors the migration column-for-column. */
export type LibraryAsset = {
  id: string
  kind: LibraryKind
  title: string
  slug: string
  description: string | null
  category: string | null
  tags: string[]
  colors: string[]
  /** null = the Frequency shared master library; set = that entity's own library. */
  spaceId: string | null
  visibility: LibraryVisibility
  status: LibraryStatus
  // File-backed payload
  storageBucket: string | null
  storagePath: string | null
  url: string | null
  mime: string | null
  width: number | null
  height: number | null
  bytes: number | null
  // Parametric payload
  config: LibraryConfig | null
  // Provenance + lifecycle
  source: string | null
  license: string | null
  attribution: string | null
  usageCount: number
  version: number
  parentId: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

/** A new asset before it has server-assigned fields. */
export type NewLibraryAsset = Pick<LibraryAsset, 'kind' | 'title' | 'slug'> &
  Partial<Omit<LibraryAsset, 'id' | 'createdAt' | 'updatedAt'>>
