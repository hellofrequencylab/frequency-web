# Design direction: warm editorial community

The look and feel brief for Frequency. Names the style, diagnoses what felt "templated,"
sets the principles + token spec, and answers the design-stack question. Pairs with the
DAWN token system in `app/globals.css` and the component conventions in
[ARCHITECTURE.md](ARCHITECTURE.md). Living doc.

## The style, in a sentence

**Warm editorial community.** Calm, magazine-like layouts on a warm cream canvas, where
**type and space carry the personality** and **content sits openly** rather than inside a
grid of identical bordered boxes. Friendly, human, unmistakably not a SaaS admin template.

## Why it felt like a template (the diagnosis)

It was never the palette or the font. The DAWN palette is already warm (cream `#FBFAF6`
canvas, amber primary, warm-beige borders) and the body face is Nunito (rounded, friendly).
The "template" signal came from three habits, all fixable:

1. **Everything in an identical bordered card.** A 1px border + flat `shadow-sm` + the same
   radius on every block (worst in the right rail, five identical boxes stacked) reads as a
   generic dashboard. Uniform boxes = no authored hierarchy.
2. **Type too small and unexpressive.** Components lean on `text-sm` / `text-xs` /
   `text-[11px]`, and section headers were tiny gray uppercase micro-labels. Nothing felt
   like a heading you'd see in print.
3. **Flat, hard elevation.** Crisp pure-black `shadow-sm` gives a sharp box edge instead of
   gentle, warm depth.

## Principles

1. **Type is the hero.** Larger base, expressive headings, generous line-height. Let
   headings be confident and content be comfortably readable.
2. **Group, don't box.** Reserve the elevated card for genuinely distinct *objects* (a
   circle, an event). For lists and rail sections, group with a clear title + spacing (and
   at most a hairline divider or a soft, borderless surface), not a bordered box each.
3. **Warm, soft depth.** Diffused, warm-tinted shadows over hard borders. Borders, when
   used, are hairline and warm.
4. **Editorial hierarchy / bento.** A few large anchor areas, supporting detail quieter
   around them. Density is fine when the hierarchy is right; never a wall of equal weight.
5. **Human touches.** Real photography of gatherings, the occasional hand-feel accent, so
   it reads as made, not generated.

## Token spec

Palette (already warm, keep): cream canvas, white surface, warm-beige borders, near-black
warm ink, amber primary, teal signal. Dark mode mirrors it on espresso.

Changed in this pass (`app/globals.css`):

- **Soft warm elevation.** Overrode Tailwind's hard pure-black shadow defaults
  (`--shadow-2xs` ... `--shadow-xl`) with diffused, warm-tinted shadows (near-espresso, low
  alpha, wide blur). Every `shadow-*` in the app softens at once.
- **Base size +6%.** Root font-size 16 to 17px, so all rem-based type + spacing lift gently
  and uniformly ("a little larger and more inviting"). One-line revert if anything tight
  overflows.

Still to do (needs eyeballing, see Next):

- **Type scale.** Establish a deliberate scale and migrate the tiny fixed-px sizes
  (`text-[10px]/[11px]`, heavy `text-xs`) up. Fixed-px sizes do NOT scale with the root
  bump, so the rail still needs a manual pass.
- **A characterful header face.** Trialed a warm serif (Fraunces) for in-app page titles and
  reverted it: in context it read as a different product, not warmer. Decision: **Nunito bold
  stays the in-app heading face** (it is already the brand-aligned rounded face). Anton stays
  the marketing headline face only. See ADR in DECISIONS.md.
- **Radius consistency.** Standardize on a small set (e.g. `rounded-xl` for cards,
  `rounded-lg` for controls, `rounded-full` for pills).

## The card to editorial-grouping pattern

The single highest-impact move. Before: every right-rail widget in a `border + shadow-sm`
box with a tiny uppercase gray title. After (done for `ModuleCard`): **borderless**, soft
shadow, **larger sentence-case bold title**. Next, push further where it helps: some rail
sections need no card at all, just a strong title + a hairline divider on the canvas.

Rule of thumb: **a card means "this is a distinct object."** If it's just a grouped list,
title + spacing beats a box.

## Design stack: expansion + speed (your question)

Short answer: **you are already on the best-practice stack; the lever is discipline, not a
new system.** Adding a UI framework would cost speed and lock-in, the opposite of the goal
(this matches [SCALE-ARCHITECTURE](SCALE-ARCHITECTURE.md): adopt seams, not frameworks).

What you already have, and why it is right:

- **Tailwind v4 (CSS-first).** Near-zero runtime, no CSS-in-JS, compiles to static CSS. Fast
  by construction. Keep it.
- **Semantic design tokens (DAWN).** Raw hex lives in one file; components use semantic
  utilities (`bg-surface`, `text-muted`). This *is* the expansion lever: theming, white-label
  per-Nexus, and dark mode are nearly free because nothing hardcodes a color.
- **`next/font` self-hosted.** No layout shift, no external font request. Keep.
- **Owned, hand-written components** (Tailwind v4 + `lucide-react` only; no component
  library, no Radix — see ADR-011). You own the code, no library churn.

For future expansion specifically:

- **W3C Design Tokens + Style Dictionary** (only when mobile lands, Stage 5): export the same
  DAWN tokens to React Native / Expo so web and mobile share one source of truth. Adopt the
  *posture* now (semantic tokens, which you have); add the export pipeline when needed.
- **View Transitions API** (Baseline 2025): smooth navigation/polish with no JS framework,
  framework-portable. A cheap way to feel premium later.

Avoid: runtime CSS-in-JS (Styled Components / Emotion), heavy component kits (MUI, Chakra),
or a new meta-framework. All slower and more locked-in than what you run today.

## What changed in this pass

- `globals.css`: soft warm shadow tokens. (Base font-size was bumped to 17px then reverted to
  16px: the +6% scaled spacing too loose vs the live site; kept at 16.)
- **Right rail: minimal, borderless modules.** `ModuleCard` dropped its border/shadow/box
  entirely. A module is now a titled group of rows on the canvas, separated from neighbours by
  whitespace (`space-y-8`), not a stacked box. Settled the earlier border/borderless flip-flop
  on the side of borderless: the boxes were the "template" tell. The one intentional card left
  is "Getting started" (a tinted onboarding CTA, a genuinely distinct object).
- **Right rail: type scale lifted.** Primary content (member/event/dispatch/leaderboard names)
  went `text-xs` to `text-sm`; meta went `text-[10px]/[11px]` to `text-xs`; avatars/date-chips
  bumped a step; rows got more vertical padding. The rail no longer reads "tight".
- **Feed post stats simplified.** Removed the per-post `w-44` stats sidebar (it repeated the
  date/scope already in the author row, and stamped a static "EARN React +1 / Reply +2" legend
  on every card). Posts are now single-column; gamification is a single amber zap chip on the
  reaction bar showing the zaps the post earned (`reactions x1 + replies x2`). Clean cue, not a
  ledger.
- **Scroll model: one shared scroll, sticky rail.** Reworked `app-shell.tsx` from three
  independently-scrolling columns to the "document + sticky rail" model (X / Reddit): the feed
  and right rail share **one** scroll container, and the rail is `sticky top-0`, flush to the
  far-right edge (like the left nav is flush left). No more per-column scrollbar / floating
  cluster. (An earlier attempt capped+centered the whole cluster at `max-w-[68rem]`; that
  pulled the rail off the right edge and left a dead gutter beside it, so it was reverted.)
- **Fuller headers.** `StreamTemplate`/`IndexTemplate` headers gained a hairline bottom rule
  (matching `DetailTemplate`) for a defined band; `StreamTemplate` gained an optional
  `eyebrow` slot. The feed now greets the viewer (time-aware "Good morning, {name}" + today's
  date) instead of a thin lone "Feed" title.
- **Uniformity.** `practices` migrated onto `IndexTemplate` (was ad-hoc), matching `programs`.
- **Gamification dock.** The right rail's "Your stats" bar is tap-to-open (`game-stats-dock.tsx`):
  a calm compact bar by default, expanding to a ~1/3-screen "progress cockpit" with today's
  move (log practice), a subtle 7-day streak strip, rank progress, the current quest, and The
  Vault (gems to spend) at the very bottom. Kept deliberately small to avoid a spammy dump;
  challenges/badges live on `/crew`. Both bottom docks use the SAME mechanism: a compact bar
  stuck to the bottom, revealing its panel on a continued (force) scroll gesture
  (`use-feed-at-bottom.ts`) or on tap. The right dock is pushed to the bottom of the rail via a
  `flex-1` top section; the left lives in the nav column. The reveal is a plain wheel-intent
  gesture (no IntersectionObserver / position re-eval), which is what keeps it smooth.

## Next (eyeball + iterate in `npm run dev`)

1. Reduce remaining bordered boxes on the main surfaces to grouped/editorial where they are
   lists, not objects.
2. A real visual designer (or a tool) for logo + brand marks (out of scope for code).

## Browse-page redesign standard ("calm, warm, scannable")

The browse pages (Circles, Interests, Events, Practices, Programs, Partners, Directory,
Broadcast, Messages, Admin) were structurally fine (templates + tokens) but tactically ad-hoc:
each hand-rolled its own cards, `text-[10px]/[11px]` fonts, and a page-level "sidebar boxes"
column that duplicated the list. The standard, applied through Frequency's "a place to be
human" lens (local, human, not a SaaS dashboard):

1. **One page grammar.** Every page = template header (`IndexTemplate`: title + one-line
   purpose + primary action + optional `toolbar`) over a body. No bespoke headers.
2. **Editorial sections, not boxed clutter.** Group with `components/ui/section-header.tsx`
   (`SectionHeader`: title + count + optional action) and whitespace. Drop page-level sidebar
   boxes that duplicate the list; the global right rail already carries context.
3. **Type discipline.** No `text-[10px]/[11px]` for content. Card titles `text-base`, body
   `text-sm`, meta `text-xs`.
4. **One entity-card shell.** `rounded-2xl border border-border bg-surface p-5 shadow-sm`,
   hover-lift (`hover:border-primary-bg hover:shadow-md`), an icon/avatar anchor + title +
   one-line context + 2-line description + a meta/footer row. Responsive grid
   (`grid gap-3 sm:grid-cols-2`).
5. **Beautiful empty states** via `components/ui/empty-state.tsx` (`EmptyState`: icon + title +
   guidance + optional CTA). Warm amber for actions/accents only.

**Circles is the shipped exemplar** of this standard; the other nine pages roll out to match.

> **Update 2026-06-03 (cohesion sweep, PR #106):** the rollout is **shipped** — Broadcasts,
> Messages, Interests, Practices, Programs, Events, Friends, Partners, Directory all run on
> `IndexTemplate` + the kit. Two systemic fixes landed at the primitive level: `StatStrip` was
> **de-boxed** (borderless canvas row, matching Circles — every page's stat row now reads the same),
> and a shared **`PersonCard`** (`components/cards/person-card.tsx`, wrapping `EntityCard`) gives
> Friends / Directory / any people list one identical person card. Broadcasts & Messages dropped
> their page-level sidebars + colored KPI tiles (the global right rail carries that context).

## Page unification: one grammar for every page

> **Update 2026-06-02 (in-app overhaul, PRs #81–93 — see [REDESIGN-INAPP.md](REDESIGN-INAPP.md)):**
> the structural fix below is **largely shipped**. `DetailTemplate` is now adopted by Circle,
> Channel, and Event detail (0 → 3); all the browse pages are on `IndexTemplate` + `EntityCard`.
> Remaining: Profile/Programs detail → `DetailTemplate`, and the `<RoleActions>` consolidation
> (still deferred). The original plan is preserved below as the rationale.

The other half of "cobbled together" is structural, not visual. Audit: list pages use
`IndexTemplate`; the feed uses `StreamTemplate`; but `DetailTemplate` **was used by zero
pages** (now Circle/Channel/Event), so every single-entity page (a circle, a profile, an
event) was hand-rolled, and a couple of pages (Practices, Programs) were also ad-hoc. Mixed
shells = mixed headers, spacing, and action placement = the cobbled feel. Fix: **every page
lives in one of three shells, and all role logic flows through the capability resolver.**

### The three shells (best practice per area)

- **IndexTemplate (list / discovery).** title + description + a right-aligned `action` +
  optional `toolbar` (filters) + body. Use for: Circles, Interests, Events, Partners,
  Directory, Practices, Programs.
- **StreamTemplate (the feed).** A composer over a scrolling stream. Use for the feed and
  any "what's happening" surface.
- **DetailTemplate (single entity).** A context header (title, subtitle, badges, `actions`)
  over a tab row over a body that itself nests an Index or Stream. Use for a Circle,
  Profile, Event, Interest, Program, or Practice detail. **Adopting this is the single
  biggest unification win**, since it's currently unused.

Rule: pick the shell by page type; never hand-roll a header. The shell owns the title,
spacing, and action placement, so every page reads as one product.

### Role-based actions (the dynamic buttons)

One rule: **the header action area is driven by the capability resolver, not scattered role
checks.** Today role logic is split across `CreateMenu` (hardcoded role arrays),
`ContextActions` (per-item kebab), `<Can>`, and inline `isAdmin` / `canManage`. Consolidate:

- **The resolver is the single source.** `resolveCapabilities(viewer, scope)` already
  answers "what can this viewer do here." Every action reads from it, so member, host, and
  janitor each see exactly their actions, on every page, automatically.
- **A unified `<RoleActions>` in the header slot:** a primary button + overflow menu, fed
  a list of `{ label, action, capability }` plus the viewer's cap set; renders only the
  permitted entries. Replaces bespoke per-page header buttons. `CreateMenu` becomes one
  instance of it; `ContextActions` stays for per-item menus.
- **Free vs paid (ADR-037) flows through the same input** (tier as a capability), so locked
  actions show the upgrade affordance uniformly instead of the one-off `CrewGateButton`.
- **Staleness to fix:** `CreateMenu` still gates "New Circle" to host+ and links to
  `/circles/new`, but members now create via the Interest picker on `/circles`. Re-point it
  through the resolver + the real entry.

### Migration checklist (page to shell)

- [x] Programs to IndexTemplate (the reference migration)
- [x] Practices to IndexTemplate (PR #84)
- [x] Circle detail (`/circles/[slug]`) to DetailTemplate (PR #85) — actions via the resolver in the slot; `RoleActions` overflow-menu still pending
- [~] Profile (`/people/[handle]`) — borderless-rail + type cohesion done (PR #88); DetailTemplate header/tabs still pending
- [x] Event detail (`/events/[slug]`) to DetailTemplate (PR #87)
- [x] Channel detail (`/channels/[id]`) to DetailTemplate (PR #86)
- [ ] Program detail (`/programs/[slug]`) to DetailTemplate (still hand-rolled)
- [ ] Build `<RoleActions>` overflow-menu; route `CreateMenu` through the resolver

Best done on localhost, page by page with eyes on, since each detail page's tab set and
action list is a small product decision.

## In-app scale — codified (the standard)

The drift the audit found (94+ `text-[9/10/11px]`, six radii, gaps 0.5→8) recurred because the
scale was never written down. It is now. **Compose from the kit; never set these ad hoc.** New
primitives bake these in: `EntityCard`, `StatCard`, `SectionHeader`, `EmptyState`, `ModuleCard`,
the three templates.

**Type — roles, not pixels. Never `text-[10/11px]` for content.**

| Role | Utility | Where |
|---|---|---|
| Page title | `text-2xl font-bold` | template headers (Index/Detail/Stream) |
| Section title | `text-sm font-bold tracking-tight` | `SectionHeader` / `ModuleCard` (sentence case, **not** all-caps) |
| Card title | `text-base font-bold` | `EntityCard`, list rows |
| Body | `text-sm leading-relaxed text-muted` | descriptions, prose |
| Meta / label | `text-xs text-subtle` | counts, timestamps, footer pills (**floor** — nothing smaller for content) |
| Big stat | `text-2xl font-bold tabular-nums` | `StatCard` |

Anton stays the **marketing** headline face only; Nunito bold is the in-app heading face (ADR).

**Spacing — three rhythms.** Section gap `space-y-8` (rail modules, page sections) · group gap
`space-y-3` / `gap-3` (rows, card grids) · tight `space-y-1` / `gap-2` (within a row). Card grids:
`grid gap-3 sm:grid-cols-2 lg:grid-cols-3`. Stop hand-passing one-off gap values.

**Radius — by role.** `rounded-2xl` cards & tiles (EntityCard, StatCard, modals) · `rounded-lg`
controls (buttons, inputs, chips) · `rounded-full` pills & avatars. Retire `rounded-xl`/`rounded-3xl`
for in-app surfaces (keep `rounded-3xl` for marketing feature cards only).

**Elevation.** Soft warm shadow tokens only (already in `globals.css`); a resting card is
`shadow-sm`, hover lifts to `shadow-md`. A card means a *distinct object* — lists/sections group
with title + whitespace, not a box each.

## Responsive (mobile-first) rules

The site is the mobile app (no native app until Stage C). Build mobile-first; verify at 320–390px.
Four rules keep it from drifting (ADR-077):

1. **Tables scroll, never clip.** Every `<table>` lives in an `overflow-x-auto` wrapper.
2. **No fixed widths wider than the phone.** Avoid `w-[..px/rem]` / `min-w-[..]` over ~300px on
   in-flow content; use fluid widths + `max-w-*`, or a smaller base that scales up at `sm:`+.
3. **Grids start narrow.** Multi-column grids base at `grid-cols-1` (or 2) and widen at breakpoints —
   never a base `grid-cols-3+`.
4. **Anything hidden at `md:` needs a mobile equivalent** (e.g. the marketing nav → hamburger sheet).

## Sources

UI/typography direction drawn from 2026 trend research:
[envato](https://elements.envato.com/learn/ux-ui-design-trends),
[uxdesign.cc](https://uxdesign.cc/the-most-popular-experience-design-trends-of-2026-3ca85c8a3e3d),
[Tubik](https://blog.tubikstudio.com/ui-design-trends-2026/),
[Fontfabric](https://www.fontfabric.com/blog/10-design-trends-shaping-the-visual-typographic-landscape-in-2026/),
[MyDesigner](https://mydesigner.gg/blog/dense-interfaces-information-hierarchy-2026),
[Mighty Networks community trends](https://www.mightynetworks.com/resources/best-community-app).
