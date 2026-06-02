# Marketing Redesign — Status & Handoff

Snapshot of the agency redesign program so the next thread starts with a clear map.
Source of truth for direction: [`CREATIVE-PLATFORM.md`](CREATIVE-PLATFORM.md) (audience,
story, voice, conversion) and [`DESIGN-LANGUAGE.md`](DESIGN-LANGUAGE.md) (the codified
system + page-flow blueprint + backlog). Decisions: [`DECISIONS.md`](DECISIONS.md) ADR-051/052/053.

**Direction chosen:** balance all three personas · **experimental** (motion-forward, breaks the
grid) · warm DAWN + ink/slat contrast · real golden-hour photography. Build ON what exists.

## ✅ Live on production (`main`)
- **Design system:** bold-warm contrast layer — ink/slat dark bands, amber LED `.light-strip`,
  `amber-glow`, `shadow-pop`; warm-wood dark mode; deeper marketing-canvas. (`globals.css`)
- **Unified header** — `PrimaryNav`: **Discover** dropdown + flat **About** tabs (mission-focused
  for members), used by every header. (`components/layout/primary-nav.tsx`)
- **Discover layer** redesigned (hub / circles / events / topics) with photo heroes + real photos.
- **The Lab / How it works / About** redesigned (uniform editorial; live after unpublish).
- **Pricing / Demo** built + on the shared `PhotoHero`.
- **Experimental flagship splash** — story-led, scroll-motion (`components/marketing/motion.tsx`),
  reduced-motion + no-JS safe.
- **Page-editor Unpublish** — `unpublishPage` + button (`app/edit/actions.ts`, `editor.tsx`).

## 🟡 In the open PR (awaiting preview/merge)
- **`/beta` redesign** (photo hero + reassurance + founder trust + honest scarcity).
- **Discover events green→amber** (removed the `success` palette leak).
- **Component consolidation:** `DiscoverHero` → re-exports `PhotoHero`; one shared `SectionHeading`.

## 🔭 Remaining backlog (for the design thread)
1. **Roll the experimental language sitewide.** Discover + the marketing pages are *uniform-
   editorial* but not yet motion-forward; bring the validated flagship motion/layout to them.
2. **Phase-A primitives (Design-Language P1):** shared `Button` + `Card`; bake spacing rhythm +
   container widths into `Section` defaults; retire the remaining inline button/card drift.
3. **Pre-existing lint error:** `app/(main)/events/new/event-form.tsx` — `<a>` → `next/link`.
4. **Guard the splash:** publishing the `home` page in the editor would shadow the coded
   flagship (same trap we hit with The Lab/How it works/About). Leave `home` unpublished, or add a guard.

## ⚠️ Gotchas
- Public marketing pages (`home`, `the-lab`, `how-it-works`, `about`) render the editor's
  `published_data` when present, **shadowing the coded design**. Use the editor's **Unpublish**
  button to revert to code. (Editable slugs: `lib/page-editor/data.ts`.)
- The splash (`/`) **redirects logged-in users to `/feed`** — review it **logged out / incognito**.
- Vercel **preview** deployments are password-protected (403 to automated fetches); **production**
  (`frequencylocal.com`) is public.
