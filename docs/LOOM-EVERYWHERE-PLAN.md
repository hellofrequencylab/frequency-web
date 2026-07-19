# Loom everywhere — the phased plan to route every image upload through the Loom picker

**Goal:** every image upload in the app opens the ONE Loom picker popup
(`components/loom/loom-picker.tsx`). No surface keeps a bare file input or a paste-URL-only
control. A person's uploads live in their personal Loom (`library_assets.created_by`); an image
uploaded while editing a Space is attached to that Space and shared to its team; the picker's rail
offers Images / Elements (AI) / Tags plus one category per Space you run; the top box uploads by
click-multi or drag-and-drop.

**Already shipped (PR #1818):** the reusable `LoomPicker`, `lib/loom/picker-actions.ts`
(`loomScopes` / `loomImages` / `uploadLoomImage`, personal + per-space, service-role upload so no
RLS trap), and the shared URL-mode `ImageUpload` routed through it. That covers the Journey editor,
Space cover/logo, Practice/Circle/Event covers, and the SEO header/OG images.

## Scope — in vs out

**IN (convert to the picker)** — reusable entity/content image fields:
covers, logos, headers, avatars, galleries, page-editor image/gallery blocks, spotlight assets,
space-canvas block images, community-feed images, QR logo, seeder images, personal-appearance
background, feed-post images.

**OUT (leave as direct capture/upload)** — not library-reuse:
live camera scans (ID card, event ticket scan), CSV / data imports, and AI *source-document*
uploads (Journey/Circle PDF/Word outlines, the Event Spark source flyer). These are one-shot inputs,
not "pick an image from your library," so a Loom popup would be wrong for them. Noted per surface.

## The two foundation pieces (Phase 0)

Most conversions are blocked on two shared capabilities:

1. **Multi-select in the picker** — a `multiple` mode that returns `string[]`, for galleries.
2. **URL-or-path rendering** — components that stored storage *paths* (galleries) must accept a full
   Loom URL too. The resolver becomes: an `http(s)` value renders as-is; any other value is treated
   as a bucket path (`getPublicUrl`). Existing path rows keep working; new picks store the Loom URL.
   No data migration.

## Phases

| Phase | Scope | Surfaces |
|---|---|---|
| **0. Foundation** | Picker `multiple` mode + URL-or-path resolver helper | `loom-picker.tsx`, `multi-image-upload.tsx` |
| **1. Single-image primitives** | Route the remaining single-image controls | `InlineCover` (page hero, practice cover, circle cover), page-editor `ImageField`, `SpotlightAssetField`, `SpaceImagePopup` |
| **2. Galleries (multi)** | Route multi-image controls (store URLs, back-compat) | `MultiImageUpload` (event gallery, shop, market, housing), page-editor `GalleryImagesField` |
| **3. Raw file inputs** | Profile + onboarding + misc | avatar, profile header, onboarding avatars (classic + beta ×3), community feed, personal-appearance background, QR logo, business/listing seeders |
| **4. Consolidate bespoke pickers** | Dedupe onto the one picker | `loomImageField` (Puck), email `LoomImagePopup`, `EventLoomPicker`, `ShowCoverPicker` |
| **5. Picker enhancements** | Complete the popup spec | AI "Create" (Recraft) in Elements; Airwaves recordings tab in the Loom |

Each phase: implement → `tsc` + `lint` + `test` → `build` → commit. Persistence rule: the picker
returns a URL; each surface persists that URL through its EXISTING save path (an `onChange` the
parent already saves, or the surface's existing "set URL" server action), so no new write paths
where one already exists.

## Verification gate (every phase)

`pnpm exec tsc --noEmit` · `pnpm lint` · `pnpm test` · `pnpm build` (compile + types). The menu
drift-guard and the full vitest suite must stay green.
