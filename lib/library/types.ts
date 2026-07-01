// The Loom — asset library / DAM types. The single typed contract over the
// library_assets catalog (migration 20260919000000) and its DAM spine — renditions,
// versions, collections, usage index (migration 20260920000000). Kept dependency-free
// so server actions and editor UI can both import it. See docs/LIBRARY.md, ADR-478/480.

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

/** Who may download the original (renditions follow their own delivery rules). */
export const LIBRARY_DOWNLOAD_POLICIES = ['open', 'members', 'staff'] as const
export type LibraryDownloadPolicy = (typeof LIBRARY_DOWNLOAD_POLICIES)[number]

/** Derived-file roles off one master. `custom` = an editor-produced crop/transform. */
export const LIBRARY_RENDITION_KINDS = ['thumb', 'grid', 'hero', 'og', 'source', 'custom'] as const
export type LibraryRenditionKind = (typeof LIBRARY_RENDITION_KINDS)[number]

/** Surfaces an asset can be referenced from (for the usage index / safe delete / swap). */
export const LIBRARY_USAGE_CONTEXTS = ['page', 'space_brand', 'spotlight', 'email', 'other'] as const
export type LibraryUsageContext = (typeof LIBRARY_USAGE_CONTEXTS)[number]

/** Parametric payload for non-file kinds. An element points back into the code registry;
 *  a template/flow carries Puck content; a theme carries a token set. Loosely typed on
 *  purpose (the shape varies by kind and grows over time). */
export type LibraryConfig = Record<string, unknown>

/** A non-destructive edit recipe (crop/rotate/adjust/output). Produced by the editor and
 *  stored on a rendition or a version; the master is never overwritten. */
export type LibraryRecipe = {
  crop?: { x: number; y: number; width: number; height: number } // pixels on the master
  rotate?: number
  flipH?: boolean
  flipV?: boolean
  adjust?: { brightness?: number; contrast?: number; saturation?: number; sharpness?: number }
  output?: { format?: 'jpeg' | 'png' | 'webp' | 'avif'; quality?: number; width?: number; height?: number }
}

/** A row in `public.library_assets`. Mirrors the migrations column-for-column. */
export type LibraryAsset = {
  id: string
  kind: LibraryKind
  title: string
  slug: string
  description: string | null
  category: string | null
  tags: string[]
  colors: string[]
  /** Always set: Frequency's shared/master library is the ROOT space's Loom. */
  spaceId: string
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
  // Ingest metadata
  sha256: string | null
  alt: string | null
  blurhash: string | null
  focalX: number | null
  focalY: number | null
  origWidth: number | null
  origHeight: number | null
  // Protection (system developed later; columns are the hooks)
  isProtected: boolean
  downloadPolicy: LibraryDownloadPolicy
  expiresAt: string | null
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

/** A derived file off a master (`public.library_renditions`). */
export type LibraryRendition = {
  id: string
  assetId: string
  kind: LibraryRenditionKind
  recipe: LibraryRecipe | null
  storageBucket: string | null
  storagePath: string | null
  url: string | null
  mime: string | null
  width: number | null
  height: number | null
  bytes: number | null
  createdAt: string
}

/** A point in an asset's non-destructive edit history (`public.library_versions`). */
export type LibraryVersion = {
  id: string
  assetId: string
  version: number
  storageBucket: string | null
  storagePath: string | null
  recipe: LibraryRecipe | null
  note: string | null
  isCurrent: boolean
  createdBy: string | null
  createdAt: string
}

/** An arbitrary grouping of assets (`public.library_collections`). */
export type LibraryCollection = {
  id: string
  spaceId: string
  title: string
  slug: string
  description: string | null
  createdBy: string | null
  createdAt: string
}

export type LibraryCollectionItem = {
  collectionId: string
  assetId: string
  sort: number
}

/** One place an asset is used (`public.library_usages`). */
export type LibraryUsage = {
  id: string
  assetId: string
  context: LibraryUsageContext
  refId: string | null
  blockId: string | null
  updatedAt: string
}

/** A new asset before it has server-assigned fields. */
export type NewLibraryAsset = Pick<LibraryAsset, 'kind' | 'title' | 'slug' | 'spaceId'> &
  Partial<Omit<LibraryAsset, 'id' | 'createdAt' | 'updatedAt'>>
