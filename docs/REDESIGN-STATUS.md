# Marketing Redesign: Status & Handoff

> ⚠️ **This doc covers the MARKETING / public-site redesign.** For the **in-app** design overhaul
> (interior `(main)` pages, the design kit, Phases 0 to 3), see [REDESIGN-INAPP.md](REDESIGN-INAPP.md).

Snapshot of the agency redesign program so the next thread starts with a clear map.
Source of truth for direction: [`CREATIVE-PLATFORM.md`](CREATIVE-PLATFORM.md) (audience,
story, voice, conversion) and [`DESIGN-LANGUAGE.md`](DESIGN-LANGUAGE.md) (the codified
system + page-flow blueprint + backlog). Decisions: [`DECISIONS.md`](DECISIONS.md) ADR-051/052/053.

**Direction chosen:** balance all three personas · **experimental** (motion-forward, breaks the
grid) · warm DAWN + ink/slat contrast · real golden-hour photography. Build ON what exists.

## ✅ Live on production (`main`)
- **Design system:** bold-warm contrast layer: ink/slat dark bands, amber LED `.light-strip`,
  `amber-glow`, `shadow-pop`; warm-wood dark mode; deeper marketing-canvas. (`globals.css`)
- **Unified header** (`PrimaryNav`): **Discover** dropdown + flat **About** tabs (mission-focused
  for members), used by every header. (`components/layout/primary-nav.tsx`)
- **Discover layer** redesigned (hub / circles / events / topics) with photo heroes + real photos.
- **The Lab / How it works / About** redesigned (uniform editorial; live after unpublish).
- **Pricing / Demo** built + on the shared `PhotoHero`.
- **Experimental flagship splash**: story-led, scroll-motion (`components/marketing/motion.tsx`),
  reduced-motion + no-JS safe.
- **Page-editor Unpublish**: `unpublishPage` + button (`app/edit/actions.ts`, `editor.tsx`).

## 🟡 In the open PR (awaiting preview/merge)
- **`/beta` redesign** (photo hero + reassurance + founder trust + honest scarcity).
- **Discover events green→amber** (removed the `success` palette leak).
- **Component consolidation:** `DiscoverHero` → re-exports `PhotoHero`; one shared `SectionHeading`.

## 🔭 Remaining backlog (for the design thread)
1. **Roll the experimental language sitewide.** Discover + the marketing pages are *uniform-
   editorial* but not yet motion-forward; bring the validated flagship motion/layout to them.
2. **Phase-A primitives (Design-Language P1):** shared `Button` + `Card`; bake spacing rhythm +
   container widths into `Section` defaults; retire the remaining inline button/card drift.
3. ~~**Pre-existing lint error:** `event-form.tsx` `<a>` → `next/link`.~~ ✅ Done (audit). Also
   cleared the stale `opengraph-image` eslint-disable; ESLint is clean.
4. ~~**Guard the splash.**~~ ✅ Done. **ADR-054**: `home` is code-locked (removed from
   `EDITABLE_PAGES`; `/` renders the coded splash unconditionally). Structural, not convention.

## ✅ Editor reworked into a standardized block library (ADR-055)
The Puck palette is no longer content-named one-offs. It's a standardized, categorized design-system
library (Layout / Content / Sections / Media / Dynamic) with variants + universal adjust controls;
`the-lab`/`how-it-works`/`about` content is re-mapped into the new blocks as templates. See
[`PAGE-EDITOR-SPEC.md`](PAGE-EDITOR-SPEC.md) §12.

## ⚠️ Gotchas
- The editable marketing pages (`the-lab`, `how-it-works`, `about`) render the editor's
  `published_data` when present, **shadowing the coded design**. Use the editor's **Unpublish**
  button to revert to code. (`home` is code-locked — ADR-054 — and exempt.) Editable slugs:
  `lib/page-editor/data.ts`.
- The splash (`/`) **redirects logged-in users to `/feed`** — review it **logged out / incognito**.
- Vercel **preview** deployments are password-protected (403 to automated fetches); **production**
  (`frequencylocal.com`) is public.
