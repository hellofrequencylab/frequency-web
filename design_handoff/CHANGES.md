# CHANGES.md — DAWN round of 2026-08-03 (reply to the production handoff)

> **▶ Paste this into Claude Code (in your repo):**
> *"sync DAWN"* — or spelled out: *"Read `design_handoff/SYNC.md` and
> `design_handoff/CHANGES.md`, apply the listed changes, create a
> `design-sync/2026-08-03` branch, build, and open a PR. Do not merge or deploy."*

This round ran in **reverse**: production was the source of truth. DAWN adopted
the full style sync from `HANDOFF-TO-DAWN-2026-08-03.md` and the six orientation
briefs. **There are no token changes to push back to the repo.** What follows is
(1) what DAWN now matches, (2) the answers to the four open questions, and (3) the
two code-side items the briefs revealed.

---

## 1. Adopted from production (no repo action)

| Area | Now in DAWN |
|---|---|
| Body ink (light) | `--color-text` #3D352A |
| Post surface | `--color-surface-post` adopted as a concept; the value moved this round, see §1b |
| Move family | 5 light + 5 dark cerulean tokens, with a Colors card documenting the Be Still / Get Moving split |
| Midnight skin | `tokens/skins.css`, all four render states, with a card showing them side by side |
| Feel tokens | `--radius-control` / `-card` / `-pill`, `--motion-fast/base/slow`, `--ease-pop/out`, `--density-root` |
| Shadows | `--shadow-menu` added; text-shadow presets added |
| Focus rings | Split treatment (amber chrome, neutral fields) already matched; documented |
| Light lock | `.theme-light-lock` |
| Utilities | `text-2xs` / `text-3xs`, `.press`, `.dimmed`, `.text-emboss` |
| Fonts | Playfair Display, Caveat, Space Grotesk added to the roster |
| Motion | Full inventory implemented as classes (`cue-pop`, `freq-glow`, `wiggle`, `warmup-flash`) plus a live Motion card |

## 1b. DAWN changes to push back (new this round)

Owner direction, 2026-08-03: the neutral field was reading too tan and the app
frame too white. These are the only values DAWN now differs on, so they need to
land in `app/globals.css`:

| Token | Old | New | Why |
|---|---|---|---|
| `--color-canvas` | #FBF8F1 | **#FAF8F4** | Lighter and less yellow (blue channel raised) so white cards separate |
| `--color-marketing-canvas` | #F2EAD9 | **#F5EEE2** | Same lift, keeps the warmer sand relationship |
| `--color-surface-elevated` | #FAF6EC | **#F5F2EC** | Re-seated under the lighter canvas |
| `--color-surface-post` | #F7F5EF | **#F7F5F0** | Half-step cooler, still a warm step off white |
| `--color-border` | #E9E1D4 | **#EAE6DE** | Cleaner hairline, less tan |
| `--color-border-strong` | #D8CDBB | **#D9D3C8** | Same |
| `--color-chrome` | (new) | **#F2EFE8** light / **#1C1710** dark | A tinted frame band. See the proposal below |
| `--color-chrome-border` | (new) | **#E5E0D6** light / **#33291A** dark | Its hairline |

Midnight adds the same two chrome slots on the cool side (#E8ECF3 / #D2D8E4 light,
#111721 / #232D3D dark). `--color-text` #3D352A is untouched.

### The chrome band: a proposal, not a correction

Verified against `components/layout/app-shell.tsx` (2026-08-03), production today is:

| Region | Current classes (line) | Note |
|---|---|---|
| Shell root | `flex min-h-dvh flex-col overflow-x-clip bg-canvas` (1717) | |
| Top bar | `sticky top-0 shrink-0 flex items-stretch bg-surface/90 backdrop-blur-sm border-b border-border z-30` (1737) | Translucent white over the canvas |
| Left rail | `hidden md:flex w-48 shrink-0 flex-col` (1936) | **No background class. Transparent over the canvas, no border-right, 12rem wide** |
| Right rail | `flex w-72 shrink-0 flex-col py-6` (2037) | Also transparent, 18rem |

So the rails are already canvas, and the opaque white panel the owner objected to
was DAWN's own invention. **DAWN's kit now matches production**: both rails are
transparent columns at 12rem / 18rem with no fill and no border.

That leaves one open proposal: the **top bar**. `bg-surface/90` reads as a white
strip against the lightened canvas. DAWN paints it `--color-chrome` with a
`--color-chrome-border` hairline instead, so the frame reads as frame. Adopting it
is a one-line change at line 1737 (`bg-surface/90` → `bg-chrome`, `border-border` →
`border-chrome-border`; keep `backdrop-blur-sm`). **Owner's call.** If it is
declined, drop both chrome tokens: nothing else consumes them.

### Contrast note (applies to production too)

`--color-text-subtle` (#8F8675) fails AA for normal-size text on the light canvas
at rail sizes: measured **3.6:1** on white and 3.1:1 on the chrome tint, against
the 4.5:1 floor brief 05 sets. DAWN moved the rail group labels and the row count
badges to `--color-text-muted` (5.2:1) and lifted the labels from 10px to 11px.
Worth the same sweep in the repo wherever `text-subtle` carries small chrome text.



## 2. Answers to §9's open questions

1. **Vault icon** — finish the swap. `components/layout/nav-icons.ts` currently has
   no `Vault` in its lucide import list and maps `vault: Gem` (line ~86), with
   `store: Store` right above it. So the change is two lines, below.
2. **Light body ink** — confirmed. #3D352A is canon in DAWN.
3. **Post surface** — locked as a concept, yes. The value is now **#F7F5F0** light
   (dark unchanged at #2B2415) after this round's neutral lift, see §1b. Do not
   land #F7F5EF.
4. **Midnight secondary accents** — inheritance is the intent. Midnight keeps
   DAWN's Signal, Broadcast, Move, semantic states and ranks unchanged; only
   surface temperature and corner language shift. Do not fork them.

## 3. Repo action: finish the Quest icon round

Read against the current `components/layout/nav-icons.ts` (verified 2026-08-03):

1. Add `Vault` to the `lucide-react` import block (it is not imported today).
2. In `AREA_ICONS`, change `vault: Gem` to `vault: Vault`. Leave `store: Store`
   and the standalone `Gem` currency glyph alone. `Gem` stays imported (it is
   also listed in `LUCIDE_BY_NAME`, so removing it would narrow the custom-menu
   vocabulary).
3. No other `AREA_ICONS` entry changes. `quests: Compass` and `quest: Compass`
   already landed, `journeys: Route`, `practices: Sparkles`, `crew: Zap`,
   `market: Store`, `housing: MapPinHouse`, `people: BookUser` are all correct
   against the canonical set.

Two canonical-set corrections from the naming canon (brief 02), if these strings
appear anywhere in code or content:

- **Arc is retired.** The `waypoints` glyph should not be labelled "Arc" anywhere.
  DAWN now maps `layers` to **Pillars** and drops the Arc entry.
- **Luminary is retired.** The `crown` glyph is **Catalyst** (the recruiter apex).
  DAWN also adds `scroll-text` for **Certificate**.

## 3b. Naming conflict to settle (needs your call)

`lib/nav-areas.ts` and the `market` comment in `nav-icons.ts` both call the
commerce-umbrella rail row **"Marketplace"** (ADR-868), but the naming canon in
brief 02 retires "Marketplace" as a label and reserves **Market** for the umbrella
and **Classifieds** for the peer board. DAWN's rail recreation reads "Market".
Either the canon or ADR-868 needs to win. If the canon wins, the label change is
in the `market` vertical descriptor (`lib/verticals`, since the row is
vertical-contributed, not a literal in `BASE_NAV_AREAS`).

## 4. Repo action: rank-ladder audit

DAWN's rank system is now the completion ladder only: **Ghost (0) → Initiate (1) →
Adept (2) → Master (3)** Journeys finished this season, mapped to the rank
spectrum as stone / clay / gold / jade. Grep for the retired ladders
(`Runner`, `Operative`, `Agent`, `Conduit`, `Luminary`, `Echo`, `Beacon`) in
`components/`, `content/`, and `docs/` and replace with the four-step ladder or the
Catalyst title. Ghost must never render as a failure or an empty state.

## 5. New kit pieces this round (design-side, for the P3/P4 token and kit sweeps)

Built against BRIEF-06's feature map. All are token-only and have types plus a
prompt file; the repo equivalents belong in `components/ui` / the template kit.

| Component | Why BRIEF-06 asked for it |
|---|---|
| `Counter` / `CounterRow` | One way a member sees a number. The four game counts, mono and small, no deltas. Replaces ad-hoc stat markup (the streak numeral was oversized in three places) |
| `StreakMeter` | §2.12 streaks with freeze tokens. A missed day is a hollow dot, never red; freezes read as the kindness they are |
| `Meter` | §3 freemium meters (200 contacts, 300 sends/mo, 3 QR, 1 journey, 1 seat). Teal, amber at 80%, danger only at the cap. A Space never shows a lock |
| `GateNotice` | §10 built-but-dormant. Four kinds: `preview` (billing in beta), `gated` (graduation), `dormant` (AI, SMS, push awaiting keys), `hold` (white-label sites) |
| `PageHeading`, `UnderlineTabs`, `SectionHeader`, `EntityCard`, `RowCard`, `PersonCard`, `StatCard`, `ProgressTrack` | The §6 "adoption is the gap" list: the kit BRIEF-05 §4 names. UnderlineTabs is the one tab vocabulary |

**Note for the P3 radius sweep:** DAWN now expresses radius by role
(`--radius-control` / `--radius-card` / `--radius-pill`) and those three are what
the Midnight skin retunes. The repo's ~0.5% radius-token adoption should target
the role tokens, not the step scale, or Midnight's sharper corners will not apply.

**Note on pill tabs:** `app/(main)/circles/[slug]/manage/hub.ts` uses a pill
sub-menu with `?section=`, while BRIEF-05 §4 says UnderlineTabs is the ONE tab
vocabulary. Either the manage-hub pattern is a sanctioned exception (a console
sub-menu, not tabs) or it needs reconciling. Flagging rather than guessing.

## 6. Later in the same round

- **Counters + streaks** replaced every ad-hoc stat treatment; the oversized streak
  numeral is gone from the top bar, the feed and the rail.
- **`Meter` + `GateNotice`** carry the caps model and the dormant-state vocabulary.
- **Rail behaviour** is specified: primarily open, never absent, folded means a
  visible strip, folding widens the canvas, and under 1000px the menu overlays.
- **Icons are React-owned SVG.** `lucide.createIcons()` mutates React-owned nodes,
  which crashed any re-render that touched an icon (rail collapse, tab switch). The
  repo uses `lucide-react` so it is not exposed to this, but any hand-rolled
  `data-lucide` usage in a client component is.
- **Teasers cleaned:** per-flow accents hoisted into a documented `--flow-*` palette
  in the teaser stylesheets, hex that was really a DAWN token mapped back to the
  token (two were stale values), em dashes removed, and the last "Marketplace"
  renamed to Market.
- **New screens:** Settings (the whole suite as one page: appearance with the skin
  picker, the four-channel notification grid, connections, account, plan) and the
  Space console rebuilt as an operator dashboard.
- **Marketing evolved:** an editorial header pattern (display line plus the Playfair
  italic), the pillar grid rebuilt as a numbered photo list, and the hero now leads
  with the spirit line.

## Verify
- `npm run dev`; check the left nav (`vault` now renders the Vault glyph) and any
  Quest surface.
- Confirm no retired rank names render anywhere member-facing.
- Open a PR titled **"DAWN sync: Quest icon finish + rank ladder audit"**. Do not
  deploy.

---

## Grounding note

The DAWN rail recreation (`ui_kits/app/nav-rail.jsx`) is built from `lib/nav-areas.ts`
(areas, order, section grouping, labels) and `components/layout/nav-icons.ts`
(`AREA_ICONS` glyphs), and the post card from `components/feed/post-card.tsx`,
`post-replies.tsx` and `lib/feed/reactions.ts`. If any of those four files change,
the kit needs a matching pass.

## 2026-08-03 · chrome, texture and five new pages

**The three docks.** A law of place, in `ui_kits/app/docks.jsx`. Top right is the *system* (region, security, billing, appearance, language, export, help, sign out). The rail's foot is *you and what you run* (profile, standing, journal, prefs — then Circles, events, listings, Spaces, QR studio, payouts). Bottom right is the *Vault* for members (sparks, the stash action, streak and freezes, season counts, ledger) and *this page* for operators (four stats plus that page's switches). Consequences: the streak chip left the top bar, and the feed's inline Settings link is gone — nothing is offered twice.

**Rails are attached tracks.** Both rails are tracks of one grid whose widths are CSS variables, so folding one moves only its own edge and hands the space to the canvas. Folded means a visible strip with a reopen button, never a missing track. Three-position ladder per side: Auto follows the room, Open and Strip are standing instructions honoured until the window cannot. Under 1000px the menu overlays instead of squeezing.

**Texture, light and lift, settled.** `tokens/effects.css` gained `.lift-1/2/3` (two shadows each: contact + depth), `.sheen`, `.spot`, `.dot-grid`, `.arc-top`, `.rule-amber`, `.glass`/`.glass-ink`, and `.reveal` + `.stagger` with `ui_kits/marketing/reveal.js`. `.card-lift` is superseded by `.lift-2` and has been swapped everywhere.

**New pages.** Marketing: For hosts, Circles, Why we exist. Feature screens: Market, Housing, Around You. All on the Event page's grammar.

**Two new guideline cards.** Patterns · Chrome → The three docks. Foundations · Space & feel → Texture, light & lift.


## Message board pass + the Glyph fix (2026-08-03, later)

**`Glyph` is now a DS primitive** (`components/core/Glyph.jsx`). Six components —
Counter, StreakMeter, GateNotice, EntityCard, StatCard, RowCard — were still drawing
raw `<i data-lucide>` nodes. Once the `lucide.createIcons()` calls were removed (they
mutate React-owned nodes and unmount the tree), those icons rendered as empty `<i>`
elements on every screen that used them. `Glyph` reads Lucide's icon data and renders
an SVG React owns end to end; all six now use it. **Repo-side: any component still
calling `createIcons()` or rendering `<i data-lucide>` inside React has the same
latent unmount bug.** Counter's glyph map also gained `posts`, `replies` and `rooms`.

**Message board rebuilt as a ROOM, not a feed.** You arrive knowing who is here, what
the room is for, and what plan is live, then the threads. New: presence (per-room,
never stored), a three-count room strip, a composer that starts closed as one line and
knows the difference between a question and a plan, one pinned plan that expires, sort
control, the gated Hosts room as a `GateNotice` rather than a padlock row, and named
reactions with counts and a pressed state instead of bare emoji — emoji would be a
second icon language, and the one that ages fastest. Also fixed a doubled
`borderBottom` that drew a hairline under every row regardless of state.


## 2026-08-03 · final round: spacing roles, rail law, marketing canon

**Marketing vertical rhythm is a role system, not a padding value.** Every section on
every marketing page had identical padding, so nothing read as more important than
anything else, and two same-tone sections stacked into a dead gap. In
`tokens/utilities.css` a section now takes exactly ONE role class:

| Class | Meaning |
|---|---|
| `.mk-band` | a tone change — the ink beat, a full-bleed statement |
| `.mk-beat` | a content section that follows a tone change |
| `.mk-cont` | a continuation in the same tone as its neighbour |
| `.mk-tight` | a banner or one-line interruption |

Two corrections make it hold: a section **followed by another** gives up a third of
its bottom padding (two stacked sections each paid full price for the gap between
them, so a value that read right at the end of a page read as a hole in the middle);
and `.mk-hero-dock + *` clears a fact dock's overhang. `--space-section` and friends
in `tokens/spacing.css` are retuned for the corrected total. **Repo-side:** the same
double-count exists in any `py-*` section stack. Measured on About: gaps went from
204/187/145/213/128/153px to 147/134/83/145/83/134px — tone changes ~140, same-tone ~83.

**Rail open/close controls: one affordance, at the foot.** A 26px borderless glyph at
the BOTTOM of the rail it belongs to, `--color-text-subtle` → `--color-text-muted` on
hover. Never a bordered button, never at the head — there it competed with the first
real row, and folding a rail is rare. One exception: the small-screen overlay menu
keeps its close at the top, because an overlay's dismiss must be reachable without
reading the panel first. Reference: `RailToggle` in `ui_kits/screens/frame.jsx`.

**Marketing header senses its own ground** (`ui_kits/marketing/header.jsx`). It reads
the first section's background rather than each page remembering `variant="dark"`, and
on dark it now paints the wordmark pure white with a drop shadow, nav at full cream
with a text shadow, plus a top scrim — a bright sky was eating the chrome regardless
of colour. Nav contrast on the About hero: 2.88:1 → **12.4:1**. `variant` still
overrides, for a page that knows better.

**Pricing is on ADR-590 canon, restructured.** Row one, cream: Member · **Crew (best
choice)** · Space, all free, side by side, Crew wider and the only card that floats.
Row two, ink: Business $19 (list $29) · **Collective $49 (list $79, best choice)** ·
Non Profit $39 flat. Struck list prices carry a "Beta price" label. **Repo-side check:**
any surface still showing the retired flat 3% platform fee, or a Business/Collective
price other than these, is stale.

**The Lab is a vision page for 2028**, not a venue page. No rates anywhere, nothing
bookable, concept photography explicitly labelled "Reference, not our room", and the
rate cards replaced by a Now → 2027 → 2028 build timeline. **Repo-side:** if any live
page implies the Lab is open or sells a day pass, it contradicts this.

**Creation wizard** (`ui_kits/screens/creation-wizard.html`) — one flow, two mounts
(modal over any page, or a full page), so a host who starts from the console and one
who arrives by link never learn two flows. Step 1 is a fork — *describe it* or *upload
an outline* — both landing in the same directions box, then basic settings. Then
Material → Shape → Schedule → Review. Only a line of directions is required.

**Also:** `FaqList` ignored the `items` prop five pages were passing it (all showed
the splash FAQ); `quest.html` never loaded `sections.jsx` and rendered blank; the
marketing reveal observer latched only on `isIntersecting`, so any element the
viewport skipped past stayed at `opacity: 0` forever — worth checking if the repo
uses the same pattern.


## 2026-08-03 · templates, and a bug + compatibility sweep

**`@startingPoint` is retired; two templates replace it.** Consuming projects read
`templates/` now, so the four old tags (app shell, marketing shell, Button, Card) are
gone and `templates/app-shell/` + `templates/marketing-site/` are the starting points.
No repo action — this is how DAWN is consumed, not how it ships.

### Bugs found and fixed this round

1. **`createIcons()` was still live in five places** — both UI-kit shells (on every
   render), the core, feedback and kit component cards. Since `Glyph` landed, nothing in
   the system draws `<i data-lucide>`, so the call had no upside and one real downside:
   it replaces React-created nodes, and the next state change unmounts the tree. The
   core card was the live case — it has a stateful Like toggle, so clicking it twice
   could take the card down. **Repo-side: the same pattern in any client component is
   the same bug.** `lucide-react` is not exposed to it.
2. **Dead `Ic` helper in `sections.jsx`** drawing the forbidden node type. Deleted.
3. Verified after the fix: the feed renders 71 React-owned SVGs and zero `<i
   data-lucide>`; the core card survives repeated re-render.

4. **The marketing header's tone sensor assumed a `#root` mount.** It asked for
   `#root section, body > section`, so wherever the mount was named differently or the
   sections were not direct children of `body` (a Design Component wraps them in its own
   hosts) it found nothing, bailed before reading the tone, and a dark photographic hero
   got the light treatment — a brown wordmark on a photograph at ~1.3:1. The sensor now
   takes the first `section` in document order outside the header's own subtree, which is
   shape-agnostic, and retries for up to 12 frames in case the hero mounts late.
   **Repo-side:** any DOM-shape assumption like this breaks the moment the component is
   reused in a different mount; sense from relationships, not from mount names.

### Compatibility notes (these matter for the repo's browser floor)

| Feature | Where | Floor |
|---|---|---|
| `:has()` | `tokens/utilities.css` — the section-adjacency rhythm correction | Chrome 105 / Safari 15.4 / Firefox 121 |
| `color-mix()` | everywhere a tone is derived from a token | Chrome 111 / Safari 16.2 / Firefox 113 |
| `mix-blend-mode: screen` | the hero's warm horizon light | universal |
| `backdrop-filter` | `.glass` / `.glass-ink`, the marketing header scrim | `-webkit-` prefix included |
| `aspect-ratio` | `PhotoTrio` figures | Chrome 88 / Safari 15 |
| `scrollbar-width: none` | rail scroll containers | has a `::-webkit-scrollbar` fallback |

The two that could actually bite: **`:has()`** — if it is unsupported the marketing
rhythm degrades to slightly generous gaps, never a broken layout, so it is safe as
progressive enhancement; and **`color-mix()`**, which has no graceful fallback. If the
repo's floor is below Safari 16.2, the derived tones need resolving to static values at
build time. Everything else is comfortably inside a 2023 baseline.
