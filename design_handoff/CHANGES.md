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

**Pricing restructured.** Row one, cream: Member · **Crew (best choice)** · Space, all
free, side by side, Crew wider and the only card that floats. Row two, ink: Business ·
**Collective (best choice)** · Non Profit flat.

> ⚠️ **Updated 2026-08-19.** As built on 2026-08-03 this row carried struck "Beta price"
> anchors (Business $19 over $29, Collective $49 over $79). The Opening Beta window
> CLOSED on 2026-08-17 ([ADR-1060](../docs/DECISIONS.md)), so those anchors are gone:
> `ui_kits/marketing/pricing.html` now shows **Business $29 · Collective $79 · Non
> Profit $39 flat**, one price each, with a yearly caption ("Or $290 a year, two months
> free") where the strike used to be. **Repo-side check:** any surface still showing a
> struck anchor, a "Beta price" / "Opening Beta" / founding-rate caption, the retired
> flat 3% platform fee, or a Business/Collective price other than $29/$79 is stale.

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


## Repo → DAWN · 2026-08-05 (outbound, for the next round)

Five things production found while adopting DAWN. `SYNC.md` §"Going the other way" asks for
these; each is a place DAWN should change, not the repo.

**1. DAWN contradicts itself on eyebrow tracking, and it is load-bearing.** `readme.md` §4 says
"Eyebrow tracking is locked at **0.25em**, uppercase, bold." `tokens/typography.css` declares
`--tracking-eyebrow: 0.18em`, and DAWN's own `.eyebrow` class reads the token — so every DAWN
component has always rendered 0.18em while the spec prose said 0.25em. Production had BOTH in the
wild (27 sites at `tracking-[0.25em]`, matching the prose). We resolved to **0.18em**, the token,
per the rule that machine-readable state beats prose. **Please fix the readme sentence** — this is
the exact value the R7 sweep is converging ~698 sites onto.

**1b. And DAWN contradicts itself on eyebrow SIZE too — same shape, second axis.**
`tokens/typography.css` declares `--text-eyebrow: 0.875rem`, but the `.eyebrow` class two
declarations below reads `--text-meta` (0.75rem). So the token named for the role is not the one
the role renders, and a consumer gets a different size depending on whether they write the class
or the token. Production had inherited both.

**Resolved DOWN to 0.75rem, and our `eyebrow` utility now reads `--text-eyebrow` so the role owns
its own size.** The reasoning, in case DAWN wants to resolve the other way: 0.875rem is also
`--text-body-sm`, so an eyebrow at that size is exactly as large as the sentence it is meant to
label, and stops reading as a label at all. `--text-meta` is documented as the content FLOOR,
which is where a small uppercase chrome label belongs.

**Suggestion:** make `--text-eyebrow` the single declaration and have `.eyebrow` read it, rather
than keeping a role token that nothing uses. A token whose own class ignores it will drift again.

**And DAWN should know it cost us something, because this paragraph said it had not.** It read
"net rendered change for us was zero" from 2026-08-05 until 2026-08-18, and that was true only of
the *stylesheet*: no site had reached 0.875rem through the utility. It was never true of the
product. `components/page-editor/blocks/kit.tsx` exported an `<Eyebrow>` component rendering
`--text-body-sm`, about 25 block call sites imported it, and a copy of its class string drove the
Space editor canvas — so for thirteen days the repo held a resolved token and an unresolved
product, and DAWN's declared 0.875rem kept rendering on the marketing pages under an import
instead of a class. Settled 2026-08-18: the component composes the role and the second register is
gone (ADR-1075). The reason to send this rather than quietly fix it is DAWN's half of the
suggestion above — **a token whose own class ignores it drifts, and so does a role whose own
component ignores it.** One declaration, and every consumer reaches the role by one name.

The eyebrow now has one answer on both axes here — **0.75rem / 0.18em / bold / uppercase**. (Bold,
not semibold: that was a THIRD DAWN self-contradiction, `readme.md` §4 saying "uppercase, bold"
against the `.eyebrow` class's semibold, resolved to bold on the evidence of production's own
count — see ADR-1072. Worth fixing in DAWN alongside the two above.) Guarded by
`lib/theme/eyebrow-role.test.ts`, which reads `globals.css` from disk and fails if the utility and
the token ever point at different values again, and now also fails if any component re-declares
the role instead of composing it.

**2. Four tokens where production is ahead** (contrast fixes DAWN has not picked up):

| Token | DAWN | Production | Why |
|---|---|---|---|
| `--color-focus-ring` | `#E2912F` | `#B86A15` | 1.75:1 → 3.87:1 |
| `--color-text-on-primary` | `#FFFFFF` | `#1A1206` | white on amber fails AA |
| `--color-text-on-broadcast` | `#FFFFFF` | `#1A1206` | same, on the broadcast cyan |
| `--color-text-subtle` | `#8F8675` | `#6E6558` | the contrast sweep darkened it |

**3. The Vault row's glyph.** `ui_kits/app/nav-rail.jsx` still names `gem` for `vault`. Production
moved the Vault to the literal vault-door glyph in the 2026-08-03 round and kept Gem as the
currency mark. DAWN's rail reference is stale against its own round.

**4. `Badge.prompt.md`'s solid variant is wrong on light.** It sets the label to
`color: var(--color-surface)`, which on a light `primary-strong` fill renders dark-on-dark.
Production pairs each fill with its own `--color-text-on-*` token instead. Suggest DAWN adopt the
pairing tokens.

**5. The rank spectrum needed `deep`/`bright` as utilities, not just CSS vars.** DAWN documents
core = fill · deep = text on light · bright = text on dark, but only `.rank-badge` could reach the
last two, so anything needing rank-coloured TEXT reached for a raw palette class instead. That is
the whole reason `lib/gamification.ts` carried the repo's last 48 raw Tailwind palette classes.
Production has bridged all three steps now. Worth saying in the spec that the ladder is meant to be
reachable by callers, not only by the badge primitive.


## 2026-08-11 · the mobile grammar (answering `BRIEF-07-MOBILE-GRAMMAR.md` §6)

**How to read the numbers below.** Every px value is stated at **this app's 17px root**
(`--density-root: 106.25%`, `app/globals.css:217` + `:1752`), because a `rem` class does not
render at its Tailwind name here: `bottom-32` is 136px, not 128; `w-72` is 306px, not 288.
The brief's §1-§5 were computed at 16px, so several of its figures are restated rather than
repeated. **Media queries are the exception and it is load-bearing.** A media query resolves
`rem` against 16px, not against the root (globals.css:323-324 already says so). Breakpoints and
paddings therefore run on two different unit bases in the same layout. That fact decides Q3.

**Three of §1-§5's facts no longer hold.** The brief was read 2026-08-04; the owner shipped
against it on 08-05 and 08-06. Per `AGENTS.md` ("when the code and a plan doc disagree, the code
wins"), the answers below are written against the code:

| Brief says | Live |
|---|---|
| Vault dock needs `lg`, mounted inside the right-rail column (§1, §2) | `DockBar` is a shell sibling at `fixed bottom-0 right-3 z-40 hidden … md:flex`, so it renders **from 768** (`dock-bar.tsx:633`, `app-shell.tsx:2486-2489`) |
| Two toasts disagree; `zap-toast` at `bottom-4` (§2) | One lane. `TOAST_LANE_CLASS` = `fixed bottom-32 right-4 z-[60] … md:bottom-24` (`components/toast-lane.tsx:47`); both stacks are children of it |
| Chat edge pill at `bottom-20`, part of the bottom stack (§2) | `fixed top-1/2 -translate-y-1/2 z-40` (`edge-pill.tsx:107`), a mid-right object, off the bottom edge entirely |
| Score at the drawer's **foot** (§3) | Inside the identity card at the drawer's **head**, as a collapsed disclosure capped `max-h-[50dvh]` (`app-shell.tsx:1333-1370`, owner 2026-08-06) |

### Q1. What the bottom edge means on a phone

**The tab bar is the sole owner of the phone's bottom edge, and the score does not get a home
there.** DAWN's docks card states the bottom-right dock as a popover on one shared shell that
"opens toward the interior"; a 306px tab, a seven-slot bar and a centred raised action cannot all
own the same 93.5px. The score's phone home is the drawer (Q7). `game-stats-dock.tsx:98` already
writes the invariant, *score once per viewport*, and it is correct.

**THE MOBILE STACKING CONTRACT**, from the safe-area edge up, measured on 390×844 with a 34px
home-indicator inset. It is the mobile half of the block at `components/sidebar/game-stats-dock.tsx:70-98`,
and it belongs beside the desktop one in that same comment.

| Slot | What | Geometry (from the viewport bottom) | z |
|---|---|---|---|
| **0** | The tab bar. Nothing else may be `bottom-0`. | `[0, 93.5]`, i.e. `var(--tab-bar-h)` = `3.5rem + env(safe-area-inset-bottom)` = 59.5 + 34 | 40 |
| **0a** | The raised Zap catch, a child of slot 0 breaking upward. `h-14` (59.5px disc) at `top-0` translated −22px. | spans `[34, 115.5]`; the exposed band above the bar is `[93.5, 115.5]`, 59.5px wide, centred | 40 |
| **1** | The toast lane. One lane, one definition. | `bottom-32` = **136px**, `right-4` = 17px. Clears slot 0a's top by **20.5px** | 60 |
| **2** | A bottom sheet (Vera `h-[68dvh]`, the capture composer). Takes the edge *from* slot 0 while open and pads its own inset. **One at a time.** | `inset-x-0 bottom-0`, `max-w-md` | 50 |
| **3** | **RETIRED.** The chat edge pill left the corner when the Vault and the chat became one bar. There is no second floating object to keep away. | n/a | n/a |

**The rule for any new fixed element.** Six lines, and they are the answer to "what must a new
fixed element do":

1. **Name your slot before you pick a number.** If it is not a tab bar, a toast or a sheet, it
   does not belong at the phone's bottom edge. Put it in the drawer or in the flow.
2. **Measure from `var(--tab-bar-h)`, never from a literal.** The bottom inset is 0 on one phone
   and 34px on the next; a literal is right on exactly one device.
3. **Clear 115.5px, not 93.5px.** The raised Zap's catch is the real top of the bar. This is the
   one number every prior comment in this area got wrong.
4. **Two fixed boxes that must not overlap is not a thing you fix with better offsets. It is one
   box.** `toast-lane.tsx` is the precedent and it was written after two lanes drifted into being
   byte-identical.
5. **The z-ladder is fixed: bar 40 · sheets 50 · toasts 60.** A toast is transient and
   `pointer-events-none`, so it deliberately outranks the sheet it briefly overlaps.
6. **State the arithmetic at a 17px root in the comment.** Every `bottom-*` in this app is 6.25%
   larger than its class name.

**Change, and where §7 already sends it** → `components/sidebar/game-stats-dock.tsx`, the `< 768`
half of the contract comment. Two figures in it are corrected in the same pass: the catch top is
**115.5px** (not 112), and `bottom-32` is **136px clearing by 20.5** (not 128 clearing by 16).
`components/toast-lane.tsx:38-44` carries the same 16px arithmetic and gets the same correction.
The zap-toast position the brief asked us to fix against the contract **is already fixed**: both
stacks are children of the one lane.

### Q2. Where the score lives between 768 and 1023

**Nowhere new: it is already the anchored bar, and that is the right answer.** The 🔴 hole closed
on 2026-08-05, before this round. `DockBar` is `hidden … md:flex` (`dock-bar.tsx:633`) and is
mounted as a **shell sibling**, not inside the rail column (`app-shell.tsx:2486`). Its own comment
names why: *"the rail column is lg:flex and this must render from md."*

**DAWN's files already required this and the repo's old mount broke a stated law.** The docks card
closes with **"Rails are not docks. The rails carry content. Controls belong to the docks."**
DAWN's own `VaultDock` is `position: fixed; bottom: 16; right: 16; z-index: 65`
(`ui_kits/app/docks.jsx:205`) and the shell renders it **with no breakpoint gate at all**
(`ui_kits/screens/frame.jsx:212`), while the right rail beside it strips at `w < 1100` and
auto-closes at `w < 1400`. So in DAWN the Vault has never been rail-conditional. The 768-1023 hole
was never a design gap; it was one mount inheriting a neighbour's breakpoint.

The band today: left rail present, right rail absent, the Vault bar present carrying zaps/gems/streak
(the `lg:hidden` on the Vault segment is a *fold* rule and cannot fire below `lg`), chat segment
present. Score once per viewport holds: **< 768 the drawer's identity card · ≥ 768 this bar.**

**Change** → **none in `app-shell.tsx`.** §7 budgeted "two breakpoint edits" for Q2/Q3 and this
round spends **zero**. One doc edit is owed: `docs/DAWN-CONVERSION.md:300` still carries this as
🔴 with a fix that shipped.

**One divergence we are declining, with the reason.** DAWN says *"a folded rail is a visible
strip, never a missing track"*; the repo's right rail is `hidden lg:flex`, genuinely missing
below 1024, not stripped. We are keeping that. At 768-1023 the bar already carries the rail's
most-read content, and spending 2.375rem of a 768px canvas on a reopen affordance buys a member
nothing they cannot get from the bar. Stated so it is a decision rather than an oversight.

### Q3. Is the number 1000 or 768?

**768, and DAWN's 1000 is re-scoped rather than overruled, because the two numbers were never
measuring the same thing.**

**DAWN does not actually run one line.** `ui_kits/screens/frame.jsx:150-158` runs four:
`overlayMenu: w < 1000` · `autoLeft: w < 1180 ? 'icons' : 'open'` · `forceRightStrip: w < 1100` ·
`autoRight: w < 1400 ? 'closed' : 'open'`. `readme.md:404` and `:513` compress that to "under
1000px the menu leaves the layout", which is true of DAWN's *menu mode* and not of its shell. So
the law text is a simplification of DAWN's own code, and the brief's ⚠️ ("one of the two numbers
is wrong") has a third answer: **both are right about different jobs.**

- **1000 is a menu-mode line.** In DAWN the menu can overlay at 1000 because `<TopBar
  onToggleNav>` is always on screen, so the overlay always has an opener.
- **768 is the repo's input-mode line.** Below it the shell becomes touch chrome: tab bar in, rail
  out, drawer in. The drawer's **only** opener is the tab bar (`app-shell.tsx:1487-1497`), and the
  tab bar is `md:hidden` (`:1481`).

**Which is why the "contained fix" is not contained.** `docs/DAWN-CONVERSION.md:300` proposes
`--breakpoint-rail: 62.5rem` plus "swap only the five rail/menu classes". Move the rail to 1000
and 768-999 has no rail, no tab bar and therefore **no way to open the menu at all**. It is five
classes plus a new header control plus a second drawer trigger, and it buys a band that is not
broken today.

Three more reasons, all measurable:

1. **Cost.** `rg -oE '\b(md|lg):' components app lib` → **870** sites (DAWN-CONVERSION quotes 629
   for the same class). Either figure is three orders of magnitude past the five it would fix.
   **`--breakpoint-md` is not redefined. `--breakpoint-rail` is not added.**
2. **Two unit bases in one decision.** `--breakpoint-rail: 62.5rem` lands at **1000 CSS px**
   (media queries resolve `rem` against 16px) while every rem in the layout it governs renders at
   17px. A permanent footgun for a five-class win.
3. **DAWN's real ladder is not a breakpoint anyway.** `autoLeft`/`autoRight`/`forceRightStrip` are
   *auto-fold* thresholds: they change a rail's **position on the ladder**, not whether it is in
   the layout. The repo has that ladder (`lib/layout/rail-fold.ts`, ADR shipped 2026-08-05) but
   `autoStrip` is keyed on the **route** (`railStartsCollapsed(pathname)`), never on the room. So
   DAWN's "Auto follows the room" is the half the repo has not built, and it is the half 1000
   belongs to.

**What 768-1023 shows: unchanged.** Left rail open, no right rail, the Vault bar. What is owed is
above 768, not below it.

**Change** → **DAWN-side, one sentence.** `readme.md:404` and `:513` are corrected to say the
menu leaves the layout at the consumer's **touch line**, and that 1000/1100/1180/1400 are the
desktop auto-fold ladder. Repo-side, `lib/layout/rail-fold.ts:35-38` already states this as an
open question and its parenthetical is updated to record the ruling. **A viewport-driven `auto`
(DAWN's 1180 / 1400) is a separate, larger item; see "Not answered" below.**

### Q4. Do the four marketing roles survive at 390px

**They survive as four, but only after the floors are re-cut. Today two of them are 12.75px
apart and that is below noticing.**

**First, a structural finding the brief did not make: the four roles are four TOP paddings.**
The adjacency correction (`globals.css:1601-1603`) is `padding-bottom: calc(var(--space-section)
* 0.62)` on **all five** role classes, so **every non-final section on the page has the same
bottom**. Half of every gap is a constant. That is the real reason the rhythm reads weakly
long before you get to the phone.

**Measured now, at 390px and 17px root** (the brief's table is the same values at 16px):

| Token | Formula | **390px** | 1440px |
|---|---|---|---|
| `--space-section-loose` (`.mk-band`) | `clamp(5rem, 9.5vw, 7rem)` | **85px** (floor; 9.5vw = 37.1) | 119px |
| `--space-section` (`.mk-beat`) | `clamp(4.25rem, 8vw, 5.5rem)` | **72.25px** (floor; 8vw = 31.2) | 93.5px |
| `--space-section-tight` (`.mk-tight`) | `clamp(3rem, 5.5vw, 3.75rem)` | **51px** (floor; 5.5vw = 21.5) | 63.75px |
| adjacency bottom (`× 0.62`) | `--space-section × 0.62` | **44.8px** | 57.97px |
| gutter | fixed `1.5rem` (twice: the role class **and** `Section`'s `px-6`) | **25.5px** | 25.5px |

**The gaps that produces.** A gap is *upper's bottom + lower's top*, so these are the numbers a
reader actually sees:

| Seam | **390px today** | 1440px | **390px proposed** |
|---|---|---|---|
| → `.mk-band` (a tone change) | 129.8 | 177.0 | **113.4** |
| → `.mk-beat` (the workhorse) | 117.1 | 151.5 | **96.4** |
| → `.mk-tight` (a statement) | 95.8 | 121.7 | **75.1** |
| → `.mk-cont` (one argument, two blocks) | 44.8 | 58.0 | **36.9** |
| **loudest − quietest spread** | **34.0** | **55.3** | **38.3** |

The three clamps unpin at **895 / 903 / 927px** respectively. DAWN's own marketing kit collapses
to one column at **900px** (`templates/marketing-site/MarketingSite.dc.html:21`, and the same
number in `about.html`, `operators.html`, `circles.html`). So DAWN's phone/tablet line and the
point where the rhythm starts breathing are already the same number, by accident. Below it, the
page gets whatever the desktop clamp bottomed out at, which is the brief's charge, upheld.

**Answer 1. Four roles, still four.** Do not drop to three. `.mk-cont` at 36.9px is the most
useful of the four (it is the "these two are one argument" seam) and would be the one dropped.
The problem is not the count, it is that the band↔beat step at 390 is **12.75px**, 3.3% of the
viewport width, seen ~800px apart in a scroll. Re-cut, that step is **17px** (a 28.6% relative
step) and the four gaps land at 113 / 96 / 75 / 37: four separated values.

**Answer 2. The phone values, as three floor edits.** Ceilings and `vw` terms untouched, so this
is exactly what §7 budgeted (*"new floors on the three `--space-section-*` clamps, one file"*):

| Token | Floor now | **Floor proposed** | Why |
|---|---|---|---|
| `--space-section-loose` | `5rem` (85px) | **`4.5rem`** (76.5px) | |
| `--space-section` | `4.25rem` (72.25px) | **`3.5rem`** (59.5px) | |
| `--space-section-tight` | `3rem` (51px) | **`2.25rem`** (38.25px) | |

The ratio is the point. Desktop reads **1.273 : 1 : 0.682**; today's floors read **1.176 : 1 :
0.706** (flattened); the proposal reads **1.286 : 1 : 0.643**: the desktop ratio, restored.
**And every gap gets smaller**: 129.8→113.4, 117.1→96.4, 95.8→75.1. More rhythm and less dead
scroll, in the same edit. Side effect, stated: the clamps unpin at 806 / 744 / 696px instead of
895 / 903 / 927, so the tablet band gets a continuous ramp instead of a cliff. At 768px a beat
goes 72.25 → 61.4px, ~15% tighter. That is correct for a tablet and it is the reason to keep the
`vw` terms exactly as they are.

**Answer 3. The ×0.62 holds, unchanged.** It is a proportion of a proportion: it has no viewport
term and cannot scale wrong. It is also not the thing that is broken (see the structural finding).

**Answer 4. The gutter holds at 1.5rem, and stops being an accident.** Measured: 25.5px each
side of 390px leaves **339px** of measure, which at `--text-body` (1rem = 17px) runs roughly 46-52
characters per line, inside the comfortable band. Cutting to `1.25rem` buys 8.5px of measure
(2.5%) and pushes body copy into iOS's ~20px edge-swipe region. It is not a rhythm value; it is a
**safety margin**, and a safety margin that tracks the viewport is not a safety margin. So it holds
by decision rather than by omission. **But it should track the safe area**, which it does not:
`app/layout.tsx:81` sets `viewportFit: "cover"` and the `.mk-*` gutter is a bare `1.5rem`, so in
landscape on a notched phone marketing copy runs under the notch. `.px-safe` exists
(`globals.css:1716`) and the app shell uses it; marketing never got it.

**Bug found in the same rule.** `globals.css:1558` reads `.mk-band, .mk-beat, .mk-cont, .mk-tight
{ padding-inline: 1.5rem; }`, and **`.mk-cont-soft` is missing**, in the repo and in DAWN's
`tokens/utilities.css:84` identically. Any hand-rolled `.mk-cont-soft` section renders edge-to-edge.
It is latent only because `Section` also emits `px-6`.

**Change** → `app/globals.css`, one block: the three floors, `.mk-cont-soft` added to the gutter
selector, and the gutter becomes `padding-inline: max(1.5rem, env(safe-area-inset-left)) max(1.5rem,
env(safe-area-inset-right))`. DAWN-side, `tokens/spacing.css:33-35` and `tokens/utilities.css:84`
take the same edits.

### Q5. Hero fact docks: strip, and it stops overhanging

**Neither stack, nor truncate, nor a smaller wrap. Below `sm` the dock leaves the overhang and
becomes an in-flow strip at the foot of the hero.** DAWN's answer is in its files and it is a
fourth option the brief did not list:

- DAWN's dock is `whiteSpace: 'nowrap'`, `gap: 34`, *"Three numbers, never more"*
  (`ui_kits/marketing/sections.jsx:264-274`). **DAWN's dock does not wrap.** The repo's
  `flex-wrap` (`marketing-ui.tsx:125`) is a local addition.
- DAWN's own narrow-screen escape is `@media (max-width: 900px) { .op-dock { position: static
  !important; } }` (`ui_kits/marketing/operators.html:20`): the dock **stops being absolutely
  positioned** and goes in flow.

That dissolves the problem instead of retuning it. Truncate is rejected on voice, not layout: the
facts are a claim, and a phone showing two of three reads a different claim than desktop. Stack is
rejected on arithmetic: three rows at the current numeral size is 200px+ of chrome on a 390px
screen, at which point it is not a dock.

**The arithmetic, so the strip is specified and not vibed.** Today at 390px the panel is
`max-w-[calc(100vw-2rem)]` = **356px**, minus `px-6` (25.5 × 2 = 51) minus two `gap-6` (25.5 × 2
= 51) = **254px for three columns, 84.7px each**. A label at `--text-3xs` (10.625px) with
`--tracking-eyebrow` (0.18em) exceeds that at roughly twelve characters, which is why it wraps.
In flow and full-bleed to the gutter the box is **339px**, and with `px-4` (17px) and `gap-3`
(12.75px) each column gets **93.2px**. That is enough, with the label allowed two lines.

**The rule:**

| Width | The dock |
|---|---|
| **≥ 640px (`sm`)** | Unchanged. Absolute, `-bottom-8`, `nowrap`, three facts on one row. |
| **< 640px** | In flow: the last child of the hero, inside the hero's own bottom room. Full-bleed to the marketing gutter, `grid-cols-3`, `gap-3`, `px-4 py-3`. Numerals step `--text-page-title` (1.5rem) → `--text-lead` (1.25rem). Labels stay `--text-3xs`, tracking relaxes `0.18em` → `0.08em`, and may take **two lines**; a numeral never wraps. `flex-wrap` is dropped, because the strip is a grid, so it cannot grow upward into the subtitle. |

**And the clearance follows it.** `.mk-hero-dock + *` is
`calc(var(--space-section)/2 + 3rem)` = **87.1px at 390px**, computed for a one-row overhanging
dock. Below `sm` the overhang is **zero**, so that clearance is 87px of hole. It collapses to the
ordinary no-dock treatment: wrap the `.mk-hero-dock + *` rule in `@media (min-width: 40rem)` and
let `.mk-hero:not(.mk-hero-dock) + *`'s zero apply below it. (`40rem` here is a media query, so it
is **640 CSS px**, the same line as `sm`, on the 16px basis. Stated because the paddings around
it are 17px-based.)

**Change** → `components/marketing/marketing-ui.tsx:124-135` (the dock) and `app/globals.css:1615-1619`
(the clearance), exactly as §7 names them.

### Q6. Thumb-zone rules for the docks and the raised action

**Minimum target: 44 × 44 CSS px for anything `fixed`. Established here, not imported.**
`globals.css:1655-1657` sets `@media (pointer: coarse) { :root { --tap-min: 44px; } }`, consumed
by `@utility tap-target` (`:1673-1676`). WCAG **2.5.5** (AAA) is 44×44; **2.5.8** (AA, 2.2) is
24×24. The adoption ratchet allowlists `min-h-[44px]` by name and its entry cites 2.5.5
(`scripts/adoption-baselines.json:818`), and the header's search button was fixed this month
after axe measured it at **21.3 × 34** on `/feed` (`app-shell.tsx:2055-2064`). So 44 is the
house number and it is machine-enforced.

**One new rule, and it is ours, not DAWN's: a fixed control takes the coarse-pointer 44px and
never the per-generation dip.** `--tap-min` is non-monotonic by design: `bold` dips to 26px
(`globals.css:904`). That dip is a density choice for controls **in flow**, which have neighbours
to borrow slack from and a scroll that can reposition them. A fixed control has neither.

**The bar clears it with room, and here is the ceiling that keeps it clearing.** Seven `flex-1`
slots at 390px = **55.71 × 59.5px**. At 320px (the narrowest supported phone) seven slots are
**45.7px**, still over 44. **Eight slots at 320px would be 40px and fail 2.5.5, so seven is a
hard cap on the tab bar, not a preference.** The drawer's foot Close is ~50px tall (`py-3` plus a
`text-body-sm` line) and passes.

**Minimum gap between two fixed controls. Two numbers, because there are two failures:**

| Rule | Value | Grounding |
|---|---|---|
| Never closer than | **12.75px** (`--space-3`) | the overlap floor |
| Two separately-actionable fixed controls are **either ≥ 40px apart or joined into one object** | 40px | `game-stats-dock.tsx:57-60`: the Vault chip and the chat pill never overlapped (there was 12px of clearance), and *"two floating, right-aligned, click-to-open pills 12px apart read as ONE cluster"*. The repo's own resolution was to **join them**, which is the better half of this rule. |

**The reachable band: `bottom-0` to `35dvh`, 295px on a 390×844 phone.** ⚠️ **This is a judgement
call. DAWN has no thumb-zone guidance .** No media queries in `tokens/`, nothing in
the docks card, nothing in `readme.md`. It is anchored to the numbers the repo has already
committed to rather than to a heatmap: slot 0 ends at 93.5, the toast lane at 136, and the
drawer's Vault disclosure is capped `max-h-[50dvh]` (`app-shell.tsx:1364`) precisely so the
drawer's foot Close stays reachable. 35dvh is the smallest band that contains all three with the
Close inside it. Anything a member touches more than once a session goes in the band; anything
they touch once a month does not have to.

**What may pass beneath a floating control.** The answer is "content, never a control", and there
is a live defect.** The raised Zap's catch breaks **22px** into the content column across a 59.5px
disc (Q1, slot 0a). The content column pads by `var(--tab-bar-h)` (`app-shell.tsx:1935`) but
**not** by the catch's overhang, so the final 22px of a page's last element sits under the disc
with nothing below it to scroll. That is the concrete rule and the concrete fix:

- A floating control may overlap **scrolling content that can be scrolled clear of it**.
- It may never overlap **a control**: no submit button, no link, no input.
- Therefore the content column's bottom pad grows by the overhang, and the overhang stops being a
  literal in two files: add `--tab-bar-lift: 22px` beside `--tab-bar-h`, and the column pads
  `calc(var(--tab-bar-h) + var(--tab-bar-lift))`.

**Change** → `components/sidebar/game-stats-dock.tsx` (these rules ride with the Q1 contract, in
the same comment), plus the `--tab-bar-lift` token and the column pad in `app/globals.css` /
`app-shell.tsx:1935`. **The 44px floor and the seven-slot cap need no code change today**: both
already hold; they are being written down so the next fixed element cannot break them quietly.

### Q7. "You and yours" when there is no rail

**The drawer does not read foot-first, and it should not. The premise the brief was written on
changed on 2026-08-06 and the law was never inverted.**

**Why the law's geometry does not transfer.** The docks card puts *you and what you run* at the
rail's foot because the dock is a **popover** and the foot is its **anchor**, and "opening toward the
interior" is the sentence right beside it. It is not a claim that identity is the last thing a
member reads. On a phone the drawer **is** the popover: the whole surface is the dock, so there is
no foot to anchor to and no anchor to invert. What transfers is the law's *grouping*: identity,
standing and the things you run are **one cluster, offered once**, and the owner's 2026-08-06
change satisfies exactly that by folding the score into the identity card as a disclosure
(`app-shell.tsx:1333-1370`). Its own comment gives the measurement that forced it: the old foot
cluster capped stats at 40dvh while the nav was `flex-1` with a min-height of 0, so on a 568px
screen the site nav resolved to about **58px, two rows**.

**The residual, and it is real.** *What you run* is still distributed through the nav list rather
than clustered with identity, so the bottom-left dock's three parts are two clusters on a phone.
**Change:** the identity card takes a second collapsed disclosure, **"What you run"** (My Circles,
events, listings, Spaces, QR studio, payouts, orders), built the same way as the Vault one: same
`grid-rows-[0fr] → [1fr]` row, same `--motion-base`, collapsed by default so the nav keeps its
height. → `app-shell.tsx`, `MobileLeftDrawer`.

**The foot-mounted Close stays, and it stops being an exception.** `readme.md:497` frames it as
"the one exception" for overlays. Restate the law by mechanism and the exception disappears:
**a dismiss goes where the hand is.**

- The app drawer is full-height and opened dozens of times a day, so its **near edge is the
  bottom** → Close at the foot, in the 35dvh band (Q6). Correct as built.
- The marketing overlay is anchored `inset-x-0 top-0` and a visitor opens it once or twice, so its
  **near edge is the top** → Close at the top (`marketing-mobile-menu.tsx:84-92`). Also correct.

Same rule, two answers, no exception to remember. **Change** → DAWN's `readme.md:497` sentence;
no repo code.

### What this round is NOT answering, and why

- **Mobile reference frames per screen.** §7's first row asks for them and this round does not
  ship them. This round answers the seven questions, which is what gates the floors, the dock rule
  and the contract; the five highest-traffic screens need the Lift 4b baselines rendered beside
  them to be worth drawing, and drawing them blind is how a frame ships a value nobody measured.
- **Making `.mk-*`'s adjacency correction role-aware.** The structural finding in Q4, that every
  non-final section shares one bottom, so half of every gap is constant, is the deeper cause of
  the weak rhythm. Changing it moves **desktop** too, and §7 scoped Q4 to floors in one file.
  Named here so it is a deferral rather than a miss. It is the next marketing question.
- **A viewport-driven `auto` on the rail ladder** (DAWN's `autoLeft: w < 1180`, `autoRight: w <
  1400`, `forceRightStrip: w < 1100`). The repo's `autoStrip` is route-keyed
  (`railStartsCollapsed(pathname)`), so "Auto follows the room" is unbuilt. It is a real gap and
  it is not a breakpoint edit: a viewport-driven fold is *markup*, and the server cannot know the
  viewport, which is the same reason `rail-fold.ts:26-38` keeps the narrow-window yield in CSS.
  Solving it needs a container-query or a cookie-mirrored width, and that is its own round.
- **The right rail missing rather than stripped below 1024.** Declined this round with the reason
  stated in Q2, not deferred.
- **Marketing's 23 categorised header children unreachable on a phone**
  (`docs/FINALIZE-PLAN.md:239`). Owner-deferred; it is a menu-contract item, not a grammar item,
  and naming it here would blur the two.

### Repo → DAWN, out of this round

1. **`readme.md:404` and `:513`** say "under 1000px the menu leaves the layout" as a single law.
   DAWN's own `frame.jsx:150-158` runs four thresholds. Please restate: 1000 is the **menu-mode**
   line for DAWN's kit, and 1100/1180/1400 are the desktop auto-fold ladder. A consumer whose
   overlay opener lives in touch chrome reads that sentence and moves the wrong number.
2. **`readme.md:497`'s overlay exception** is better stated as *the dismiss goes where the hand
   is* (Q7). One rule, two correct answers, nothing to remember.
3. **`tokens/utilities.css:84` omits `.mk-cont-soft`** from the gutter selector, so a hand-rolled
   `.mk-cont-soft` section renders edge-to-edge. Same bug in the repo; both fixed in the same pass.
4. **DAWN's fact dock has no phone value.** `sections.jsx:264` is `nowrap` with three facts and no
   narrow-screen rule; only `operators.html` has one, as a per-page `!important`. Please promote
   `position: static` below the marketing collapse line into `tokens/utilities.css` as a real rule,
   with the matching `.mk-hero-dock + *` collapse, so it is not per-page.
5. **DAWN has no thumb-zone or tap-target guidance at all.** `tokens/` carries no media query
   except `prefers-reduced-motion` and `scripting: none`. The 44px floor, the seven-slot cap, the
   two-gap rule and the reachable band in Q6 are the repo's, written here so DAWN can adopt or
   overrule them. This is the one place the design system genuinely did not cover the ask.

### Verify

`pnpm check:docs-links` · `pnpm check:canon`. Nothing in `app/`, `components/`, `lib/` or
`app/globals.css` was touched by this round; every change above is named for the file §7 commits
it to and lands in a separate `sync DAWN` pass with its own PR (`SYNC.md` step 5).
