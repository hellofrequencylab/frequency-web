# Resonance — Design Spec

> The canonical design system for Resonance. Read this before building or editing any
> surface. Pairs with `ARCHITECTURE.md` (how it is built) and `BUILD-PLAN.md` (what is
> built). Copy in this doc follows the voice rule: plain, present tense, no em dashes.

Status legend: ✅ adopted · 🔨 in progress · ⬜ planned

---

## 0. Zoom out: what we are designing

Resonance is a **standalone, embeddable hangout world**. People drop in to listen
together, take the decks, watch a video as a crowd, walk a room, play a quick game, throw
a few Zaps, and leave feeling like they were somewhere with other people. It is a *place*,
not a feed.

That single idea sets the whole design brief:

| The product is... | So the design must... |
|---|---|
| A place you arrive at | Feel like a venue at night: dim, warm, alive. Not a dashboard. |
| Social and live | Make other people the main UI. Presence, motion, and reactions come first. |
| Low pressure | Let you lurk. Never gate the room behind a form. One clear next action. |
| Embeddable + white-label | Theme from a few tokens. A host swaps an accent and a name, not a stylesheet. |
| Built to lift out | Own its entire design system. Zero dependency on Frequency's UI kit. |

**Design north star:** *a room should feel occupied within one second of arriving.* Every
decision below serves density, presence, and warmth over chrome.

### Design principles (the tie-breakers)

1. **People over panels.** Avatars, presence, and live state are the content. Controls
   recede until needed.
2. **Dark, warm, and deep.** Dark-first because rooms are lit by the stage, not the walls.
   Warm so it reads as a hangout, not a control room.
3. **One obvious move.** Every screen has a single primary action. Lurkers can always do
   nothing and still belong.
4. **Calm motion with meaning.** Motion shows what changed (someone arrived, a track
   advanced, Zaps landed). Never decoration.
5. **Accessible by construction.** Contrast, focus, hit-size, and reduced-motion are token
   defaults, not a later audit.
6. **Themeable to the core.** Every venue and every host tenant re-skins from tokens. The
   base palette is one theme among many.

---

## 1. Audience and emotional target

- **Who:** people who want company while they do a light thing (music, a watch-along, a
  hang). Skews social, casual, evening. Mobile-heavy.
- **Feel on entry:** "oh, people are here." Curiosity, low stakes, a pull to stay.
- **Feel while in:** held, not overwhelmed. You can watch, or step up, on your terms.
- **Anti-feel:** an empty SaaS table. A wall of settings. A form before the fun.

---

## 2. Art direction

**Late-night venue, lit from the stage.** Deep near-black base with a faint violet cast,
surfaces that glow rather than cast hard shadows, one electric accent that behaves like
neon, and avatars/cosmetics providing the color. Think a good small club: dark room, bright
people.

- **Light model:** content sits *above* the dark like lit objects. Elevation reads as a
  lighter surface plus a soft glow, not a drop shadow.
- **Signature move:** the **Pulse** — the brand violet used sparingly for the live/now
  state (now playing, you are on, Zaps in flight). It is the one thing that ever glows.
- **Restraint:** one accent per context. Color earns attention; most of the UI is neutral.

---

## 3. Color system

### 3.1 Why OKLCH

The whole palette is authored in **OKLCH** (perceptual lightness/chroma/hue). Equal number
steps look like equal visual steps, so ramps, dark mode, hover states, and per-venue
re-hues stay consistent without hand-tuning. It is native CSS, and Tailwind v4 (already in
this repo) uses it, so tokens compile straight through with no preprocessing.
(See sources in the PR notes: Evil Martians OKLCH, W3C DTCG.)

### 3.2 Neutrals (dark-first), violet-tinted gray, hue 285

| Token | OKLCH | Use |
|---|---|---|
| `--ink-base` | `oklch(0.15 0.010 285)` | App background (the room) |
| `--ink-surface` | `oklch(0.19 0.012 285)` | Cards, rails, the stage frame |
| `--ink-raised` | `oklch(0.23 0.014 285)` | Raised surface, popovers |
| `--ink-hover` | `oklch(0.28 0.016 285)` | Hover/active fill |
| `--line` | `oklch(0.34 0.016 285)` | Borders, dividers |
| `--text-mute` | `oklch(0.64 0.015 285)` | Tertiary text, meta |
| `--text-soft` | `oklch(0.80 0.012 285)` | Secondary text |
| `--text` | `oklch(0.96 0.008 285)` | Primary text |

### 3.3 Accents (semantic intent)

| Token | OKLCH | Meaning |
|---|---|---|
| `--pulse` | `oklch(0.66 0.20 300)` | Primary. Live / now / you. The only glow. |
| `--pulse-strong` | `oklch(0.72 0.20 300)` | Hover/active primary |
| `--signal` | `oklch(0.80 0.17 150)` | Live presence, "N here", success |
| `--spark` | `oklch(0.83 0.14 85)` | Zaps, currency, rewards |
| `--alert` | `oklch(0.64 0.20 25)` | Destructive, errors |
| `--cool` | `oklch(0.75 0.13 220)` | Info, links, calm accents |

On-accent text is `--ink-base` (dark) for `--signal`/`--spark` (light accents) and
`--text` (light) on `--pulse`. All pairings are validated in §8.

### 3.4 Per-venue and per-tenant theming

A venue or host tenant supplies **one hue** (`--venue-h`, default 300). Derived accents
recompute from it in OKLCH, so a Synthwave room glows magenta and a Forest room glows green
with identical contrast. This reuses the existing `venues.theme` field and the avatar color
palette from §9.

```css
--venue-accent: oklch(0.66 0.20 var(--venue-h));
```

### 3.5 Light mode (⬜ later)

Authored as a token swap (lightness inversion, hue/chroma preserved), not a second
stylesheet. Dark ships first because it is the product's natural state.

---

## 4. Typography

- **Display / brand:** `Space Grotesk` (geometric, a little character) for headings, room
  names, big moments.
- **UI / body:** `Inter` for everything functional, with a `system-ui` fallback stack.
- **Mono:** `ui-monospace, "JetBrains Mono"` for ids, codes, technical readouts.

**Type scale** (1.20 ratio, rem):

| Token | Size / line | Use |
|---|---|---|
| `--text-2xs` | 11 / 16 | Micro labels, counts |
| `--text-xs` | 12 / 18 | Meta, captions |
| `--text-sm` | 14 / 20 | Secondary body, controls |
| `--text-base` | 16 / 24 | Body (never below this for reading) |
| `--text-lg` | 18 / 26 | Lead, card titles |
| `--text-xl` | 22 / 28 | Section headers |
| `--text-2xl` | 28 / 34 | Page titles |
| `--text-3xl` | 36 / 42 | Hero / room marquee |

Weights: 400 body, 500 controls, 600 headings, 700 brand marquee. Tracking tightens
slightly on display sizes.

---

## 5. Space, radius, depth

- **Spacing** (4px base): `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`. Tokens `--space-1..8`.
- **Radius:** `--r-sm 8` (controls), `--r-md 12` (cards), `--r-lg 16` (modals/stage),
  `--r-pill 999` (chips, avatars, buttons-on-rail).
- **Depth (dark elevation):** surfaces step up in lightness; shadows are soft and cool, and
  the live state adds a colored glow.

| Token | Value | Use |
|---|---|---|
| `--shadow-soft` | `0 1px 2px oklch(0 0 0 / .4), 0 8px 24px oklch(0 0 0 / .35)` | Cards, popovers |
| `--glow-pulse` | `0 0 0 1px oklch(0.66 0.20 300 / .5), 0 0 24px oklch(0.66 0.20 300 / .35)` | Live/now state |
| `--glow-signal` | `0 0 16px oklch(0.80 0.17 150 / .30)` | Presence pings, success |

---

## 6. Motion

Purposeful, fast, and reduced-motion-aware (per 2025 guidance: 100-200ms micro, 200-500ms
transitions, ease-out, always honour `prefers-reduced-motion`).

| Token | Value | Use |
|---|---|---|
| `--dur-instant` | 80ms | Press, toggle |
| `--dur-fast` | 140ms | Hover, focus, chip in/out |
| `--dur-base` | 220ms | Enter/leave, panel, tab |
| `--dur-slow` | 360ms | Room transitions, reveals |
| `--ease-out` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Default |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Playful (emotes, Zaps) |

**Signature motions:** avatar **arrive** (fade + 6px rise + soft glow), **emote float** (up
72px, fade, spring), **Zaps land** (spark count ticks + brief glow), **now-playing pulse**
(slow 2.5s breathing ring on the active track). All collapse to a simple opacity fade under
`prefers-reduced-motion: reduce`.

---

## 7. Iconography and imagery

- **Icons:** one line set (1.5px stroke, rounded joins), 20/24px. Lucide-style. No filled
  duotone mixing.
- **Avatars:** the existing emoji + color disc is the base identity unit. Cosmetics
  (frames, colors, badges) layer on it; it scales from a 16px presence dot to a 96px
  profile.
- **Empty/loading:** every list has a designed empty state (a line of copy + the one action)
  and a skeleton, never a bare spinner or blank.

---

## 8. Accessibility (token defaults, not an audit)

Target **WCAG 2.2 AA for compliance, APCA for what actually reads** in a dark UI (the 4.5:1
ratio is unreliable near-black; APCA models perceived lightness contrast). 2025 guidance:
body Lc 60-75, microcopy Lc 75-90.

| Surface | Standard | Target |
|---|---|---|
| Body text (16px) on `--ink-*` | APCA | Lc ≥ 65 |
| Secondary/meta text | APCA | Lc ≥ 60 |
| Microcopy (12-14px) | APCA | Lc ≥ 75 |
| UI borders / icons | APCA | Lc ≥ 45 |
| Any text pairing | WCAG 2.2 | ≥ AA (4.5 / 3.0) as a floor |

Plus, as defaults baked into the kit:
- **Focus:** a visible `--pulse` focus ring on every interactive element (`:focus-visible`).
- **Hit size:** 44x44px minimum touch target.
- **Never color alone:** live/quiet, success/error always pair an icon or label with the hue.
- **Motion:** `prefers-reduced-motion` honoured globally.
- **Semantics:** real landmarks, labels, and roles; the room is navigable by keyboard.

---

## 9. Token architecture

Three tiers (the 2025 W3C DTCG consensus): invest the most in the **semantic** layer so
theming, dark mode, and white-label become token swaps, not rewrites.

```
primitive   --violet-500, --gray-900, --space-4        (raw, never used in components)
   |
semantic    --pulse, --ink-surface, --text, --r-md     (intent; what components consume)
   |
component   --btn-bg, --card-bg, --chip-fg             (only when a component needs an override)
```

**Implementation:** authored as a **Tailwind v4 `@theme` layer** (OKLCH native) in a single
`app/theme.css`, exposed as CSS custom properties. One source of truth, no Style Dictionary
build step needed at this size. Components read semantic tokens only. A future export to the
W3C DTCG JSON format stays open if we want Figma sync.

**Isolation:** the entire system lives under `resonance/` and depends on nothing from
Frequency's `PAGE-FRAMEWORK` or component kit. Lift-out stays clean (ADR-001/ISOLATION).

---

## 10. Component kit (the primitives)

Built once, composed everywhere. No surface hand-rolls a layout.

**Foundations:** `Button` (primary/ghost/quiet/danger), `IconButton`, `Field` (input,
select, textarea with label + error), `Card`, `Tabs`, `Modal`/`Sheet` (mobile sheet),
`Toast`, `Tooltip`, `Skeleton`, `EmptyState`, `Badge`, `Pill`.

**Resonance-specific:**

| Component | Role |
|---|---|
| `Avatar` / `AvatarStack` | Identity disc + cosmetics; stack for rosters |
| `PresenceChip` | A person: avatar + name + live dot |
| `RoomCard` | Lobby tile: name, theme, type, live headcount, one action |
| `StagePlayer` | The synced video + now-playing pulse |
| `DeckStrip` | Seats / DJ rotation row |
| `ChatRail` | Messages + emote bar + composer |
| `EmoteLayer` | Floating reactions overlay |
| `ZapButton` / `ZapCounter` | Spend + the spark animation |
| `LiveBadge` | "N here" / "live" status, icon + hue |
| `NowBar` | Persistent mini now-playing across surfaces |

---

## 11. Page framework

One **App Shell** (top bar + content + optional context rail + persistent `NowBar`), five
templates picked by *what the content is*:

| Template | For | Examples |
|---|---|---|
| **Stage** | One live room | Room, Watch, Lounge, Game |
| **Canvas** | A spatial 2D surface | Walk-the-room (spatial) |
| **Index** | A browsable collection | Lobby, Market |
| **Stream** | A flow of items | Discover, Events |
| **Focus** | A centered, no-rail task | Profile/avatar, settings, account, create |

Navigation: a slim top bar (brand → lobby, Discover, Events, Zaps balance, avatar menu),
a persistent `NowBar` so you never lose the room you are in, and on mobile a bottom tab
bar (Lobby · Discover · [center: your room] · Events · You).

---

## 12. Responsive and mobile

Mobile-first; the room must be one-thumb usable. Patterns: bottom tab bar, chat and decks
as a bottom sheet over the stage, emote bar within thumb reach, 44px targets, safe-area
insets. The desktop layout adds the context rail (roster/chat) beside the stage.

---

## 13. Rollout plan (replaces the `/dev` scaffolding)

The current surfaces are inline-style dev scaffolding. We re-skin in priority order, screen
by screen, behind the same routes, so nothing breaks.

| Step | Scope | Output |
|---|---|---|
| **A. Foundation** 🔨 | `app/theme.css` (OKLCH `@theme`), fonts, reset, focus, reduced-motion, a `<DesignProvider>` | Tokens live |
| **B. Primitives** ⬜ | The §10 foundations + `Avatar`, `PresenceChip`, `Button`, `Card`, `Field`, `EmptyState`, `Skeleton` | Component kit |
| **C. Shell** ⬜ | App Shell, top bar, `NowBar`, mobile tab bar | Navigation |
| **D. Core screens** ⬜ | Home → Lobby → Room (StagePlayer + DeckStrip + ChatRail + EmoteLayer) | The product's spine |
| **E. Breadth** ⬜ | Spatial (Canvas), Discover, Events, Market, Profile, Moderation, Account | Full coverage |
| **F. Polish** ⬜ | Motion pass, APCA audit, responsive QA, per-venue theming, optional light mode | Ship-quality |

Each step is shippable, verified (tsc/eslint/test/build), and gated like every other section
in `BUILD-PLAN.md`. A `/dev/style` gallery page renders every component and token for review.

---

## 14. Definition of done (per screen)

- Composes the kit; no hand-rolled layout, no hardcoded hex, semantic tokens only.
- Designed empty, loading (skeleton), and error states.
- Keyboard reachable, visible focus, 44px targets, labels/roles present.
- APCA targets met (§8); reduced-motion path verified.
- Reads on a phone first.
- Copy passes the voice rule (plain, present tense, no em dashes, magic in proper nouns).
