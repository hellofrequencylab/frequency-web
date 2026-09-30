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

- **In-browser editor:** the **native Canvas 2D crop/rotate editor** ([HYG-109](BUILD-BACKLOG.json),
  [ADR-1592](DECISIONS.md)): crop to a `CROP_FRAMES` frame or freeform, quarter-turn rotate, and
  straighten, with zero dependencies, loaded through `next/dynamic` from the asset drawer, saving
  through `replaceLibraryAssetFile` so `recordVersion` runs first. **Owner ruling 2026-09-29:
  "Native is enough."** Filerobot is not added; this supersedes the 2026-07-01 Filerobot pick and
  its 2026-09-22 re-confirmation ([ADR-1496](DECISIONS.md)). [HYG-132](BUILD-BACKLOG.json), which
  asked native vs Filerobot, closed on that ruling.
- **Privacy:** build a **full** protection system, but **develop it later** — the schema hooks
  landed first (`is_protected`, `download_policy`, `expires_at`, private-bucket-ready), and since
  [LIVE-576](BUILD-BACKLOG.json) ([ADR-1577](DECISIONS.md)) the product reads and sets them: the
  Studio drawer's Protection section writes all three, every pick reader (`listLoomScopeImages`,
  `searchSpaceLibraryImages`) leaves out a row whose `expires_at` has passed, and the Studio grid
  badges that row Expired instead of hiding it from its owner. Since
  [LIVE-577](BUILD-BACKLOG.json) ([ADR-1595](DECISIONS.md)) **Protected moves the file**:
  `protectLibraryAsset` copies the current object and every version's object from `library-media`
  into the private `library-private` bucket (`20270345009550`, `public = false`, no storage policy
  for anon or authenticated, service role only), rewrites the asset and version rows to follow,
  and removes the public copies; switching it off moves them back. A protected row's `url` is
  **null** (never a signed value, which would be a stored expiry, and never a bare path, which
  every reader would paint as a relative image), and `signedLibraryAssetUrl` in
  `lib/library/asset-urls.ts` is the one signing function: the Studio mints a one-hour signed URL
  per protected row at render time. **A protected asset is a download or a proof, not a page
  image**: protecting refuses while the usage index or any of the six column image references
  (HYG-068) points at the asset, when another row shares the file, and for a seed or import row
  (its Space may paint the importer's object by address), every pick reader already drops a row with no url, and the
  AssetRef refresh and the column-image readers skip it, so they stay fail-open and untouched.
  Audio and video refuse (recordings-media has no private twin), and so does a replace or a
  Recraft edit of a protected file. Since [LIVE-578](BUILD-BACKLOG.json)
  ([ADR-1596](DECISIONS.md)) **every download goes through one server door**,
  `GET /api/library/download/<id>` (`lib/library/download-door.ts`): it establishes the caller,
  refuses a missing file or an expired license, applies `download_policy` (`open`: anyone who
  reached the link; `members`: a signed-in profile; `staff`: the Loom Studio gate), writes one
  `public.library_downloads` row (`20270345009560`: service-role insert, staff read, no update or
  delete policy), and only then redirects, to a **one-minute** signed attachment for a protected
  original or the public url with storage's `download` flag for anything else. A download that
  cannot be recorded is refused. The drawer's Download is a link to the door and shows the record
  under `[data-loom-downloads]`; a code-drawn element still exports from the DOM (it has no file).
  Since [LIVE-580](BUILD-BACKLOG.json) ([ADR-1623](DECISIONS.md)) **a protected asset is shown
  only as its stored proof**: protecting writes a 480 px copy (the grid preset) into
  `library-private` at `proofs/<storage_path>` (`lib/library/proof-object.ts`); storage does the
  resize, nothing here decodes, and the proof's own header is checked for the width before it is
  stored. `proofLibraryAssetUrl` in `lib/library/asset-urls.ts` signs that object and never the
  master (a missing proof is written first), so no proof link can be edited into the original.
  Releasing or deleting the asset deletes the proof. The admin Studio grid and drawer, the Space
  Loom Studio and the picker all get the proof (`withLoomProofs` swaps the url and drops the
  storage key before a pick list leaves the server), and the picker shows a protected tile locked,
  so it can never be placed. No watermark (owner ruling 2026-09-29).
- **Scope:** **every asset is space-scoped.** Frequency's shared/master library is the **root
  space's** Loom (`space_id` is NOT NULL). A child space's effective library = its own ∪ root's.
- **Transforms:** **on-the-fly** (a width/format request against the master), with one
  amendment: a protected image stores one proof object (ADR-1623). **Editing an image
  saves a new version** (non-destructive; the original is never overwritten).
- **Backfill:** **everything** — existing `site-media` URLs get ingested into the catalog and
  references rewritten.

## Loom Studio (`/admin/library`)

The operator studio ([ADR-483](DECISIONS.md)). **Its door is `requireAdmin('janitor', { staff:
'marketing' })`** — `web_role` janitor, or any staff role holding `marketing:'write'`, because a
Marketer reaches Loom Studio ([ADR-851](DECISIONS.md)). The page has always said so; the **27 server
actions beside it were bare `requireAdmin('janitor')` until 2026-09-10**, so the page admitted a
Marketer and every control denied one (`LIVE-289`). They now all carry the page's own gate, and
`test/e2e/operator-reachability.test.ts` fails a watched operator route whose actions drift from its
page again.

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
  sort ranks words and meaning in one query, and **"Find similar"** in the drawer
  (`?similar=<id>`) surfaces an asset's neighbours. Most relevant is `search_library_assets`
  (LIVE-586, [ADR-1597](DECISIONS.md)), called from `lib/library/hybrid-search.ts`: a full-text arm
  (`ts_rank` over `search_tsv`), a title trigram arm and a cosine arm over
  `library_assets.embedding` (384‑d, key‑free gte‑small via `embedText()`), fused by reciprocal rank
  (k = 60), so an exact title beats a vague neighbour and a typo still gets meaning. With AI off or
  over budget the embedding is left out and the two word arms still rank. Find similar is
  `similar_library_assets`; the `embed-library` cron keeps embeddings fresh (content‑hash gated).
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
  `RECRAFT_API_KEY` is set; the Studio carries the page's gate above + is budget-gated (`recraft` cap, $0.04 raster / $0.08
  vector) and called server-side only. Clients: `create-studio.tsx`, `lib/loom/recraft.ts`; actions:
  `vera-actions.ts` + `recraft-actions.ts`.
- **Edit (drawer)**: a file-backed asset can be edited in place with **Vectorize**, **Remove BG**,
  **Upscale**, or **Variation** — each **non-destructive** (snapshots the current state to
  `library_versions` first). A **Versions** list restores any prior state with one click (rollback
  snapshots current first, so it's reversible). Backbone: `lib/library/versions.ts`. **Upscale**
  (LIVE-589) runs Recraft's crisp upscale (`upscaleImage`, $0.004 list) on a raster only: a vector is
  refused by the action and the chip is disabled with a line that says why. Every edit result is
  ingested (checksum + header dimensions), so an upscaled master records its new width and the rendition
  resolver serves it at the right size. Creative upscale ($0.25 list) is in the client, not the Studio.
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
| `library_versions` | Non-destructive edit history | `version`, `recipe jsonb` (a full **asset snapshot** — url/storage/mime/dims/config — from any edit source: a Recraft edit, a Vera SVG save, a file replace, or a crop/rotate save), `is_current` (one per asset), `note`; see `lib/library/versions.ts` |
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
> - **Usages** has a named replacement, and it is a QUERY, not a table ([ADR-1502](DECISIONS.md),
>   2026-09-21, superseding the `block_usage` table [ADR-975](DECISIONS.md) sketched):
>   `public.library_asset_usage(uuid)` and `public.block_type_usage(text)`
>   (`supabase/migrations/20270345007500`) are SECURITY INVOKER live scans over `pages`,
>   `spaces.preferences.pageDocs` / `puck` / `profileLayout(-Draft)` and `page_settings.layout`.
>   Exact by construction, nothing to refresh; 3 ms over the whole corpus when measured. The
>   read is `lib/library/usage.ts` (a failed read is `ok: false`, never zero, which is how the old
>   table died per [ADR-979](DECISIONS.md)); the surfaces are the Loom drawer's "Used on N pages",
>   the safe-delete guard in `deleteLibraryAsset`, and `pnpm block-usage`. The `app_instances`
>   trigger half of ADR-975 is `LIVE-454`, blocked on PROG-E0 re-creating that table.
> - **Renditions has no replacement, and does not need one.** The owner decision above says
>   transforms are **on-the-fly**, which means a rendition is a *request* (a width + format against
>   the master) and never a row, so `RENDITION_PRESETS` belongs to the D3 resolver and no table
>   returns. `HYG-017` settled it; [ADR-1121](DECISIONS.md) struck "the rendition set" from D1's
>   scope, which was the last line in the tree still reading the other way. Do not add rendition
>   writers.

Typed contract: `lib/library/types.ts`; rendition + crop-frame presets (targets for the on-the-fly
resolver, not a table schema): `lib/library/renditions.ts`. Access: `library_assets`,
`library_collections`, `library_collection_items` and `library_versions` carry per-Space client RLS
(`20270345009500`, [ADR-1594](DECISIONS.md), [LIVE-570](BUILD-BACKLOG.json)): the Space team reads its
own rows, any signed-in caller reads `visibility = 'public'` assets, writes go through
`private.can_write_space_content`, and a version is insert-only. `library_styles` stays
**service-role only**. The Space Loom reads through that wall ([LIVE-571](BUILD-BACKLOG.json),
[ADR-1613](DECISIONS.md)): `lib/library/space-loom-store.ts` lists one Space's images and tags, checks
that an id is the Space's own, and saves a title, alt or tags on the caller's session, with no import
of the admin client. The Space Loom Studio page, its actions and the picker's Space scope all read
there. Still on the service role, each for a stated reason: the picker's personal scope (a personal
upload lives in the root Space, which the per-Space policies do not open to its uploader), the upload,
the fork copy and the delete (each is half a storage write; storage policies are PROG-D6), version
history, and the admin Loom Studio.

## Best-practice architecture

- **Blocks store an asset reference** ([ADR-1130](DECISIONS.md)): an image value is
  `string | AssetRef` where `AssetRef = { assetId, url }` — the reference plus a cached CDN URL
  (`lib/library/asset-ref.ts`, pure; `assetRefUrl` is the one read). Legacy URL strings stay legal
  forever, which is what makes this a seam and not a stored-document migration. The picker offers
  the pair (`onSelectAsset`), the page-editor fields store it, the `BlockRender` walk unwraps every
  ref to its URL string before any block renderer sees props (so renderers never learn refs exist),
  and `getPublishedData` refreshes stale caches through `refreshAssetRefUrls`
  (`lib/library/resolve-refs.ts`) — fail-open to the cache at every grain, no query at all for a
  ref-free document. 🔴 The refresh decodes nothing and must never import `sharp` (same rule as
  ingest).
- **A Space profile document refreshes on load too** ([ADR-1495](DECISIONS.md), which closes
  PROG-D2). A Space page body is the same kind of Puck document, picked with the same fields, but
  it lives on `spaces.preferences.pageDocs[slug]` and had no refresh: `resolveSpacePageDoc` is pure
  by contract, so the refresh had nowhere to hang. `lib/spaces/page-doc.ts` is that seam — the
  Space-side twin of `getPublishedData`. `loadSpacePageDoc` resolves then refreshes;
  `loadSpaceAuthoredContent` does the same for the module engine's authored bag. The public profile
  body, the page editor (so the next publish heals the stored cache), and both module-engine
  authored reads load instead of resolve. `lib/spaces/profile-nav.ts` keeps the pure resolve on
  purpose: it reads the Home doc for section anchors, never for images. 🔴 This matters TODAY, not
  at D3 — `replaceLibraryAssetFile`, `rollbackToVersion` and the Recraft edits all re-point
  `library_assets.url` on a live row while keeping its id.
- **The entity-block system holds the same reference** ([ADR-1245](DECISIONS.md)). Its image
  fields (`url` fields with `upload`, gallery `images`, a Features or Card-grid item's `image`) are
  `string | AssetRef` too: `sanitizeBlockContent` keeps a well-formed ref in the shape it arrived
  (bounded id, `safeUrl` on the cached url, `alt` only when present) and drops anything less, and
  every renderer on that side reads through `safeImageUrl` (`lib/entity-blocks/block-content.ts`),
  which is `safeUrl` over `assetRefUrl`. A link field never takes the object shape. Its three
  writers now STORE the reference ([ADR-1253](DECISIONS.md)): the rail photo control, the rail
  gallery (`onSelectManyAssets`) and the on-canvas photo popup route the picker's asset hand-back
  through `assetValueFromPick`, the one ref-or-url mapping, and each DROPS the url-only `onSelect`
  (the picker fires both, so a control that keeps both writes the flat url over the ref). Editing a
  neighbouring field carries the ref through rather than flattening it. The entity layout blob has
  no refresh-on-load yet (there is no single load function to hang it on, and the cached url is the
  designed fail-open).
- **Column-backed image fields keep a url cache and a Loom id** ([ADR-1436](DECISIONS.md), HYG-068).
  `spaces.brand_logo_url`, `spaces.cover_image_url`, `page_content.hero_image`,
  `page_settings.og_image_url`, `page_settings.header_image_url` and `profiles.header_image_url` are
  still TEXT: the url is the denormalised cache and a companion `*_asset_id` is the reference
  (`lib/library/column-image.ts`). Pickers write both halves; readers prefer `library_assets.url`
  and fail open to the cache. A paste or a non-catalog upload nulls the companion. 🔴 Do not
  half-adopt by storing JSON in a text column: every reader of those columns is typed `string`.
- **One master, many renditions, resolved at REQUEST time** ([ADR-1496](DECISIONS.md), executing the
  owner's on-the-fly ruling on HYG-017). Serve web-optimized renditions (thumb 160 / grid 480 /
  hero 1600 / og 1200), never the master, in pages and grids. `renditionUrl(url, kind)`
  (`lib/library/rendition-url.ts`) is the one resolver and `RENDITION_PRESETS`' first production
  consumer: a **pure string rewrite** of `/storage/v1/object/public/` to
  `/storage/v1/render/image/public/` plus the preset width and `resize=contain`. No table, no
  writers, no `sharp` — that decode is exactly what materialising would have cost against
  `check:og-trace`. ⚠️ It **rewrites the path and keeps the host**: the catalog holds urls on the
  project domain *and* the `api.frequencylocal.com` custom domain, so rebuilding from
  `NEXT_PUBLIC_SUPABASE_URL` would re-point half the Loom. Fail-open — an external, `data:`,
  `blob:`, SVG, already-rendered or out-of-range url comes back unchanged. 🔴 A rendition url is
  **display-only and never stored**: the picker's `value` stays the master, because the whole point
  of the reference is that one master re-points everywhere. Measured: a 2,243,106-byte master
  returns 28,578 bytes at width 480, auto-negotiated to WebP. Billing is per distinct **origin**
  image per cycle, not per request.
- **Non-destructive editing.** Every edit (Recraft op, Vera SVG save, replace, crop/rotate) first
  **snapshots** the asset's current state into a new `library_versions` row (`lib/library/versions.ts`
  `recordVersion`) and flips `is_current`, then overwrites the live row. Rollback restores a snapshot
  (and snapshots current first, so it's reversible). The prior states are never lost.
- **Every upload ingests** ([ADR-1121](DECISIONS.md)). Validate → **strip EXIF/XMP/IPTC** →
  **checksum + dedupe** → read dimensions → write the catalog row. One function does the server half:
  `ingestImageBytes` in `lib/library/ingest.ts`, called by every upload site with the bytes it is
  about to store.
  - **Enforced by a test** ([ADR-1562](DECISIONS.md) §3, `LIVE-579`). `lib/library/ingest-coverage.test.ts`
    walks `lib/`, `app/` and `components/` for every file that `.upload(`s into `library-media` (by the
    constant, the literal or `classifyLoomUpload`) and fails naming the file when it skips the strip.
    Its exception list is empty and carries a reason column for the day one is needed.
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
    claim — and neither a checksum nor dimensions. A server-side GENERATOR does hold them, so it gets
    both, and the two columns a decode is needed for arrive one round-trip later
    ([ADR-1254](DECISIONS.md), `HYG-021`): the Studio client that asked for the image decodes what it
    is already looking at and posts the descriptor to `describeLibraryAssetAction`, which fills
    `blurhash`/`colors` only where they are null and validates them exactly as the upload path does.
    One shared client path (`lib/library/describe-generated.ts`) serves both generators. The importer
    seeds and the event-photo copies have no browser anywhere in the flow (an apply, a cron, a claim),
    so they are described ON VIEW instead ([ADR-1590](DECISIONS.md), `LIVE-588`): the Loom Studio grid
    and the Space Loom Studio run `useDescribeOnView` (`lib/library/describe-on-view.ts`), which after
    paint takes up to six rows on the page whose `blurhash` is null and sends each, one at a time,
    through that same shared path. A row nobody has ever opened stays without; a cron never can.
  - **Vera names what nobody named** ([ADR-1589](DECISIONS.md), `LIVE-587`). An upload lands with
    alt null and no tags, so it is findable only by its filename. `describeLibraryImage`
    (`lib/ai/library-tag.ts`, Haiku vision, `library-tag` cap) proposes up to eight tags, one sentence
    of alt text and a category from the ones the Space already uses; `fillLibraryAssetDescription`
    writes each only where it is still empty and marks a written tag set with the `vera` tag. The
    nightly `tag-library` cron (03:05 UTC, before `embed-library`) sweeps 40 unnamed images a run;
    Describe with Vera in the Studio drawer fills the empty fields for one image and Save writes them.

- **Search is ranked over two indexes** ([ADR-1121](DECISIONS.md)). A query runs BOTH arms the schema
  already carries and merges them: full text (`search_tsv @@ websearch_to_tsquery`, stemmed and
  word-oriented) and trigram (`ilike '%q%'`, served by the title `gin_trgm_ops` index, which is what
  survives a typo). Neither is a superset of the other. Ordering is computed in process by
  `lib/library/search-rank.ts`, because PostgREST can filter on a tsvector but cannot `order by
  ts_rank` — no migration, and `rankLibraryMatches` is the one seam a `search_library_assets` RPC
  would replace if a Loom outgrew the candidate cap.
- **Usage index** powers "used on N pages," archive-not-destroy, and global swap. The swap is
  `swapLibraryAssetRefs` in `lib/library/usage.ts` ([ADR-1560](DECISIONS.md)): a walk over the index's
  rows, one write per stored row, that re-points every `{ assetId }` ref from one asset to another and
  leaves every other value as it was. "Swap everywhere" in the drawer's usage panel is the door.
  The Space Loom Studio has the same guard on its own delete ([ADR-1586](DECISIONS.md)):
  `deleteSpaceLoomImage` refuses an image still placed on a page, and on a failed read, and the
  Studio's one-image editor shows the page count beside Remove. That editor edits title, alt and
  tags through `normalizeAssetMeta` (`lib/library/asset-meta.ts`), the rule the admin drawer uses.
- **One picker at every upload point.** The universal control is `components/loom/loom-picker.tsx`
  (16 consumers: page editor, entity blocks, Studio spark, branding, events, QR, email). The old
  "Upload / Pick / Paste URL" tri-mode plan was superseded by the owner directive recorded in the
  field headers: **the Loom is the only way in** — upload lives inside the picker, and there is no
  paste-a-URL box. Reference-storing adoption beyond the Puck fields (entity-block controls, spark
  fields) is `HYG-029`. Column-backed surfaces keep a companion `*_asset_id` ([ADR-1436](DECISIONS.md)).

## Scoping

- `space_id = <root space>` → the **Frequency shared/master** library.
- `space_id = <entity>` → that **entity's own** Loom.
- Effective view for a space = its rows ∪ root's, badged "Frequency" vs "Yours". Using a shared
  asset **references** it; editing **forks** a private copy (`parent_id` → master). No space→space
  sharing in v1.
- **Storage budget** ([ADR-1585](DECISIONS.md), [ADR-1602](DECISIONS.md)). A Space's Loom has a cap:
  `lib/library/quota.ts` `loomQuotaFor` reads it from `LOOM_STORAGE_CAP_BYTES` by plan tier (a
  larger-library entitlement is deferred to the owner). `loomStorageUsed` sums `bytes` over the Space's
  file-backed rows; a NULL size is reported as unknown, never as zero. `loomAdmits(spaceId, bytes)` is
  the one gate: it reads the owning Space, the cap, the sum and the verdict, and refuses past the cap
  or when anything cannot be read. Every door that stores new bytes into a Space's Loom asks it before
  storage and returns its refusal: `uploadLoomImage` (the picker and the Space Loom Studio),
  `uploadToLoom` (the page editor's field, every kind, since the sum weighs audio and video rows too)
  and `generateEntityCoverAction` (the AI cover, asked once before Vera draws and again with the
  cover's size). The root Space (and so a personal upload) is uncapped, as are the Loom Studio and
  email studio doors, which write to it. The Space Loom Studio shows the meter. The importer and
  event copies catalog an object already stored and carry no size.
- Built ([ADR-1587](DECISIONS.md), LIVE-569): the shared set is the root **by id** and public, never
  any Space's public row. The picker's space scope shows its own images first, then the Frequency
  ones (badged). The Space Loom Studio has a Frequency library shelf with **Make it yours**
  (`forkSharedLoomImage` → `forkLibraryAsset`), which copies the stored object to the Space's own
  path and inserts with `parent_id` = the master; a Space edit of a shared image forks first
  (`forkIfShared`). A fork is a copy of the file, never a second row on the master's path, and it asks
  `loomAdmits` before the copy is stored, like every other door that stores new bytes.

## Build sequence (D1–D7)

See [BUILD-LIST.md → The Loom](BUILD-LIST.md) for the ranked, statused list:

1. **D1 — Ingest + gallery + ranked search** (the standard site image gallery: the ingest pipeline
   above, `/admin/library` browser, view/edit-meta/download, FTS+trigram ranked search). Shipped;
   see [ADR-1121](DECISIONS.md).
2. **D2 — AssetField seam** (unified picker; store references; render resolution; backfill
   `site-media`).
3. **D3 — Editor + versions.** Shipped and closed ([ADR-1496](DECISIONS.md)): version-on-edit and
   rollback-via-`is_current` were already live (`lib/library/versions.ts`, three edit sources), and
   the on-the-fly rendition resolver landed with the row. The in-browser **crop/rotate editor**
   shipped native ([HYG-109](BUILD-BACKLOG.json), [ADR-1592](DECISIONS.md)):
   `app/(main)/admin/library/loom-crop-editor.tsx` over `lib/library/crop-geometry.ts`, no
   dependency, lazy-loaded, saving through the replace seam. The owner ruled native is enough
   (2026-09-29, [HYG-132](BUILD-BACKLOG.json)); Filerobot is not added.
4. **D4 — Organization at scale** (collections, saved views, tag governance; usage index + safe
   delete + global swap).
5. **D5 — Per-space Looms** (space-scoped libraries, fork-on-edit, quotas, per-space console,
   client RLS, entitlements/flags).
6. **D6 — Privacy system** (private bucket, signed URLs, storage RLS, download gating + audit,
   EXIF strip, optional watermark) — decomposed into LIVE-576 to LIVE-580 ([ADR-1562](DECISIONS.md)).
   LIVE-576 shipped: the hooks reach the product and an expired licence leaves every picker.
   LIVE-577 shipped: the private bucket, the protect move and the one signing function.
   LIVE-578 shipped: the download door and its append-only record.
   LIVE-580 shipped: the stored 480 px proof object, the only thing both Studios and the picker show.
7. **D7 — Semantic + AI** (pgvector search, AI auto-tag/color, background removal/upscale).
   Background removal and upscale (LIVE-589), describe on view (LIVE-588), auto-tag (LIVE-587) and the hybrid Most relevant rank (LIVE-586) are shipped ([ADR-1563](DECISIONS.md)).

## Non-goals (v1)

Video/audio, full Figma-grade editing (layers/vector/text), space→space sharing, a public asset
marketplace, and the Weave generative composer — all later.
