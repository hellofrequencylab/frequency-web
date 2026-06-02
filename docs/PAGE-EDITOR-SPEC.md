# Visual page editor (Puck) — implementation spec

Make the **marketing pages** (`/`, `/the-lab`, `/how-it-works`, `/about`)
editable visually — content, images, and section order — without touching the
member app and without sacrificing speed.

> Status: **shipped**, then **reworked into a standardized block library**
> (ADR-055). **Puck** (open-source, self-hosted), constrained to our DAWN design
> system. The splash (`/`) is **code-locked** out of the editor (ADR-054) — only
> `/the-lab`, `/how-it-works`, `/about` are editor-editable. §4 + §12 are current;
> the rest is original spec kept for history.

---

## 0. Principles (what keeps it clean + fast)

1. **The editor is admin-only. The public site never ships a builder runtime.**
   Public pages are server-rendered from the DB with the *same* block components
   we already have → same speed as today.
2. **Palette = our design system.** Puck can only place our blocks
   (`ZigZag`, `Statement`, …), styled with DAWN tokens. No arbitrary CSS, no
   pixel-drag → can't go off-brand or bloat.
3. **Block/section-level layout, not pixel positioning.** Reorder / add / remove
   / edit sections. This is the guardrail that keeps it responsive + fast.
4. **Draft → Publish.** Edit a draft; publish to go live. Visitors never see
   half-finished edits.
5. **Owned.** Content in Supabase, images in Supabase Storage. No vendor in the
   data path, no per-page fees.

---

## 1. Architecture

```
EDIT (admin, /studio/pages/[slug]/edit)        PUBLIC (/, /the-lab, …)
┌───────────────────────────┐                  ┌───────────────────────────┐
│ <Puck config data         │                  │ fetch published_data       │
│   onPublish=save+publish/> │   Supabase       │ <Render config data/>      │
│  • drag/reorder blocks     │   `pages` table  │  (server, no editor JS)    │
│  • edit fields side-panel  │◀───draft/pub────▶│  ISR + revalidate-on-publish│
│  • image picker → Storage  │                  │  next/image ← Storage       │
└───────────────────────────┘                  └───────────────────────────┘
                 same Puck `config` (block palette) drives both
```

---

## 2. Data model — `pages` table (new migration)

```sql
create table public.pages (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,        -- 'home' | 'the-lab' | 'how-it-works' | 'about'
  title          text not null,
  data           jsonb not null default '{}'::jsonb,   -- Puck working DRAFT  { content:[], root:{} }
  published_data jsonb,                                 -- the LIVE version (public renders this)
  -- editable SEO (replaces per-page code metadata)
  seo_title       text,
  seo_description text,
  og_image_url    text,
  status         text not null default 'draft',  -- draft | published
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles(id) on delete set null,
  published_at   timestamptz
);
alter table public.pages enable row level security;
-- No policies: Studio reads/writes via staff-gated server actions (service role);
-- public render fetches published_data server-side with the admin client.
```

- **`data`** = the draft Puck document; **`published_data`** = what the public
  renders. Publish copies `data → published_data` + stamps `published_at`.
- (v2, optional) `page_revisions` table for rollback history.

---

## 3. Images — Supabase Storage

- New **public bucket** `site-media`.
- Custom Puck **image field**: uploads to `site-media`, returns the public URL,
  and shows a picker of existing uploads (list the bucket).
- Migrate `public/images/site/*` into the bucket as the initial library (or keep
  them as code defaults and upload new ones).
- Render with **`next/image`**; add the Supabase Storage hostname to
  `next.config` `images.remotePatterns`. (Supabase also offers on-the-fly image
  transforms if we want responsive sizes.)

---

## 4. Puck config — the standardized block library (`lib/page-editor/config.tsx`)

See **§12** for the full standardized catalog (ADR-055). In short: `config.tsx`
assembles per-group block fragments from `components/page-editor/blocks/*` into
one `config` (imported by **both** the editor `<Puck>` and the public `<Render>`),
and declares left-bar **categories**. Accent words use a `title` + optional
`accent` substring (rendered `text-primary`); dynamic blocks pull live data in
`render` via Puck `metadata`.

---

## 5. Editor (Studio, admin-only)

- `/studio/pages` — list the 4 editable pages + status + "last published".
- `/studio/pages/[slug]/edit` — the Puck editor:
  - `requireStaff('marketer')`. **Puck is dynamically imported here only.**
  - Loads `data` (draft). `<Puck config data onPublish={save+publish} />`.
  - Actions (server, staff-gated): `savePageDraft(slug, data)`,
    `publishPage(slug)` → copy draft to `published_data`, set status/published_at,
    `revalidatePath('/'|'/the-lab'|…)`.
  - Optional "Preview" route rendering the draft.
- Add **Pages** to the Studio nav.

---

## 6. Public rendering (fast)

Each marketing page becomes thin:

```tsx
// app/(marketing)/the-lab/page.tsx  (and app/page.tsx, etc.)
export const revalidate = 3600 // ISR; revalidatePath on publish makes it instant
export default async function Page() {
  const page = await getPublishedPage('the-lab')
  if (!page) return <LegacyTheLab />            // fallback during rollout
  return <Render config={config} data={page.published_data} />
}
export async function generateMetadata() { /* from page.seo_* */ }
```

- **`Render`** is Puck's server renderer — outputs the same component tree, **no
  editor JS**. Public bundle unchanged.
- **ISR + revalidate-on-publish** → static-fast, updates the moment you publish.
- **Fallback to the current hardcoded page** if no DB row yet → zero downtime
  during migration.
- The splash root `/` keeps its auth branch (logged-in → `/feed`); only the
  logged-out marketing render becomes data-driven.

---

## 7. Seeding (one-time)

Convert each current hardcoded page into Puck `data` (blocks) and insert the
`pages` rows, so day one the editor shows the **current live site**, fully
editable — not a blank canvas. Done via a seed script or by building each page
once in the editor.

---

## 8. SEO / metadata

Per-page `seo_title`, `seo_description`, `og_image_url` become editable fields
(currently hardcoded in each page's `metadata`). `generateMetadata` reads them;
falls back to `lib/site.ts` defaults. JSON-LD/sitemap unaffected.

---

## 9. Out of scope / guardrails

- ❌ Pixel-level absolute positioning / freeform canvas (kills responsiveness).
- ❌ Arbitrary HTML/CSS/code blocks (palette = our components only).
- ❌ The community/member app (unchanged).
- Legal/contact/beta pages stay in code for now (can join the CMS later).

---

## 10. Risks & decisions to confirm at build time

- **Accent/rich text:** simple `accent` field (MVP) vs a rich-text field (later).
- **Live-data blocks:** confirm they render in editor + public; cache strategy.
- **Image optimization:** `next/image` + Storage remotePattern (+ optional
  Supabase transforms for responsive `sizes`).
- **Revalidation correctness:** publish → `revalidatePath` the exact route.
- **Rollback:** v2 `page_revisions` (nice-to-have).
- **Bundle:** verify Puck editor is code-split to the editor route (it is, via
  dynamic import) so public Lighthouse is unchanged.

---

## 11. Build phases & effort (~3–5 days)

> **Status (all phases shipped).** The directory is at `/pages` (main nav
> **Manage → Pages**, **janitor-only**, not in the Studio); the editor is at
> `/edit/[slug]`. Access is gated by `lib/page-editor/guard.ts`. All 4 marketing
> pages (`/`, `/the-lab`, `/how-it-works`,
> `/about`) render from `pages.published_data` via `@measured/puck/rsc`
> `<Render>`, with the original hardcoded JSX kept as a `Legacy*` fallback (zero
> downtime if a row is missing/empty). Current content is seeded into the DB so
> the editor opens on the real design. Block palette: PageHero, ZigZag,
> Statement, BetaCTA, Marquee, ImageBand, Spacer, **Hero** (full-bleed splash),
> **FeatureGallery**, **Pillars** (dark band), and live **LiveStats /
> LiveEvents / LivePosts** (fed the public RPC data through Puck `metadata`).
> Presentational markup lives in `components/marketing/blocks.tsx`; live data in
> `lib/page-editor/live-data.ts`. Sub-pages are ISR (`revalidate = 3600`) +
> `revalidatePath` on publish; the splash stays dynamic for auth redirect.
>
> **Block controls (added later).** Every block has a collapsible **Layout**
> group (`lib/page-editor/layout.ts`): Space above / Space below (token scale
> none..xl = margins/buffers) and Show on (Everywhere / Desktop only / Mobile
> only). Image blocks have **image controls** (`lib/page-editor/image-controls.ts`):
> crop ratio, focal point, size, corner radius, shadow (ImageBand full set;
> ZigZag focal point). All token selects → Tailwind classes (no raw px, no image
> processing); helper fallbacks preserve the look of already-seeded blocks.
>
> **Optimized images (Phase 3).** `<SiteImage>` (`components/marketing/site-image.tsx`)
> wraps next/image — responsive srcsets + AVIF/WebP for every marketing image
> (splash Hero bg is `priority`/LCP, plus ImageBand, ZigZag, gallery tiles,
> Pillars). `next.config.ts` adds `remotePatterns` for public Supabase Storage so
> uploads are optimized too.
>
> **Advanced (Phase 4).** Inline **rich text** (`lib/page-editor/richtext.tsx`):
> `**bold**` / `*italic*` / `[link](/path)` parsed to React elements (safe-href,
> no dangerouslySetInnerHTML) in body copy. New blocks: **Text** (standalone rich
> paragraph) and **Columns** (2–3 columns via Puck **slot** fields — RSC-safe,
> verified). Feature-gallery gains Columns / Tile-crop / Corners controls. Only
> deferred polish: a visual drag focal-point/crop picker (the focal-point select
> already covers cropping).

1. **Foundation** — `pages` migration, `site-media` bucket, install
   `@measured/puck`, `lib/page-editor/config.tsx` for the core blocks + the
   custom image field. *(~1.5d)*
2. **Editor** — `/studio/pages` + `/[slug]/edit`, save/publish/revalidate
   actions, Studio nav entry. *(~1d)*
3. **Public render** — switch the 4 pages to `getPublishedPage` + `Render` with
   legacy fallback; seed current content; SEO fields. *(~1d)*
4. **Dynamic blocks + polish** — `LiveStats/Events/Posts`, preview, image picker
   UX, responsive `sizes`. *(~1d)*

**Packages:** `@measured/puck`. **Infra:** Supabase Storage (have it). **Touches:**
new `app/(studio)/studio/pages/*`, `lib/page-editor/*`, the 4 marketing page
files (thin), `next.config` (image host), one migration. **Member app: untouched.**

---

## 12. Standardized block library (ADR-055) — current

The palette is a **standardized, design-system block library** (not content-named
one-offs), grouped into left-bar **categories**, every block carrying the same
universal "adjust" controls plus, where relevant, variants.

### Foundation (the frozen contract every block composes from)
- **`lib/page-editor/fields.tsx`** — shared field atoms + resolvers: `toneField`
  (White / Cream / Dark / Transparent), `widthField` (Narrow / Default / Wide /
  Full), `alignField` (Left / Center), `imgField` (upload/pick/URL), `accentize`,
  and the `toneBg` / `isInk` / `widthClass` / `alignClass` resolvers.
- **`components/page-editor/blocks/kit.tsx`** — the `<Band>` universal section
  wrapper (paints background, spacing, visibility, content width + alignment);
  typographic atoms `Eyebrow` / `DisplayHeading` / `Kicker` / `CtaButton` (one
  CTA, variants primary/secondary/ghost, `onInk`); `blockFields()` /
  `blockLayoutDefaults` (the standard trailing adjust group); and the reference
  `Heading` block. Builds on the pre-existing `layout.ts` (space above/below +
  responsive visibility) and `image-controls.ts` (crop/focal/size/radius/shadow).

### The "adjust" controls on every block (the "feature block")
Background tone · content width · alignment · space above · space below ·
responsive visibility — plus image crop/focal/radius/shadow on image blocks.
All token-driven selects → fixed Tailwind classes (no raw px, no off-brand CSS).

### Catalog (24 blocks, 5 categories)
| Category | Blocks |
|---|---|
| **Layout** | `Container` (tone band + nested slot), `Columns` (2/3 slots), `Spacer`, `Divider` |
| **Content** | `Heading` (eyebrow+title+kicker, sizes), `Text` (markdown), `Statement`, `Quote` (pull / testimonial), `Buttons` (group) |
| **Sections** | `Hero` (image / split / minimal), `FeatureGrid` (icon / image / numbered, 2–4 col), `Showcase` (alternating media+text; replaces `Pillars`), `StatRow`, `Checklist`, `Accordion` (FAQ), `CallToAction` (replaces `BetaCTA`) |
| **Media** | `Image`, `Gallery`, `MediaText` (replaces `ZigZag`), `Marquee` |
| **Dynamic** | `LiveStats`, `LiveEvents`, `LivePosts` (live data via Puck `metadata`) |

Files: one per group — `kit.tsx` (Heading), `sections.tsx`, `collections.tsx`,
`media.tsx`, `primitives.tsx`, `dynamic.tsx`; `config.tsx` merges the fragments +
defines categories. Retired keys (`PageHero`, `ZigZag`, `ImageBand`,
`FeatureGallery`, `Pillars`, the old splash `Hero`) are removed.

### Content templates (`lib/page-editor/templates/*`)
`the-lab`, `how-it-works`, `about` are re-built as Puck `Data` from the standard
blocks. `app/edit/[slug]/page.tsx` seeds the editor from the matching template
when the stored draft is empty **or uses retired block types** (`isRenderable`)
— a load-time default only; nothing is written to the DB until Publish. So a
legacy draft can never crash the editor.
