# Handoff — Hook AI visuals & Features/AI narrative

> **Purpose.** This is a cross-session handoff for the thread working in the
> **`hook` (hook.coach)** repo. It was produced in a `frequency-web` session, so
> all brand specifics below (palette, "Frequency" naming, the `frequency-logo`)
> are from `frequency-web` — **map them to Hook's own tokens/brand** when you
> implement. The *concepts, copy, strategy, and generator code* are the payload.
>
> Two sessions can't share live memory; this file is the bridge.

---

## 1. The Hook polish checklist (the actual asks)

1. **Logo → home, everywhere.** Wrap the header **and** footer logo lockup in a
   link to `/`, make the whole lockup clickable (not just the wordmark), add
   `aria-label="Hook — home"`. Put it in the shared layout so every route inherits it.
2. **Static mark = the animation's blob.** Export the **resting/idle frame** of
   the creature animation as the static logo SVG so the still icon and the live
   creature share the exact same silhouette — one source path, no drift.
3. **One `<Creature>` component.** Standardize size + motion: every instance on
   every page uses the same component, same dimensions, and the **same animation
   as the homepage** (respect `prefers-reduced-motion`). Replace one-off/static placements.
4. **Hero/header on every page.** A shared `PageHero` system (eyebrow · title ·
   subtitle · CTA, optional photo or the creature) applied to **all** routes so
   none are headerless.
5. **Better image cropping.** `next/image` with `fill` + `object-cover` + per-image
   **focal points** (`object-position`) and intentional aspect ratios; fix crops
   that cut off faces/subjects.
6. **Expand thin content.** Flesh out sparse pages with more sections/copy — and
   land the **AI companion narrative** (Section 4) so the AI story is on Hook too.

**Do this first:** read Hook's **logo, creature/animation, and layout** components
before changing anything, so 1–3 build on what's really there.

---

## 2. Design + art-placement strategy (for the AI visuals)

**Narrative spine.** AI runs the admin so coaches stay human — and keeps the
community's energy moving on its own. Two beats:
- **Beat A — "What AI takes off your plate"** → coach-at-center piece (admin → presence).
- **Beat B — "What AI keeps moving"** → network-in-motion piece (conversation · activity · energy).

**Placement by page**

| Page | Placement | Asset | Purpose |
|---|---|---|---|
| Home / splash | mid-page teaser band | network-motion (abbreviated, animated, lazy) | intrigue |
| Features / How-it-works | after the feature list, before CTA | both pieces + companion copy (A → words → B) | the full story |
| Demo / product tour | a centerpiece step | network interactive | feel it "alive" |
| Pricing | beside the AI/Studio tier | small static coach cut | justify value |
| Social / OG | export | square + landscape cuts | shareability |

**Redesign recommendations (turning one-off art into a system)**
1. **Tokenize colors** — replace hardcoded hex with CSS custom properties mapped to
   Hook's design tokens (`currentColor` where possible).
2. **Dark mode for free** — tokenizing means the art auto-themes; don't bake a 2nd asset.
3. **Fonts via the app** (`next/font`), not a Google Fonts `<link>`.
4. **Componentize** — `<CompanionCoachSection/>` (copy) + `<AIFlowDiagram variant="coach"|"network" animated?/>` (inline SVG, not an iframe).
5. **Real labels from the source** — pull actual vertical + AI-capability names from Hook's codebase; don't hardcode the `frequency-web` guesses below.
6. **Mobile variant** — drop the faint mesh, enlarge nodes, reflow labels, min font size.
7. **Contrast pass** — keep the faded look, but body/label text must clear WCAG AA.
8. **Motion hygiene** — `prefers-reduced-motion` off-switch, lazy-load below fold, pause off-screen.
9. **Accessibility** — `<title>`/`<desc>` + `aria-label`, plus a text legend.

---

## 3. The verticals + AI "operator" model

**Verticals** (frequency-web naming — confirm against Hook):
Community (circles & feed) · Gatherings (events & check-ins) · The Game (zaps & ranks) ·
Studio (insight & nudges) · Programs (frameworks) · Growth (new members).

**The operator** (what the AI actually does — matches the real Studio agent:
deterministic proposer + approval gate):
- **Prompts** — drafts the message in the host's voice.
- **Workflows** — fires the right play at the right step.
- **Reminders** — nudges members at the right moment.
- **Audience** — finds who's lapsing, segments who to reach.
- **Guardrail:** it *proposes; you approve*. Nothing sends without the human; opted-out
  members are never touched; no bots posing as the host.

---

## 4. AI companion copy (tactical, not gushy)

**Section — "A companion, not a guru."**
*Kicker:* The admin runs in the background. You stay the human in the loop.

*Intro:* AI runs underneath as a quiet operator. It doesn't run your community — it
clears the busywork so you can: spotting the signals you'd miss, drafting the message
you don't have time to write, and handing it back for your yes.

- **You can't keep an eye on everyone.** → It flags the member who's gone quiet — no
  verified practice in two weeks — before they drift for good.
- **You don't have time to write the check-in.** → It drafts it in your voice, with the
  context of what they last showed up for. Edit a word, or just send.
- **Follow-up is the first thing to slip.** → Welcomes, re-engagement, a nudge when a
  streak's about to break — they fire on their own, so momentum doesn't ride on your memory.
- **Too many tabs.** → One surface gathers signals from Circles, events, practice and the
  game into a single "who needs me today" view.

*Guardrail callout:* **It proposes; you approve.** Nothing goes out without you, and anyone
who's opted out is never touched. No bots posing as you, no auto-DMs behind your back.

> A working, build-clean React implementation of this section (in the redesigned
> marketing system) lives in `frequency-web` PR #60, on
> `app/(marketing)/how-it-works/page.tsx` (the `CompanionCoach` component) — copy
> it as a starting point and re-token to Hook.

---

## 5. Infographic concepts (reproducible)

Files in this folder:

| File | What it is |
|---|---|
| `concept-network-interactive.html` | **AI network in motion** — verticals as a ring around an AI core; comet pulses (conversation/activity/energy) flow outward + circulate. Self-contained `animateMotion`, no libs. Open in a browser. |
| `concept-wobbling-string.html` | **Wobbling string** — a serpentine of feature nodes down the page with live AI cords pulsing between them (vanilla JS canvas). Scroll-native alternative. Open in a browser. |
| `infographic-network.py` | Static network infographic generator (SVG→PNG via cairosvg). |
| `infographic-coach.py` | Static "coach-at-center" infographic generator. |
| `infographic-network-interactive-gen.py` | Generator that emits `concept-network-interactive.html`. |

**Aesthetic** (frequency-web DAWN tokens — remap to Hook): warm sand `#F7F3EA`,
ink `#1E1A13`, amber `#E2912F`, signal teal `#1E9E89`, soft tan core glow `#D8C29A`;
display = **Anton** (uppercase), body = **Nunito** (600–900); faded/low-opacity fills,
hairline borders, soft warm shadows.

**Python generators** need: `pip install cairosvg fonttools` + Anton/Nunito fonts
installed (the scripts assume the families are available via fontconfig). The two
`.html` files need no setup — just open them.

---

## 6. Status of the related `frequency-web` work
- **PR #60** (draft): adds the "A companion, not a guru" section to the redesigned
  how-it-works, building clean on Vercel. Reusable reference for Hook.
- The infographics here are **concept art** — not yet componentized or tokenized; see
  the redesign recommendations in §2 before shipping to production.
