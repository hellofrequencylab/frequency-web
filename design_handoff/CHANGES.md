# CHANGES.md — DAWN round of 2026-08-25 (reply to `HANDOFF-TO-DAWN-2026-08-19.md`)

> **▶ Paste this into Claude Code (in your repo):**
> *"sync DAWN"* — or spelled out: *"Read `design_handoff/SYNC.md` and
> `design_handoff/CHANGES.md`, apply the listed changes, create a
> `design-sync/2026-08-25` branch, build, and open a PR. Do not merge or deploy."*
>
> The previous round's reply is archived at `design_handoff/CHANGES-2026-08-03.md`.
> **This file holds no work status.** Status lives in
> [`docs/BUILD-BACKLOG.json`](../docs/BUILD-BACKLOG.json).

This round ran in **reverse** again: production was the source of truth for every
row. DAWN applied §2 through §10 as written. **Nothing in §2–§8 needs to travel
back to the repo** — the values are now identical. What follows is what changed,
what DAWN questions back, and the answers §12 and §13 require.

Legend: ✅ applied as written · ✏️ applied with a DAWN-side authoring decision ·
⏳ question back to production · 🔴 declined, with a reason

---

## 1. The answer, first

| § | Area | Status |
|---|---|---|
| 2 | Colour corrections, 6 rows + 2 structural | ✅ `tokens/colors.css` |
| 3 | The row that must NOT be applied | ✅ **not applied.** See §3 — it was also live in `skins.css` and is now fixed the other way |
| 4 | Colour additions, 12 rows | ✅ `tokens/colors.css`, with the `on-media` comment carried |
| 5 | Midnight skin, 8 rows incl. the selector | ✅ `tokens/skins.css`, both modes |
| 6 | Radius roles | ✅ `tokens/spacing.css` + both Midnight blocks |
| 7 | The focus ring | ✅ `tokens/effects.css`, one solid ring |
| 8 | Type ladder additions | ✅ `tokens/typography.css` — four sizes, `calc(… * var(--type-scale, 1))`, no invented leadings (see §7a Q3) |
| 9 | September-1 / beta-grace copy, 12 files | ✅ swept; `housing.html` left alone as instructed |
| 9b | Funnels rename residue | ✅ `beta.jsx` + the template mirror |
| 10 | Nav-rail mirror, 5 fixes | ✅ applied, keys and glyphs confirmed against `NAV_AREAS` (see §7a Q4b) |
| 11 | `/the-community` reference frame | ✅ **delivered**, desktop + mobile |
| 12 | What users tripped on | see §12 — nothing to answer yet, and DAWN says so out loud |
| 13 | Vitals vs budget | see §13 — 2 changes, 2 questions back, 2 declines |

Reference cards regenerated: **82 cards**, **303 tokens**, compiler clean. Every
question this round opened was answered the same day; nothing is left open.

---

## 2. Tokens — applied, value for value

`tokens/colors.css`

| Token | Mode | Now |
|---|---|---|
| `--color-focus-ring` | light | `#B86A15` (was the brand amber `#E2912F`) |
| `--color-text-on-broadcast` | light + dark | `#1A1206` |
| `--color-text-subtle` | light | `#6E6558` |
| `--color-text-subtle` | dark | `#A2957D` |
| `--color-primary-strong` | light | `#965C12` |
| `--color-surface-post` | light + dark | `var(--color-surface)` |

Added: `--color-text-on-rank`, `--color-chrome-hover` (both modes),
`--color-text-on-danger` / `-warning` / `-success` (both modes),
`--color-on-media` / `-light` / `-dark`.

**One DAWN-side extension you should know about:** `.theme-light-lock` is a third
scope that re-asserts the light palette, and it carried its own copies of five of
these values. It has been corrected in step (`text-subtle`, `primary-strong`,
`focus-ring`, `surface-post`, `chrome-hover`). If production's light lock is a
class rather than a re-declaration, ignore this; if it re-declares, check it.

`tokens/skins.css` — Midnight, both modes: focus ring `#B86A15` light /
`#F0AD4E` dark, `text-subtle` `#5B6576` / `#8D9AB0`, `surface-post` aliased,
`chrome-hover` added, radii `11px` / `15px`, and the dark selector is now
`.dark[data-skin="midnight"], .dark [data-skin="midnight"]`. The invented
`data-mode` form is gone; the comment now explains why the compound selector
exists (the skin can land on `<html>` itself) so nobody "tidies" it away again.

`tokens/spacing.css` — `--radius-control: 14px`, `--radius-card: 24px`. The step
scale, pill, motion, density and every shadow were already identical; untouched.

`tokens/effects.css` — one solid ring, one token, one selector:

```css
:where(button, a, select, summary, [tabindex]:not([tabindex="-1"])):focus-visible,
:where(input, textarea):focus-visible { outline: none; box-shadow: 0 0 0 3px var(--color-focus-ring); }
```

The "calmer neutral ring on text fields" is retired from the CSS and from the
guideline cards and readme prose that taught it. The three opt-outs still stand.

`tokens/typography.css` — `--text-display-poster`, `--text-stat-md`,
`--text-stat-sm`, `--text-page-title-lg` added, each wrapped in
`calc(… * var(--type-scale, 1))`, plus `--type-scale: 1` documented as the
generation axis. No per-role leading companions: the four `--leading-*` tokens are
the whole story and already matched production.

## 3. The row that was NOT applied

`--color-text-on-primary` stays `#FFFFFF` in both modes, in `colors.css` and in
`.theme-light-lock`. And the same law was applied in the other direction where
DAWN had it wrong: Midnight dark held `#1A1206`, which is exactly the 2.46:1
rank-glyph failure the split fixed. It is now `#FFFFFF`, with the ink living in
`--color-text-on-rank`. Any older DAWN note carrying the strike row is dead; this
file is the record.

## 4. §9 — the stale claims, and what replaced them

The rule DAWN now writes to: **a gate names what opens it, never when.** No dates,
no countdowns, no "free until". Beta rates are still grandfathered, because that
is a rate promise and not a grace period.

| File | Was | Now |
|---|---|---|
| `readme.md` (product state) | "Graduation is September 1, 2026" | "billing is live, allowances count now, gates are armed now. There is no switch date to promise and no countdown to draw." |
| `readme.md` (pricing canon) | "September 1 2026 is when the free allowances start counting" | ADR-1087 row: `beta_grace` is `{"until": null}`, `featureGatesLive()` true, never write a "free until" date, Founding auto-grant ended with the window |
| `templates/app-shell/AppShell.dc.html`, `ui_kits/app/index.html` | banner: "runs through September 1. Free the whole way" | "runs all season. Your opening beta rate stays locked for as long as you keep the plan." |
| `ui_kits/screens/space-console.html` | GateNotice preview "Billing turns on September 1" | GateNotice gated "Selling memberships comes with Business" + live secondary CTA |
| `ui_kits/screens/settings.html` | GateNotice preview "Everyone has Crew, free, until September 1" + disabled CTA + "Free in beta" badge | GateNotice gated "You are on Member, and Member is not a trial", live "See Crew" CTA, badge now "Pay what you want" |
| `ui_kits/screens/event.html` | GateNotice preview "Paid passes turn on September 1" + disabled pay button | the gate is gone: a plain card and a live "Pay for a day pass". Passes charge today, so a gate there was the lie |
| `ui_kits/screens/admin-dashboard.html` | "September 1" eyebrow + "29 days of wet paint" + beta-window progress | "Counting now" + "This month, on the free tier" + allowance meters rendered from a map, `limit: null` handled as unlimited (see §7a Q5) |
| `ui_kits/marketing/pricing.html` | "Allowances start counting September 1, 2026" | "Beta rates are grandfathered for as long as you keep the plan. Every tier has a real free allowance, and your own audience is always 0%." |
| `ui_kits/marketing/pricing.html` FAQ | "What happens on September 1, 2026?" | "Is anything free only for now?" → no grace window, no cliff date, your rate changes when you change plan |
| `components/kit/GateNotice.d.ts` | gated = "a known moment (September 1 graduation)" | gated = "opens with graduation or a plan step, not on a date"; preview marked largely historical |
| `components/kit/GateNotice.prompt.md` | a preview billing example | a gated example with a live secondary CTA, and a hard rule: say what opens it, never a date |
| `ui_kits/marketing/beta.jsx` + `templates/marketing-site/site.jsx` | "the beta induction 'Oath'" | "the Funnel induction 'Oath' (ADR-1090: the feature is Funnels, the front door is /join)" |

Also: `readme.md` no longer lists `stories.html` (struck, not shipped), and
`colors.css`'s light-lock comment says Funnel induction.

One thing worth a look on your side, a consequence rather than a request:
**`preview` is now nearly dead as a kind** — DAWN has one use left in the bundle.

## 5. §10 — the rail mirror

`ui_kits/app/nav-rail.jsx` and its template mirror
`templates/app-shell/chrome.jsx` (the handoff named only the kit file; the
template carried the same list):

- `vault` icon `gem` → `vault`. The open question from 2026-08-03 is closed.
- `journal` rail row dropped, with a comment saying where Journal does live (My
  Frequency, under "You", reachable from the account dock) so the mirror stops
  contradicting `chrome-docks.card.html`.
- `connections` / "My Contacts" rail row dropped, with the reason in a comment.
- `broadcast` → `nearby`. Label and megaphone glyph unchanged.
- Admin group now reads Dashboard → Community → Leadership → Programs → Growth →
  Resonance CRM → Vera AI → Operations → Loom Studio → QR Studio → Manage Spaces
  → Market admin. Keys and glyphs were confirmed against `NAV_AREAS` after the
  fact; see §7a Q4b for the two DAWN got wrong.

## 6. §11 — the `/the-community` reference frame ✅

Two files, both cards in **Screens · Marketing**:

- `ui_kits/marketing/the-community.html` (1280×820) — the desktop frame.
  PhotoHero → the four Pillars → two ZigZag beats (a Circle, a Hub) → Marquee +
  Statement → the ladder as five numbered rungs → the interactive tour → FAQ with
  `FAQPage` JSON-LD → BetaCTA. Voice guardrails honoured: the NAMING ladder is the
  spine of the page (and "Circles never meet in Outposts" is stated twice, once in
  a beat and once in the FAQ), no em dashes, and the member price is described as
  the first rung of the ladder rather than a typed number.
- `ui_kits/marketing/the-community-mobile.html` (1400×1420) — the mobile
  reference frame, per standing rule 2. Three phones at 390px showing the real
  page at that width, not a redraw, each captioned with what moves, plus a table
  of what the breakpoint owns.

Design decisions the frame makes, so review has something to disagree with:

- **One breakpoint, 900px.** Not a ladder of three. The page is one editorial
  column plus two grids; a second breakpoint would only re-flow what is already fluid.
- **PillarNav is four buttons that stay four buttons** (4-up → 2-up), not a select
  and not a carousel. Seeing all four at once is the job: it is how a stranger
  locates themselves before any vocabulary lands.
- **ZigZag stops zigzagging on a phone.** Every beat becomes image-then-text, both
  beats the same way. Alternating a single column reads as a bug, not a rhythm.
  This is the answer to the "nobody has decided yet" half of the ask.
- **The tour's step list becomes a horizontal snap rail** above the screen, steps
  at 78% width so step two is always half visible. Tapping a step swaps the screen
  in place and scrolls nothing, so the thumb never loses its position.
- The tour's right half is built from DS components, not a screenshot, so it stays
  honest when the app moves.
- **Perf constraint honoured: one image request above the fold.** The hero is the
  only eager image; every ZigZag image is `loading="lazy" decoding="async"` with a
  fixed `aspect-ratio` box, so it cannot shift.
- The marquee is the only motion the page owns, one duplicated track, parked by
  `prefers-reduced-motion`.

Not included, deliberately: no stat strip (the social-proof floor is not met) and
no "featured Circles" carousel (the map is honest about being empty outside North
County, and the page says so in the FAQ).

## 7a. ✅ Answered same day — what changed as a result

Production answered all five on 2026-08-25, and the two follow-ups the same day.
Nothing from this round is left open. The original questions are kept below as §7
for the record.

| # | Answer received | What DAWN did |
|---|---|---|
| Q1 | **Not blocking.** `app/globals.css` already uses `color-mix()` in 39 places and has shipped that way; no `browserslist` floor and no ADR sets one, so production's real floor is already Safari 16.2+. DAWN is matching the dependency, not introducing it. | Nothing. Kept `color-mix()` throughout and dropped the build-time-resolution caveat. This closes the question that has been open since 2026-08-03. |
| Q2 | The flip is `data-media-tone` / `data-media-scrim`, and **ADR-830 is superseded**: it is per ZONE, not per hero. `PageHero` emits `data-hero-zone="lockup"` and `="actions"`; the sensor measures each zone's own box and resolves its own tone plus a legibility rung (0 nothing, 1 per-glyph halo, 2 halo + plate, 3 halo + strong plate). Server-rendered zones are unmeasured and the CSS answers with the halo and no plate. `z-index: -1` on the plate is load-bearing and test-pinned. | Documented in full on the `on-media` block in `tokens/colors.css`, including the four rungs, the unmeasured default, and the pinned z-index. The mechanism was then built — see Q2b. |
| Q3 | **Replace the nine guesses.** Production has exactly four leading tokens (`--leading-display` 0.95, `--leading-snug` 1.2, `--leading-normal` 1.5, `--leading-relaxed` 1.65) and no per-role companions; the content roles are deliberately not on `--leading-display`, and moving them is a real design change left undone on purpose. Every new size is wrapped in `calc(… * var(--type-scale, 1))`. | All nine companions deleted. DAWN's four `--leading-*` tokens already matched production exactly, so nothing was added. The four new sizes now carry the wrapper, and the comment says out loud not to invent per-step leadings. `the-community.html` was the only consumer of a companion; it now uses `--leading-snug`. |
| Q4 | `AREA_ICONS` is `components/layout/nav-icons.ts:60`, keyed by area key. The map confirms `broadcast → nearby` (ADR-1020, glyph unchanged). | Rename verified; the four new keys went a round trip, see Q4b. |
| Q5 | **There is no real number, and that is the answer.** `PLACEHOLDER_METER_LIMITS` is `@placeholder`, `PLACEHOLDER_ALLOWANCES` is true, and `withinAllowance` never hard-blocks (ADR-782, beta-soft). Free rungs supplied for preview only. | `admin-dashboard`'s meter card no longer hardcodes a limit. It renders from a map of rows and handles `limit: null` as "unlimited" with a different row shape, so a limit changing or vanishing under it is not a layout bug. Copy corrected to match beta-soft: "meters inform. A full meter is a conversation about a plan, not a locked door." |

### ✅ Both follow-ups closed the same day — and DAWN was wrong on both premises

**Q4b — the admin keys. Prefixing is correct; only two of four were wrong.** The
first paste was the top ~30 lines of `AREA_ICONS`, which carries short
member-facing keys; the operator half is prefixed. `NAV_AREAS` operator set:
`admin-community` · `admin-crm` · `admin-growth` · `admin-home` · `admin-library`
· `admin-marketplace` · `admin-operations` · `admin-programs` · `admin-qr` ·
`admin-spaces` · `admin-vera-ai`. Corrected in both mirrors:

| Was | Now | Glyph |
|---|---|---|
| `admin-community` ✅ | unchanged | `users` (was `users-round`) |
| `admin-ops` | **`admin-operations`** | `sliders-horizontal` |
| `admin-loom` | **`admin-library`** | `images` |
| `admin-market` | **`admin-marketplace`** | `store` |

`admin-library` labelled "Loom Studio" is production's own key/label divergence,
not a typo, and the mirror now carries a comment saying so. DAWN **withdraws the
`codes` / `admin-qr` flag**: they are two rows at two scopes sharing one glyph,
deliberately, and the mirror was already right. Five rows were not touched. And the
Store question is answered against DAWN's instinct: same concept at a different
scope shares a glyph and the section header carries the scope; only genuinely
different concepts split (`shop → ShoppingBag` against `market → Store`). Operator
Market is not visually distinct, and that rule is now written into the mirror as a
comment for the next person who asks.

**Q2b — `data-hero-zone` shipped; DAWN built against it this round, no separate
round needed.** Production pointed at `page-hero.tsx:156` (emits the attribute),
`hero-adaptive-text.tsx:107` (the sensor reads `[data-hero-zone]`),
`page-hero-mobile.test.tsx:117` (asserts the lockup renders) and
`globals.css:2307+` (the tone styling). Three changes:

- `ui_kits/marketing/sections.jsx` → `PageHero` now emits two zones:
  `data-hero-zone="lockup"` (eyebrow, h1, script, lead) and `="actions"` (the
  button row), inside a `.hero-adaptive-text` wrapper. Every photographic marketing
  frame inherits it, including the new `/the-community`.
- `tokens/effects.css` draws all four rungs against
  `.hero-zone[data-media-tone]` / `[data-media-scrim]`: 0 nothing, 1 per-glyph
  halo, 2 halo + blurred plate, 3 halo + strong plate. Rung 1 is the default via
  the bare `.hero-zone` selector, so an unmeasured server-rendered zone is legible
  and never flashes. The plate is `::before` with `z-index: -1`, carrying a comment
  that it is load-bearing and test-pinned so nobody raises it.
- New card `guidelines/on-media.card.html` (Foundations · Color) — the three
  tokens, a live per-zone demo on one photo where the lockup and the actions get
  different answers, all four rungs side by side on real photographs, and four laws.

⏳ **One thing for production to check:** DAWN's rungs are drawn from the
description, not from `globals.css:2307+`. The blur radius, the plate opacities
(40% / 74% ink, inverted for `tone="dark"`) and the `inset: -0.6em -1.1em` are
DAWN's numbers. If yours differ, that is a §2-style value diff for the next round
and DAWN will take yours.

## 7. ⏳ Questions back to production (as originally asked)

| # | Question |
|---|---|
| Q1 | The `color-mix()` floor is still open from last round. Every effect in `tokens/effects.css` uses it, and now the focus ring does not — so the ring is safe, but `.rank-badge`, `.glass`, every `.lift-*` and the seams still need Safari 16.2+. If the floor is lower, these must resolve to static values at build time. This is the one blocking answer DAWN needs. |
| Q2 | `--color-on-media` flips per photo by the content-aware hero (ADR-830). What carries the flip — a `data-*` attribute on the hero, a class, or an inline style? DAWN documents the alias but cannot draw the mechanism without the hook's name. |
| Q3 | §8 said "see `app/globals.css`" for the line-height companions and did not list values. DAWN authored nine. Please diff and correct; these are guesses, and they are the only guessed numbers in this round. |
| Q4 | The four new admin rail rows arrived as labels without glyphs. Confirm against `AREA_ICONS`. Also: does Market admin want the same `store` glyph the member Market row uses? |
| Q5 | The rebuilt `admin-dashboard` allowance meter needs a real number. What is the free-tier campaign-send allowance, and is there a canonical list of metered allowances DAWN should be drawing from rather than inventing? |

## 12. What users tripped on (standing rule 1)

**No moderated round has run yet**, so there is nothing to answer, and DAWN is not
treating that as a clean bill of health. Two of this round's changes are exactly
the kind that a moderated round would judge and no metric will: the gate copy (does
"this opens later, it comes with graduation or a plan step" read as honest or as
evasive?) and the tour's snap rail (do people find step two?). When recruiting
lands per `UX-MATURITY-PLAN` Lift 1b, those are DAWN's two asks for the first
protocol — put in writing here so the request survives the gap.

## 13. Vitals vs budget (standing rule 1) — DAWN's answers, row by row

The rule says every row gets a change, a reasoned decline, or a question back.

**Changes DAWN made or is committing to:**

| Row | Answer |
|---|---|
| Every measured marketing page fails LCP (`/` 3.31s, `/discover` 2.06s, `/spaces/*`, `/events/:id`) | **A change, applied to the new page and scheduled for the rest.** `/the-community` ships with exactly one eager image, everything below the fold lazy with a reserved `aspect-ratio` box. DAWN proposes next round: retrofit the same law across the other seven marketing frames and add it to the marketing-section guideline card as a rule ("one image request above the fold, per page, no exceptions"). Say if you want that pulled forward. |
| `/feed` fails all three (LCP 5.18s, INP 240ms, CLS 0.232) | **A change, offered.** The CLS number reads like unreserved post media plus a composer that grows on mount. DAWN's feed kit already boxes media, so the divergence is repo-side — but the design answer DAWN can ship is a **feed skeleton spec**: fixed row heights for post, event teaser and activity line, so the first paint is the final geometry. Want it next round? |
| `/spaces/danieltyack` CLS 0.222 + LCP 6.32s | ⏳ **A question back.** Is the hero a member-uploaded photo of unknown dimensions? If so the fix is a contract, not a treatment, and DAWN needs to know what crops the uploader guarantees before drawing anything. The `on-media` family (§4) suggests you already flip type per photo, which implies the answer is yes. |
| `/admin/menu` CLS 0.622 (4 samples, below the floor) | ⏳ **A question back, because it is a DAWN screen.** The admin rail editor is a drag list. Is the list remounting on drop rather than reordering in place? If yes, DAWN will respec the editor's row so drag state is a transform and never a layout change. |

**Reasoned declines this round:**

| Row | Why not |
|---|---|
| `/events/:id` INP 202ms, `/spaces/directory` INP 390ms | 🔴 **Declined this round.** No surface DAWN touched is implicated, and an INP answer is a main-thread question (hydration, handlers) rather than a design question. If you want a design lever, the honest one is fewer interactive nodes above the fold, and DAWN would rather see one profile before cutting anything. |
| `/discover` INP 600ms (4 samples), `/connections/:id`, `/settings`, `/market`, `/events`, the three operator consoles | 🔴 **Not addressed: below the sample floor.** Not silence — a request: flag any of these the moment they clear five samples, and DAWN will answer the row the same week. The two-consecutive-🔴 rule cannot start counting on ⏳. |

Also on the record, since this is the rule's first week: **no surface this round
redesigns has a 🔴.** `/the-community` has no samples at all, which is why the frame
was drawn to the §11 constraint rather than to a measurement.

## 14. Mobile behavior (standing rule 2)

- §2–§8 token work: **mobile unchanged**, value-for-value.
- §9 copy: **mobile unchanged**, same components, honest words. One exception worth
  naming: `event.html` lost a GateNotice block, so the aside is one card shorter on
  a phone. That is a removal, not a reflow.
- §10 rail rows: **mobile unchanged**; the phone overlay menu derives from the same
  list and loses the same two rows.
- §11: **a full mobile reference frame ships with the page**, not a description.
  See `the-community-mobile.html`.

## 15. Ratchet check (standing rule 3)

**No adoption count rises**, and one falls in the right direction. The §6 radius
adoption is now a no-op rather than a regression, `event.html` dropped a bespoke
disabled-CTA pattern in favour of a plain `Button`, and the new page introduces no
literal radius, no white or black literal, no ad-hoc progress bar and no
hand-rolled tab: PillarNav and the tour use `role="tablist"` buttons on tokens. Two
local components (`Zig`, `Marquee`) live in the page file rather than the kit —
deliberately, until a second page needs them. No allowlist entry needed.
