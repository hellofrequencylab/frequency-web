# Frequency brief 07 — The mobile grammar (for Claude Design)

> **Why this brief exists.** Every law DAWN has written so far is a desktop law. The three
> docks are explicitly desktop-only. The rails are desktop. The fact dock, the four-role
> marketing rhythm and the hero grammar were all composed at desktop widths and then left
> to fend for themselves on a phone. Mobile is not badly designed here. **Mobile has not
> been designed here** — it has been inherited, one breakpoint at a time, and it is the
> weakest surface we ship.
>
> This brief has two halves and they are strictly separated. **§1-§5 are production truth**:
> what the phone renders today, measured, with file and line references. **§6 is the ask**:
> seven questions only a design round can answer. Nothing in §1-§5 is a proposal, and
> nothing in §6 is a preference we are hiding.
>
> Sent via the `SYNC.md` contract. DAWN answers in `CHANGES.md`, with mobile reference
> frames per screen. Repo sources of truth: `components/layout/app-shell.tsx`,
> `app/globals.css`, `components/marketing/marketing-ui.tsx`.

Legend: ✅ works as intended · ⚠️ works but was never decided · 🔴 a real gap · ⏳ open question for DAWN.

---

## 1. The breakpoints, and the band nobody designed

There are no custom breakpoints. Tailwind defaults: `md` = 768px, `lg` = 1024px.

| Element | Where | Visible at | File |
|---|---|---|---|
| Bottom tab bar | fixed, bottom | **< 768px** (`md:hidden`) | `app-shell.tsx:1313` |
| Nav drawer (left overlay) | fixed, full height | **< 768px** (`md:hidden`) | `app-shell.tsx:1142` |
| Left rail (nav + account dock foot) | in flow, 12rem | **≥ 768px** (`hidden md:flex`) | `app-shell.tsx:1960` |
| Right rail (status) | in flow, 18rem | **≥ 1024px** (`hidden … lg:flex`) | `app-shell.tsx:2024` |
| Vault dock (score) | fixed, bottom right | **≥ 1024px** — it is mounted inside the right-rail column | `app-shell.tsx:2086` |
| Game counts for small screens | drawer foot cluster | **< 768px** | `app-shell.tsx:1219` |

🔴 **The 768-1023px band has no home for the member's score.** The drawer that holds the
game counts is `md:hidden`, and the Vault dock needs `lg`. On an iPad in portrait (768pt),
on a Surface, on a large phone in landscape, a member's Zaps, Gems and streak exist
nowhere on screen. This is not a design decision that went wrong; it is two decisions
made in different rounds that were never checked against each other.

⚠️ **DAWN's stated law and the code disagree by 232px.** `CHANGES.md` (2026-08-03) says
"under 1000px the menu overlays instead of squeezing." Production overlays under **768px**.
Between 768 and 1000 the rail is present and squeezing. One of the two numbers is wrong and
we would like DAWN to name which.

## 2. What the bottom edge holds today

Everything fixed to the bottom of a phone screen, measured:

| Layer | Geometry | z | File |
|---|---|---|---|
| Bottom tab bar | `height: calc(3.5rem + env(safe-area-inset-bottom))`, `bg-surface/95`, `backdrop-blur-sm`, top hairline | 40 | `app-shell.tsx:1313` |
| The raised Zap action | 48px disc inside a 56px surface catch, translated **-18px / -22px**, so it breaks ~22px above the bar's top edge into the content column | 40 | `app-shell.tsx:1341` |
| Chat edge pill | `fixed bottom-20 right-0`, `h-11`, **28px wide** collapsed on mobile, a half-pill against the right edge | 40 | `edge-pill.tsx:107` |
| Achievement toast | `bottom-20 right-4` | 50 | `achievement-toast.tsx:116` |
| Zap toast | 🔴 `bottom-4 right-4` on mobile | 50 | `zap-toast.tsx:58` |
| Content column bottom pad | `pb-[calc(3.5rem + env(safe-area-inset-bottom))]` | — | `app-shell.tsx:1935` |

**The tab bar itself:** seven equal `flex-1` slots on one row. Menu · two spine worlds ·
Zap · three spine worlds. At 390px that is **55.7px per slot**, 22px icon, `text-3xs`
label, active shown by color only (never a heavier stroke). Slots gate-filter through the
one nav resolver, so a visitor sees fewer than seven and the remaining slots widen.

🔴 **The two toasts disagree.** `achievement-toast` clears the tab bar at `bottom-20`;
`zap-toast` sits at `bottom-4`, which is 16px from the bottom edge — inside the 56px tab
bar, on top of it. The bottom-right stacking contract is written down, carefully, in
`components/sidebar/game-stats-dock.tsx` — and it is a **desktop** contract. There is no
mobile equivalent, which is why one of two toasts landed in the wrong place and nothing
caught it.

⚠️ **The raised Zap has no thumb-zone rule.** It breaks 22px above the bar into whatever
content is scrolling underneath. On a feed that is a post; on a form that could be a
submit button. It was placed by eye.

## 3. The drawer, and where "you and yours" went

The three-docks law puts *you and what you run* at the rail's **foot** (`ProfileCard`,
`sticky bottom-0`, `app-shell.tsx:1975`). Below 768px there is no rail, and the law's three
parts were distributed by hand:

| Docks-law region | Desktop home | Mobile home today |
|---|---|---|
| **System** (region, security, billing, appearance, export, sign out) | top-right account menu | ✅ top-right account avatar, unchanged |
| **You and what you run** | rail foot | ⚠️ **split**: identity card at the drawer's **head**, operated things inside the nav list, About/legal near the foot |
| **The Vault** (score) | fixed bottom right, lg+ | ⚠️ drawer **foot** cluster, capped `max-h-[40dvh]`, internally scrollable |

So the drawer inverts the law: identity is at the top (furthest from the thumb) and the
score is at the bottom (nearest). The drawer's own close button sits at the foot, in the
thumb zone, with the header carrying only the wordmark — which is the correct instinct and
the opposite of the marketing overlay menu, whose close is at the top (`marketing-mobile-menu.tsx:75`,
per DAWN's stated exception for overlays).

Neither placement is wrong. Neither was decided.

## 4. Safe areas — the one part that is fully handled ✅

The app runs `viewport-fit=cover` with a black-translucent status bar, so the webview
extends under the notch. Handled consistently:

| Edge | Treatment |
|---|---|
| Bottom | Tab bar grows by `env(safe-area-inset-bottom)` and pads by it; the content column pads by bar + inset; the drawer foot uses `pb-[max(0.75rem, env(...))]`. |
| Top | Each fixed bar sets `height: calc(Xrem + env(safe-area-inset-top))` and pads by the inset (app top bar 3.5rem, marketing header 4rem). |
| Sides | `.px-safe` on the shell body, for a landscape side-notch. |

Nothing needed here. It is listed so DAWN does not redesign around a problem we do not have.

## 5. The marketing rhythm on a 390px viewport, measured

The four-role vertical rhythm (`.mk-band` / `.mk-beat` / `.mk-cont` / `.mk-tight`) is
driven by three `clamp()` tokens. **At 390px every one of them is pinned to its floor** —
the `vw` term never reaches the minimum, so mobile does not get a designed value, it gets
whatever the desktop clamp happened to bottom out at.

| Token | Formula | **390px** | 1440px | Δ |
|---|---|---|---|---|
| `--space-section-loose` (`.mk-band`) | `clamp(5rem, 9.5vw, 7rem)` | **80px** | 112px | -29% |
| `--space-section` (`.mk-beat`) | `clamp(4.25rem, 8vw, 5.5rem)` | **68px** | 88px | -23% |
| `--space-section-tight` (`.mk-tight`) | `clamp(3rem, 5.5vw, 3.75rem)` | **48px** | 60px | -20% |
| adjacency correction (a section followed by another) | `--space-section × 0.62` | **42px** | 55px | — |
| gutter (`padding-inline`) | fixed `1.5rem` | **24px** | 24px | **0%** |

The consequence, stated plainly: on desktop the loudest role and the quietest are **52px**
apart. On a phone they are **32px** apart, and the four roles resolve to 80 / 68 / 48 / 0.
Two of them are 12px apart. **The rhythm is still there in the CSS and mostly gone from the
screen.** And the gutter does not compress at all: 24px each side of a 390px screen is
12.3% of the width, leaving 342px of content, which is the same absolute gutter a 1440px
page gets.

DAWN's own note from the 2026-08-03 round measured the About page's desktop gaps at
147/134/83/145/83/134px. Nobody has measured the phone.

**The hero fact dock** (`marketing-ui.tsx:119`): a `glass-ink lift-3` panel, absolutely
positioned `-bottom-8` (32px below the hero's edge), `max-w-[calc(100vw-2rem)]`,
`flex-wrap`, `gap-6`, `px-6 py-4`. Three facts do not fit on one 358px row, so it **wraps**.

⚠️ Because the panel is anchored by its **bottom** edge, wrapping grows it **upward**, into
the hero's own `pb-36` (144px) and toward the subtitle. Meanwhile the clearance rule
`.mk-hero-dock + *` adds a constant `calc(--space-section/2 + 3rem)` = **82px** at 390px,
computed for a one-row dock. So the section below always clears correctly and the hero
above quietly absorbs the growth. Nothing breaks. Nothing was decided either.

**The hero title** is `text-[clamp(2.25rem, 8vw, 4.5rem)]` — pinned to its 36px floor at
390px, same pattern as the rhythm.

## 6. The ask — seven questions only a design round can answer

Ordered by how much depends on the answer.

### Q1. What does the bottom edge *mean* on a phone?

Desktop has a bottom-right stacking contract with named slots. Mobile has a tab bar, a
raised action that breaks its own top edge, an edge pill, and two toasts that disagree with
each other. **We need the mobile equivalent of the stacking contract**: named slots, from
the safe-area edge upward, with a rule for what a new fixed element must do. Specifically:
does a member's score (the Vault) get a home at the bottom edge on a phone at all, or is
the tab bar the sole owner of that edge and the score lives inside the drawer forever?

### Q2. Where does the score live between 768 and 1023px?

The 🔴 in §1. Options we can see: the drawer opens at that width too; the Vault dock drops
to `md`; the left rail's foot grows a compact score block; or the band is declared a
tablet-desktop and gets the full desktop shell earlier. This is one decision that closes a
real hole, and we would rather have DAWN's answer than pick the cheapest one.

### Q3. Is DAWN's 1000px overlay law the number, or is 768px?

Name it, and we will move the code to match. If it is 1000px, the left rail disappears
between 768 and 1000 and Q2 gets easier. If it is 768px, the law text needs correcting.

### Q4. Do the four marketing roles survive at 390px, and at what measured gaps?

Not "scaled from desktop" — **measured for a phone**, the way the 2026-08-03 round measured
About at desktop. Three sub-questions:

- Are four roles still four roles when the spread is 32px, or does mobile want three?
- What is the phone value for each of `.mk-band` / `.mk-beat` / `.mk-tight`, and does the
  adjacency correction (`× 0.62`) still hold at that scale?
- Does the 24px gutter compress, hold, or grow relative to the type? It is currently the
  only spacing value in the entire marketing system that ignores viewport.

### Q5. Hero fact docks: stack, or collapse to a strip?

Today they wrap into 2+1 and grow upward into the hero. The three candidates we can name:
**stack** (one fact per row, dock gets tall, hero pads more), **strip** (one horizontal row,
smaller numerals, possibly scrollable), or **truncate** (show two facts on a phone, third
only from `sm`). Whichever DAWN picks, the clearance rule needs a matching mobile value —
`calc(--space-section/2 + 3rem)` was computed for a single row.

### Q6. Thumb-zone rules for the docks and the raised action.

The raised Zap breaks 22px into the scrolling content. The edge pill is a 28px sliver at
`bottom-20`. Neither has a stated rule. We are asking for: the reachable band on a 390×844
screen, the minimum target size, the minimum gap between two fixed controls, and an explicit
statement about what content is allowed to pass beneath a floating control.

### Q7. Where does "you and yours" go when there is no rail?

The law puts it at the rail's foot. The drawer currently puts identity at its **head** and
score at its **foot**. Should the drawer read foot-first — identity, standing, the things
you run, all clustered in the thumb zone — with the wordmark head reduced to chrome? And
does the drawer's foot-mounted close stay the exception to DAWN's "overlay dismisses from
the top" rule, given that the drawer is the one overlay a member opens dozens of times a
day?

## 7. What we will do with the answers

| DAWN returns | We do |
|---|---|
| Mobile reference frames per screen | The Lift 4c implementation wave: the shell plus the five highest-traffic screens, same restraint rules as the docks pass. |
| A mobile stacking contract (Q1) | Written into `game-stats-dock.tsx`'s contract comment beside the desktop one, and the zap-toast position fixed against it. |
| Measured rhythm values (Q4) | New floors on the three `--space-section-*` clamps in `app/globals.css`, one file. |
| A fact-dock rule (Q5) | `marketing-ui.tsx` plus the matching `.mk-hero-dock + *` mobile clearance. |
| An answer to Q2/Q3 | Two breakpoint edits in `app-shell.tsx`. |

Mobile visual baselines are being locked **before** any of this lands (Lift 4b), so DAWN's
grammar arrives as reviewable diffs rather than as vibes.

---

*Companions: brief 05 (design direction), brief 06 (system overview), `SYNC.md` (the
two-way contract this is sent under). Every value in §1-§5 was read from the files cited,
2026-08-04.*
