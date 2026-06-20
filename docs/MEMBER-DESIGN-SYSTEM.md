# Member Design System

The standard for every member-facing surface under `app/(main)/**` (the in-app
experience: feed, spaces, the Quest, profiles, messaging). The member sibling of
[`ADMIN-DESIGN-SYSTEM.md`](ADMIN-DESIGN-SYSTEM.md): same warm canvas-and-tiles bones,
tuned for a member instead of an operator. With the marketing language
([`DESIGN-LANGUAGE.md`](DESIGN-LANGUAGE.md)) and the admin spec, this is the third leg of
**one uniform site**. ADR-240.

> The kit is already ~85% adopted (the in-app overhaul, ADR-061/090). This finishes and
> enforces it: composition, not reinvention. Voice + naming bind every word
> (docs/NAMING.md, docs/CONTENT-VOICE.md): no em dashes in member copy.

---

## 0. One site, three rooms

The whole site shares ONE token layer, ONE warm world, and ONE type face split into two
voices. The three contexts differ only in *register*:

| Room | Where | Register | Stats it shows |
|---|---|---|---|
| **Marketing** | `/`, `(marketing)/*` | Editorial: Anton heroes, ink↔light beats, photography. The pitch. | Gated social proof (counts), never operator data. |
| **Member app** | `(main)/*` (this doc) | Warm canvas + white tiles, content-led, gamified. The home. | **ONLY streaks + gamified stats** (§2). |
| **Admin** | `(main)/admin/*` | Warm canvas + white tiles, data-led. The workshop. | Operator KPIs, freshness, drill-downs. |

A member never sees an operator KPI; an operator's data never leaks into a member page.
The look is identical (tokens, type, tiles, charcoal ink); the *content* is what changes.

---

## 1. Principles (ranked)

1. **Design for the body, not the dashboard.** Lens words: *missed · exhale · home*. A
   member page leads with people, places, and what to do next, never a metrics wall.
2. **Content is the hero; tiles are the supporting cast.** The feed post, the circle, the
   person, the journey is the subject. White tiles carry the few numbers that matter
   (a member's standing), not the content itself.
3. **The only stats are gamified (§2).** Streaks, zaps, gems, season rank. If a number
   isn't part of the game, it doesn't get a tile on a primary page.
4. **Warm and legible.** Charcoal ink `#3D352A`, the type scale (§3), tabular numerals on
   game counts, semantic tokens only: no `text-[..px]` for content, no hardcoded hex.
5. **Compose, never author.** Every page is one of five templates (§4) filled with kit
   parts (§5). If a header, card, tab, or empty state is hand-rolled, it's wrong.
6. **No dead ends.** Every entity cross-links to its neighbors (event↔practice,
   profile↔circles, journey↔streak). Movement is the product.
7. **Calm motion, honest empty states, fast shell.** Transitions ≤300ms behind
   `motion-reduce`; every empty state teaches a next step; server-first with per-section
   `<Suspense>` so the shell paints instantly.
8. **Accessibility is AA.** Contrast ≥4.5:1 (≥3:1 large/non-text), visible focus, ≥24px
   targets, semantic structure.

---

## 2. The gamified-stat law (the member-specific rule)

**Primary member pages feature streaks and gamified stats only.** The member's "data" is
their standing in the Quest, nothing else.

- **The four counts:** **Zaps** (season currency), **Gems** (lifetime/spend), **Streak**
  (the flame + shields), **Season rank** (the badge). These are the *only* values that earn
  a stat tile, a `StatCard`, or a `StreakStrip` on a primary page.
- **One source of truth for rank.** Rank tier, color, and label come from
  `lib/season-ranks.ts` (`SEASON_RANKS`), never a page-local `RANK_TIERS` (retire the copy
  in `people/[handle]`). Rank renders identically on the feed, crew home, profile, and
  leaderboard.
- **One standing component.** Promote a single **`StandingTiles`** (the crew home's
  Zaps/Rank/Streak/Gems grid) as THE way a member's standing renders anywhere it appears
  (feed JourneyBoard, profile, journey detail). Stop rendering the four counts three
  different ways across surfaces.
- **Counts are gamified, not analytical.** Member-side numbers carry a flame/zap/gem glyph
  and a warm tile, not a delta-vs-last-week or a drill-down (that's the admin register).
- **Everything else is content, not a stat.** Member/event/partner *counts* (e.g. "12
  members", "3 cities") are quiet context inline on a card, never a KPI tile. A page about
  a thing shows the thing, not a number about it.
- **Non-gamified surfaces show no stats.** Messaging, settings, capture/compose, discovery
  intentionally show zero stats. Leave them that way.

Mixed surfaces to fix (audit): `crew/leaderboard` (rank/zaps table is fine; drop any
non-game context stats), `partners` + `market` (partner/city/category counts → inline
context, not a StatStrip), `practices` "Your practices" (zap reward stays; retire the
hard-bordered row → `EntityCard`/RowCard).

---

## 3. Foundations

**Tokens**: the shared layer (`app/globals.css`). Ink warm charcoal `--color-text
#3D352A`; `muted`/`subtle` step down. `canvas` = page; `surface` (white) = tiles. Status +
game accents are semantic tokens only (`primary`/amber for zaps + chrome, the rank colors
from `season-ranks`, `success`/`warning`/`danger` for in-app status). Never hardcode hex.

**The two faces.** `font-display` (Anton, uppercase, tight) for big editorial moments + big
game numbers; `font-sans` (Nunito) for everything readable. (Marketing leans display; the
app leans sans, with display reserved for hero counts + section moments.)

**Type scale (in-app).** Page title via `PageHeading`; section `SectionHeader` `text-base
font-bold`; card title `text-lg font-bold` (or `EntityCard`'s); game value `font-display`
or `font-bold tabular-nums`; body `text-sm/text-base`; meta `text-xs text-subtle`. No
`text-[9/10/11px]` for content (retire `broadcast`'s `text-[9px]` date → `text-xs`).

**The grammar.** Headers + instructional copy on the **canvas**; content in cards and the
few **white tiles** that carry game stats. Radius `rounded-2xl` (cards/tiles/rows) ·
`rounded-3xl` (feature/framed media) · `rounded-md` (chips). One elevation ladder
(`shadow-sm` rest · `shadow-md`/`pop` lift).

---

## 4. Page-template taxonomy

Every member surface maps to one of five shared templates (`@/components/templates`), plus
a Wizard pattern for onboarding. Compose the template + `PageHeading`; never hand-roll.

1. **Stream**: a flow of items (feed, broadcast). `PageHeading` + optional composer + the
   item flow. Game standing rides in the rail / JourneyBoard, not the stream body.
2. **Index**: a collection to browse (circles, channels, events, practices, journeys,
   people, market, partners, messages, search, library, crew lists). `PageHeading` + a
   filter toolbar (URL-as-state) + an `EntityCard`/`PersonCard` grid + `EmptyState`.
3. **Detail**: one entity (circle, channel, event, hub, nexus, program, profile, market
   listing, partner). A context band (identity, status, key facts, primary actions) +
   **underline tabs** (the one tab vocabulary) + body. Cross-link to neighbors.
4. **Dashboard**: the member's metric-led surface = **the Quest / Crew home**. The ONLY
   member dashboard, and it shows the gamified standing (§2), a next-best-action, and entry
   tiles into the game. (Operator dashboards live in admin.)
5. **Focus**: a centered, rail-less compose/edit/settings/takeover surface (events/new,
   edit forms, messages thread, on-air, settings, scan, claim landings).
6. **Wizard** (onboarding): a staged Focus surface with explicit "continue", a progress
   cue, and the celebration beat. The onboarding suite (`/onboarding/*`) is the only
   bespoke cluster left. Fold it onto Focus + this wizard pattern.

Rail is registered once per route in `lib/layout/page-chrome.ts` (`global`/`scoped`/`none`).
Pages never toggle it.

---

## 5. Component grammar (compose these)

- **`PageHeading`**: the one header (title · eyebrow · description · actions · back).
- **`EntityCard` / `PersonCard` / `RowCard`**: the browse cards. `EntityCard`/`PersonCard`
  for the grid (avatar/icon anchor · title · one-line context · description · meta);
  **`RowCard`** for dense list rows (offers, "your practices", discover) in link-row mode
  (whole row anchors, passive trailing chip) or actions mode (title links, controls sit
  right, never nested in an anchor). Every bespoke "circle/offer card" or "your-practices
  row" is retired onto these.
- **`SectionHeader`**: titled section within a page (title · count · action).
- **`UnderlineTabs`**: the ONE tab vocabulary for Detail (and any tabbed page: profile,
  search, network contacts, library, market). No pill/button tab variants anywhere.
- **Standing kit (game tiles):** **`StandingHero`** (the dashboard centerpiece: rank crest +
  the four counts as feature tiles + the climb ladder, §2; the member analog of the admin
  KPI hero) · `StandingTiles` (the compact four-count render for the feed/rail) · `StreakStrip`
  (flame + shields) · `StatCard` (a single game tile) · `JourneyBoard` (the feed's graduated
  home). Rank ALWAYS from `lib/season-ranks`. These are the only "tiles with numbers" a member
  sees.
- **`EmptyState`**: never a blank pane; teach the next step + one CTA. Fill the gaps
  (on-air/dispatches, library/review, support, some detail sub-pages).
- **`RoleActions`**: the resolver-fed header action menu (primary + overflow, gate-aware);
  finish building it as Detail headers adopt it (replaces the ~60 inline role checks).
- **Chips/badges:** the tokenized `Pill`/`Badge`/`StatusChip` vocabulary; rank badges from
  `season-ranks`. No inline `bg-danger`/`bg-warning` hex on the profile.

---

## 6. Interaction, states, engagement

- **The Quest is the member's dashboard.** Streak (daily engine), zaps, gems, rank, the
  next-best-action, achievement celebration. Standing is glanceable on the feed and one tap
  away on Crew.
- **Cross-link everything.** Detail pages link down/across (hub→circles, event→practice,
  profile→circles, journey→streak, market listing→author profile).
- **States:** dimension-matched skeletons behind per-section `<Suspense>` (shell never
  blocks); empty states teach; errors are plain + recoverable; success is a quiet toast or
  a celebration beat (achievement unlock).
- **URL-as-state** for browse filters (network/library/market/search), so a filtered view
  is shareable.
- **Honor reduced motion**; keep the marketing parallax/motion to marketing.

---

## 7. The marketing boundary

Marketing keeps its editorial register (Anton heroes, ink beats, photography); it shares
the token layer but not the tile grammar. The seam is the splash → app transition
(sign-in/onboarding). Onboarding belongs to the **app** register (Focus + Wizard, §4), not
the marketing one, so the first in-app moment already feels like home. The marketing
unification backlog stays in `DESIGN-LANGUAGE.md`.

---

## 8. Rollout: SHIPPED (ADR-241)

What ADR-240 framed as a finishing pass became the full member visual redesign (the
owner's admin-style treatment). Run like admin: foundation first, then parallel agents per
cluster, each merged to production as it went green. Per-page definition of done held: on a
shared template; composes the kit (no bespoke header/card/tab/empty); canvas headers + white
tiles; warm type + tabular game numerals; tokens only; gamified-stat law (§2) honored;
states handled; AA.

| Phase | Cluster | Outcome |
|---|---|---|
| **0 · Foundation** | gamification | `StandingHero` built + flagship Quest home (#646). |
| **1 · Standing** | profile + feed | `StandingHero`/`StandingTiles` everywhere; rank unified on `season-ranks` (`RANK_TIERS` retired); four counts de-scattered (#648, #651). |
| **2 · Onboarding** | `/onboarding/*` | Folded onto Focus + the Wizard pattern (shipped earlier). |
| **3 · Browse parity** | circles/events/channels, network, library, market, partners | `IndexTemplate` + URL-as-state; `EntityCard`/`RowCard`; `UnderlineTabs`; §2 stat-strip cleanup (#649). |
| **4 · Detail parity** | market/[id], partners/[slug], journey detail, profile | `DetailTemplate` spine + cross-links (market→author, journey→author/streak, partner→city/scan) (#650, #652). |
| **5 · Polish sweep** | search, broadcast, messages | search→`UnderlineTabs`; `text-[9px]`→token; messages discover→`EntityCard` (#653). |

Deliberate exceptions (intentionally NOT folded): the chat-thread headers
(`messages/[id]`, `messages/r/[roomId]`) stay bespoke takeover chrome (like on-air);
`library`'s `LibraryCard` keeps its shell (two in-card controls `EntityCard` can't nest).

Do-not-touch (on-grammar): the five templates, `EntityCard`/`PersonCard`/`RowCard`/`StatCard`,
`StandingHero`/`StandingTiles`/`StreakStrip`/`GamificationPanel`/`JourneyBoard`.

---

## 9. Sources

`ADMIN-DESIGN-SYSTEM.md` (the canvas+tile sibling) · `DESIGN-LANGUAGE.md` (marketing) ·
`REDESIGN-INAPP.md` (the in-app overhaul + kit) · `PAGE-FRAMEWORK.md` (the five templates +
chrome map) · `DESIGN.md` (the warm-editorial standard) · the member-surface audit
(session record). Same research base as the admin spec (Stripe/Linear/Vercel/Polaris/NN-g/
WCAG 2.2).
