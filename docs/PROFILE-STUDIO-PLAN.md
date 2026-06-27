# Profile Studio — the expressive-profile plan

**Status:** Proposed (2026-06-27). A research-backed plan, not yet built. One framework that
lets a member shape their profile — from a calm, on-brand default to a fully expressive "studio"
mode — earns cosmetics through practice (not payment), gives each member a living streak
companion, and a shareable personal page. Built almost entirely on rails Frequency already has.

> **The one-line answer.** Make the profile a place you *tend*, not a form you fill in. Expression
> is **earned through showing up**, **constrained by good defaults**, and **never pay-to-win or
> randomized-for-money**. Three surfaces (the in-app profile, the streak companion, the shareable
> page) all read one theme, so customizing once themes everything.

---

## 1. What the owner asked for

| # | The vision | The shape it takes here |
|---|---|---|
| 1 | An editable, configurable profile mode "like Discord Nitro or old MySpace", aimed at younger members | **Profile Studio** — a mode framework: `Calm` (everyone, constrained) → `Studio` (opt-in, expressive) |
| 2 | Gamification: earn skins, icons, frames, limited images with gems | **Earned cosmetics** on the existing gem + store rails; deterministic, account-bound, never randomized-for-cash |
| 3 | A tamagotchi creature tied to your streak, lives on the page, reacts to the mouse | **Ember** — a gentle streak companion that grows with your streak and never dies (Finch model, not Tamagotchi-punishing) |
| 4 | Your own shareable web page (linktree / strawpage), themed by your profile | **Signal page** — a public `/@handle` card-grid that inherits your Studio theme |

The thread tying all four together: **one theme, read everywhere.** A member earns a frame and a
palette, and it shows on their in-app profile, around Ember, and on their Signal page at once.

---

## 2. What we already have (reuse, don't rebuild)

The platform is unusually well-positioned. The plan leans on these existing rails:

| Capability | Where it lives | What it gives us free |
|---|---|---|
| **Gem economy** | `gem_transactions`, `gem_config`, `redeem_store_item_atomic` RPC, spendable balance, `lifetime_gems` | The currency + atomic spend, already audited (no-double-charge, service-writes) |
| **Store + categories** | `store_items` / `store_redemptions`, categories `cosmetic / title / collectible / membership / feature` | A redemption surface + ownership ledger; cosmetics already apply on redeem |
| **Profile cosmetics** | `profiles.profile_border`, `profile_flair`, `custom_title`, `profile_theme` (column exists, **not UI-wired**) | The "equipped cosmetic" columns already exist; `profile_theme` is the un-wired hook for Studio |
| **Data-driven theming** | `themes` table (skin/occasion kinds, validated token overrides), `data-skin`, `lib/theme/skins.ts` | Operator-editable palettes as DATA, with an allowlist validator and fail-safe reader |
| **Streaks** | `profiles.meta.practiceStreak`, `current_streak`, freeze tokens (cap 2), milestones 3/7/14/30/60/100/365 | Ember's entire growth ladder is already computed — Ember is a *view* of the streak, not new state |
| **Profile surfaces** | `people/[handle]` DetailTemplate, `profile-avatar/cover/frequency-signature`, vCard, header image, personas | The profile is already a composed page; Studio adds slots, not a new page |
| **Page framework** | `@/components/templates`, `lib/layout/page-chrome.ts` | The Signal page is a Focus-template page + one chrome registration |

**Implication:** most of this is *wiring and design*, not new infrastructure. The gem spend, the
ownership ledger, the theme renderer, and the streak ladder all exist.

---

## 3. What the research says (and the guardrails it forces)

Eleven research briefs (cosmetic economies, Discord/MySpace/SpaceHey, virtual-pet wellness apps,
link-in-bio design, and the regulatory landscape) converge on a small set of hard rules. These are
not style preferences — several are legal exposure.

### 3.1 The regulatory floor (non-negotiable)

> Frequency targets younger members. That makes the **children's-privacy and loot-box regimes
> directly applicable**, not theoretical.

| Rule | Why | Source signal |
|---|---|---|
| **No randomized rewards bought with money.** No loot boxes, gacha, or paid "mystery" pulls | Regulators are actively fining this | FTC v. HoYoverse ($20M, 2025), Epic/Fortnite ($245M), UK Children's Code, EU Digital Fairness Act |
| **Cosmetics only — never pay-to-win** | Paid advantage in a wellness community is both off-brand and a dark-pattern risk | Cosmetic-economy best practice (Fortnite/LoL post-2018) |
| **Deterministic, transparently priced, account-bound** | You always know exactly what a gem buys; cosmetics can't be traded or cashed out | COPPA 2025, EU DSA |
| **Expression off by default; high-privacy defaults for minors** | A minor's profile should be calm and private until *they* turn things on | UK Children's Code "high privacy by default" |
| **No public vanity metrics** | No public follower counts / leaderboards that pressure minors | Children's Code, Finch's deliberate omission |
| **No FOMO countdown timers on purchases** | Artificial scarcity aimed at minors is a flagged dark pattern | EU Digital Fairness Act draft |

**The safe monetization shape:** gems are **earned by practice**, optionally **topped up at a flat,
transparent price** (never randomized), and only ever buy **cosmetics**. "Limited" items rotate by
*availability window for everyone equally*, announced, with **no per-user countdown pressure**.

### 3.2 The product lessons

- **Discord's two layers.** Nitro = a capability tier (you *can* customize more); the Shop = à-la-carte
  cosmetics earned/bought separately. Maps cleanly to **Crew (the capability to enter Studio mode)**
  + **earned cosmetics (the items)**. Keep them orthogonal.
- **MySpace / SpaceHey revival** (SpaceHey ~1.9M users). The appetite for deep customization is real
  and current. But SpaceHey **blocks JavaScript** and sandboxes CSS — *expression without letting
  users run code*. Our Studio mode must be **token-driven, not free HTML/CSS**: pick from a
  governed palette/parts kit, never inject markup. (Linear's 3-variable themes, Memoji's parts kit,
  design tokens — "constrained but expressive" beats "blank canvas".)
- **Finch is the gold standard for a wellness pet.** It is *gentle*: the creature **never dies**,
  there's **no permadeath**, missing a day doesn't punish you, and streaks can be repaired. This is
  the opposite of classic Tamagotchi guilt. Ember follows Finch, not Tamagotchi — a companion that
  celebrates, never scolds. (We already have **freeze tokens** — the streak-repair mechanic is built.)
- **Two-currency caution.** Many games split "earned soft currency" from "paid hard currency"
  (Energy vs Rainbow Stones). We **already have one well-audited currency (gems)**. Recommendation:
  **stay single-currency**; gate cosmetics by *earn-able* gem prices, and if a top-up exists keep it
  flat-priced into the same gem balance. A second currency adds dark-pattern surface for little gain.
- **Generous free earn, no grind walls.** The best cosmetic economies make the *base* layer feel
  great for free and sell *flair*, not function. Our streak/zap loop already mints gems.
- **Bento link-in-bio.** The modern shareable page is a **bento card grid** (Bento.me / modern
  Linktree), not a list of buttons. The Signal page should be a themed card grid.

---

## 4. The framework: one theme, three surfaces, two modes

```
                         ┌─────────────────────────────┐
                         │   profiles.profile_theme    │  ← one equipped theme + cosmetics
                         │  (palette · frame · flair)  │     (the un-wired column, now wired)
                         └──────────────┬──────────────┘
                                        │ read by all three
              ┌─────────────────────────┼─────────────────────────┐
              ▼                         ▼                         ▼
    ┌──────────────────┐     ┌────────────────────┐     ┌────────────────────┐
    │  In-app profile  │     │   Ember companion  │     │   Signal page      │
    │  people/[handle] │     │  (streak creature) │     │   /@handle (public)│
    └──────────────────┘     └────────────────────┘     └────────────────────┘
```

### 4.1 Two modes (the Discord-Nitro split, done safely)

| Mode | Who | What they can change | Default |
|---|---|---|---|
| **Calm** | Everyone, incl. all minors at signup | Avatar, cover, bio, a small set of **earned** palettes + frames. On-brand, legible, safe | **On by default** |
| **Studio** | Opt-in (and a **Crew capability**, mirroring Nitro) | The full earned palette/frame/flair/sticker kit, the bento Signal page layout, Ember accessories | **Off until opted in** |

Both modes are **token-driven** — Studio is *more parts*, never *raw HTML/CSS*. A member in Studio
still can't break legibility or run code; they compose from a governed kit. This is the SpaceHey
lesson applied: deep expression, zero script injection.

### 4.2 The cosmetic catalog (all earned, all deterministic)

Extends the existing `store_items` categories. Every item is account-bound and flat-priced.

| Cosmetic | Stored on | Earned via | Notes |
|---|---|---|---|
| **Palette** (skin) | `profile_theme` → a `themes` row (kind `skin`) | gems | Reuses the validated token-override renderer; no new client JS |
| **Frame** (avatar ring) | `profile_border` (exists) | gems / milestone | Already applies on redeem |
| **Flair** (small badge) | `profile_flair` (exists) | gems / milestone | Already applies on redeem |
| **Title** | `custom_title` (exists) | gems | Voice-canon validated |
| **Sticker / limited image** | new `profile_stickers` (jsonb on profile) | gems, **availability-window rotation** | "Limited" = available-to-all-for-a-window, **no per-user timer** |
| **Ember accessory** | new `meta.ember.cosmetics` | streak milestones + gems | Hat/scarf/glow tied to the companion |

**Earn-first principle:** every cosmetic has a **gem price reachable by practice**. Milestone drops
(streak 7/30/100) hand out cosmetics *free* so the base loop feels generous. Top-ups (if any) are
flat-priced into the same gem balance — **never a randomized pull.**

### 4.3 Ember — the streak companion (Finch model)

Ember is a **pure view of streak state we already track** (`current_streak`, milestones, freeze
tokens). It is not new persistent state beyond cosmetics.

- **Grows with the streak.** Egg (0) → sprout (3) → fledgling (7) → … → radiant (365). Each milestone
  the streak ladder already defines is an Ember stage.
- **Never dies, never scolds.** Miss a day and Ember rests, doesn't perish. A **freeze token**
  (already capped at 2) is "Ember kept your flame". Repair, don't punish. This is the Finch
  guardrail — and the only safe shape for a wellness audience.
- **Lives on the page, reacts to the mouse.** A small canvas/SVG sprite that tracks the cursor with
  an eased follow and idle animation. **Respects `prefers-reduced-motion`** (static when set) and is
  CSS/RAF only — no heavy engine.
- **Optional and quiet.** Off-by-default for minors; never a public metric — your Ember is *yours*,
  not a leaderboard.

### 4.4 The Signal page — shareable, themed, bento

A public `/@handle` page (Focus template + one `page-chrome` registration), inheriting the member's
equipped theme.

- **Bento card grid**, not a button list: bio card, links, current streak/Ember (if opted public),
  upcoming events they host, a featured practice. Modern link-in-bio shape.
- **Themed by `profile_theme`** — the same palette/frame the in-app profile uses. Customize once.
- **Privacy-first.** The member chooses each card's visibility; **off by default for minors**; no
  exact location ever (ties into the existing location-privacy promise); no public vanity counts.
- Reuses `EntityCard` / `PersonCard` / vCard data already on the profile.

---

## 5. Phasing (each phase ships standalone, like the Resonance plan)

| Phase | Ships | Leans on | Risk |
|---|---|---|---|
| **P0 — Wire the equipped theme** | Make `profile_theme` actually render on the profile (it's an un-wired column today). Seed 2–3 earnable palettes as `themes` rows | `themes` table, `data-skin` renderer | ✅ Low — pure wiring |
| **P1 — Earned cosmetics catalog** | Palettes/frames/flair as `store_items`; milestone free-drops at streak 7/30/100; the "equip" UI on the profile | gem store, existing cosmetic columns | ✅ Low — rails exist |
| **P2 — Mode framework** | `Calm` / `Studio` toggle; Studio gated as a Crew capability; the governed parts-kit editor (token-driven, no HTML) | capabilities, `profile_theme` | ⏳ Medium — new editor UI |
| **P3 — Ember** | The streak companion as a view of existing streak state; milestone stages; reduced-motion-safe mouse follow; accessories | streak ladder, freeze tokens | ⏳ Medium — animation polish |
| **P4 — Signal page** | Public `/@handle` bento page, themed, privacy-first, per-card visibility | Page framework, vCard | ⏳ Medium — new public surface |
| **P5 — Limited rotation** | Availability-window cosmetics (equal-for-all, announced, **no per-user FOMO timer**) | store + a window column | ⚠️ Higher — must stay clear of dark-pattern lines |

**Sequencing logic:** P0–P1 deliver visible value on existing rails with near-zero risk and prove the
"earn → equip → it themes everything" loop. P2+ add the expressive depth. P5 is last because it's the
one with the sharpest regulatory edges — ship it only once the earn-first economy is established so
"limited" reads as *celebration*, not *pressure*.

---

## 6. The decisions to confirm before building

These are genuine product forks (the kind that previously went to AskUserQuestion). Flagging, not
deciding:

1. **Single currency vs two.** Recommendation: **stay single (gems)**. A second "premium" currency
   adds dark-pattern surface and audit cost for little benefit. Confirm.
2. **Is Studio mode Crew-gated** (the Nitro parallel, a soft monetization funnel), or free-for-all
   with only the *cosmetics* gated? Recommendation: **Crew-gates the mode, practice earns the items**
   — mirrors Discord and the existing free-during-beta Crew funnel.
3. **Do top-ups exist at all in the beta**, or is it **earn-only** to start? Recommendation:
   **earn-only first** — cleanest story, zero payment-to-minor exposure, prove the loop, add a flat
   top-up later if wanted.
4. **How public is Ember / streak** on the Signal page? Recommendation: **member's choice,
   off by default**, never a leaderboard.
5. **Age-gating Studio + Signal.** If we know a member is a minor, Studio's public Signal page should
   default to private and we should suppress any top-up entirely. Needs the age signal wired.

---

## 7. Why this is safe *and* fun

The tension in "expressive profiles for younger members" is that the most engaging mechanics
(randomized drops, FOMO timers, paid power, public clout) are exactly the ones regulators are fining
and that a wellness brand shouldn't touch. This plan resolves it by moving the dopamine to the
**right** place: **you earn your look by showing up.** The streak that already powers the product
becomes the thing that dresses your profile, grows your companion, and themes your page. Expression
is the *reward for practice*, not a purchase — which is both the compliant shape and, per the
wellness-app research (Finch), the more durable engagement loop anyway.

---

_Research basis: 11 briefs across cosmetic-reward economies, Discord/MySpace/SpaceHey customization
models, virtual-pet wellness apps (Finch), link-in-bio design, and the 2025 children's-privacy /
loot-box regulatory landscape. Existing-systems map verified against the live schema (gem economy,
`store_items`, `themes`, profile cosmetic columns, streak ladder). This is a plan for review — no
code or schema changes ship from this document._
