# The DAWN conversion — every element, phased

> **This doc holds no status of its own.** It is the work breakdown *subordinate to*
> [`UX-MATURITY-PLAN.md`](UX-MATURITY-PLAN.md) (ADR-925), which stays the live plan and owns
> sequencing. What lives here is the **denominator**: every element of the product that does not
> yet speak DAWN, counted, classified, and ordered into phases. Counts come from
> `scripts/adoption-baselines.json` (live, via `node scripts/check-adoption.mjs`) and from a
> six-way census run 2026-08-05 against `31e2acb`. **Where a count here and the JSON disagree,
> the JSON wins.**

Status legend: ✅ done · ⏳ in progress · ⚠️ needs a ruling · 🔴 not started · 🅿️ out of scope.

---

## 1. The denominator

| Population | Count | Note |
| :--- | ---: | :--- |
| Raw `<button>` not composing `Button` | 1,887 | the single largest population in the product |
| Raw `<input>` not composing `Input` | 808 | `ui/field.tsx` exists, 80 importers |
| Raw `<select>` | 267 | **no primitive exists at all** |
| Raw `<textarea>` | 162 | `ui/field.tsx` exists |
| **Raw markup subtotal** | **3,124** | ~98% of the element count |
| Duplicate implementations of a DAWN concept | 52 | 32 bespoke card shells · 6 tab strips · 5 badges · 3 meters · 2 avatars · 2 modals · 2 toasts |
| **Element total** | **~3,176** | |
| DAWN primitives missing or orphaned | **10** of 30 | Badge · RankBadge · Stat · Select · Checkbox · CounterRow, plus Toast / Meter / GateNotice / StreakMeter at 0–1 call sites. **Glyph was struck — see below** |
| Routes with genuinely hand-rolled layout | 13 | of 382 `page.tsx`; 260 already compose a template |

**The style surface itself is clean, and that is the good news.** Zero CSS modules, zero stray
`.css` files in the build, 346 inline `style={{}}` of which **zero** are static colour, and the one
runtime style-authoring surface in the product (Theme Studio → the `themes` table → `<style
id="fx-theme">`) is the best-guarded thing in the repo: every value passes a 44-name
`TOKEN_ALLOWLIST` in `lib/theme/validate.ts` before it can reach the DOM. There is no second
styling system to dismantle. **This is an adoption problem, not an architecture problem.**

### Carve-outs — not debt, do not "fix"

| Surface | Why a literal is correct |
| :--- | :--- |
| `lib/email.ts` + 9 comms senders | email clients do not resolve CSS custom properties |
| 18 `opengraph-image.tsx` / `twitter-image.tsx` | raster canvases, drawn not styled |
| `app/print/qr/*` | print `@media`, no theme to follow |
| 8 `getContext('2d')` call sites, `lib/qr/*` | canvas APIs take literal colour strings |
| `components/*/map.tsx` | the Google Maps Symbol API takes literal strings |
| `components/admin/theme-studio/tokens.ts` | it *is* the token source |
| `themes` / `events.theme` / `circles.theme` DB columns | already token-validated by construction |
| 20 `// token-ok:` escapes | each carries its reason; reviewable |

---

## 2. The phases

Ordered by **breaks theming → visible → volume**. A phase does not start before the phase that
builds what it sweeps onto.

### ✅ Phase 0 — The shell, the menu and the feed *(shipped 2026-08-05)*

Four rail rows drawing the generic fallback glyph, the rail's radius/tracking/weight ladder, the
chrome frame law, the feed's post surface and type roles, the rail's box-stack, the docks'
dismissal contract. See the commits on `claude/frequency-design-theming-lfz5sv`.

### ⏳ Phase 1 — The bug class: styling that ignores theming outright

> **`raw-palette` is DONE: 48 → 0, re-frozen with provenance (#2042).** `lib/gamification.ts`'s
> `TIER_CONFIG`/`DIFFICULTY_CONFIG` now draw from the rank spectrum. Retiring it required bridging
> the spectrum's `deep`/`bright` steps into `@theme` — only `.rank-badge` could reach them before,
> which is precisely *why* every caller had reached for a Tailwind palette class instead. A token
> nothing can consume gets worked around, not obeyed.
> **Still open in this phase:** `white-black-literals` (266).

Not drift. These are sites where switching skin, generation or mode **does nothing**, so the
product is visibly wrong on any look but the default.

| Item | Count | Size | Note |
| :--- | ---: | :---: | :--- |
| `lib/gamification.ts` `TIER_CONFIG` / `DIFFICULTY_CONFIG` | 48 | S | raw Tailwind palette classes in ONE exported file; propagates to every achievement, badge and leaderboard surface. The whole `raw-palette` ratchet |
| `white-black-literals` | 266 | M | hardcoded monochromes; the ratchet's own description calls this the only *bug* class in the census |

> **Correction (2026-08-05).** An earlier revision of this doc, and the session handoff it came
> from, listed `--radius-cover` here as a phantom token that "compiles to nothing." **That is
> wrong and the row has been removed.** `--radius-cover` is a *Space-theme* token
> (`[data-space-theme="…"]`), not a generation token. Its absence from `:root` is deliberate:
> `bold` is the no-op default theme and sets no radius, and both consumers call it as
> `rounded-[var(--radius-cover,0.75rem)]` — an arbitrary value **with a fallback** — so an
> unthemed Space paints 0.75rem and a themed one paints its own value. `lib/theme/space-themes.test.ts`
> enforces that all five theme blocks set it. The bare `rounded-cover` utility does not exist, which
> is true and harmless, because nothing in the repo calls it. The comment in
> `app/spaces/claim/[token]/page.tsx` saying it themes covers is **accurate**.
>
> Recorded rather than quietly deleted, per the working convention: *audits are leads, not facts.*
> This one was inherited unverified and repeated in two documents before anyone ran the grep.

### ⏳ Phase 2 — Build the missing primitives *(blocks Phase 3)*

> **3 of 11 shipped (#2042): `Badge`, `Select`, `Checkbox`.** Badge replaced five hand-rolled
> pills; `Select` and `Checkbox` did not exist at all, against 272 raw `<select>`. Two badges were
> deliberately NOT folded in — `VerifiedBadge` and `CharterBadge` are not pills, and making them
> one would turn a calm trust signal into a status symbol.
> **Shipped since:** `RankBadge` (drives the existing `.rank-badge` CSS primitive through
> `lib/season-ranks.ts` rather than re-deriving its colours) and `Stat`. `Counter` went 1 → 7
> importers and `Meter` 0 → 2, which is the other half of this phase: a primitive nobody calls is
> not built, it is only written.
>
> **`Glyph` is struck from the list — it was an audit lead the code had already answered.**
> DAWN ships a Glyph for exactly one reason: `lucide.createIcons()` replaces the `<i data-lucide>`
> node React created and unmounts the tree. That failure mode is structurally absent here.
> `components/ui/icon.tsx` **already is** this primitive under **ADR-505 (accepted 2026-07-02)** —
> `aria-hidden` by default, `currentColor`, size defaulting to `1em` off the type role — and
> `lucide-react` already emits `aria-hidden` and `currentColor` on its own. Building one would
> add a *third* icon entry point against an ADR that explicitly rules direct `lucide-react` use
> "the normal path, not a stopgap". Per AGENTS.md, the code and the ADR beat the plan doc.
>
> **`Avatar` and `Toast` shipped; `CounterRow` was already built.** `components/ui/avatar.tsx` is
> the one round member/entity image — initials fallback, the `ring` halo, a named size scale, and
> the optional presence dot that `components/presence/presence-dot.tsx` had been offering to
> nobody. `ProfileAvatar` and `PulseAvatar` keep their exports and now compose it, so no call site
> was touched. `components/ui/toast.tsx` is the one transient notice; `achievement-toast.tsx` and
> `zap-toast.tsx` keep their events, copy and dwell (6s and 4s) and compose it, which retired two
> card shells, two elevation vocabularies, two slide-up copies and two dismissal timers — and
> added the `role="status"` **neither** of them had, so a member on a screen reader was previously
> awarded Zaps in silence. `CounterRow` was found already present, exported and tested in
> `components/ui/counter.tsx` with three call sites: an audit lead the code had already answered,
> like Glyph, but this one needed no ruling — just a `grep`.
>
> **Remaining: the wiring of `StreakMeter` and `GateNotice`**, both of which need a widening
> rather than an adoption (no second day-run surface exists for StreakMeter; GateNotice's
> single-`<p>` body cannot hold the three-paragraph notices that would otherwise adopt it).

Sweeping 3,124 elements onto primitives that do not exist is not possible. This phase is small in
line count and unblocks the largest phase in the plan.

| Primitive | Today | Action |
| :--- | :--- | :--- |
| **Select** | none — 267 raw `<select>` | build it; largest un-primitived control |
| **Checkbox** | none | build it |
| **Badge** | 5 one-off pill components | one `Badge` with a tone prop; retire the five |
| ~~**Glyph**~~ | ~~raw `lucide-react` everywhere~~ | **Struck.** `components/ui/icon.tsx` already is it (ADR-505); a Glyph would be a third icon entry point |
| **Stat** / **RankBadge** | none | build from the DAWN reference |
| ~~**CounterRow**~~ | ~~none~~ | **Already built.** Exported + tested in `components/ui/counter.tsx`, 3 call sites. The census row was wrong, not the code |
| **Avatar** | ~~split across 2 files, neither wired to `presence-dot`~~ | ✅ `components/ui/avatar.tsx`; both wrappers compose it and keep their exports |
| **Toast** | ~~2 renderers sharing a lane~~ | ✅ `components/ui/toast.tsx`; both renderers compose it, timings and copy unchanged |
| **UnderlineTabs** | lives in `components/admin/` | promote to `components/ui/`, then retire the 6 rival tab strips |
| **Meter** / **GateNotice** / **StreakMeter** / **Counter** | 0–1 call sites | wire to their intended callers, not rebuild |

### 🔴 Phase 3 — The mechanical sweeps *(the bulk: ~3,124 sites)*

| Sweep | Sites | Size | Ratchet |
| :--- | ---: | :---: | :--- |
| `<button>` → `Button` / `IconButton` | 1,887 | L | `raw-button-bg` 528 · `handrolled-icon-button` 37 |
| `<input>` / `<textarea>` → field primitives | 970 | L | — |
| `<select>` → `Select` | 267 | M | — |
| bespoke cards / rows → `EntityCard` / `RowCard` | 37 | M | `bespoke-cards` 23 · `bespoke-rows` 14 |
| hand-rolled tabs → `UnderlineTabs` | 3 + 6 strips | S | `handrolled-tabs` 3 |
| hand-rolled bars → `ProgressTrack` | 14 | S | `adhoc-progress` 14 |

⚠️ `raw-button-bg`'s pattern is a 500-char proximity window over arbitrary JSX, not a count of
buttons — collapsing indentation alone moves it 529 → 564. Replace it with the opening-tag form
before trusting it to measure this sweep.

### 🔴 Phase 4 — Type

| Item | Sites | Size |
| :--- | ---: | :---: |
| Eyebrow unification (`tracking-wide` 484 · `wider` 77 · `widest` 75 · 62 arbitrary, against 3 adopters of the `eyebrow` utility). ⏳ marketing done: 40 → 9. **The role is now LOCKED — see below** | ~698 | M |

> **The eyebrow role, locked 2026-08-05 (owner-delegated).**
> **`0.75rem` · `0.18em` · bold · uppercase** — `--text-eyebrow`, `--tracking-eyebrow`, and the
> `eyebrow` utility, guarded by `lib/theme/eyebrow-role.test.ts`.
>
> This needed deciding because DAWN disagreed with itself on **all three axes of one role**, and
> production had inherited every fork:
>
> | Axis | DAWN readme §4 | DAWN's own `.eyebrow` class | Locked |
> |---|---|---|---|
> | Size | `--text-eyebrow: 0.875rem` (token) | reads `--text-meta` → 0.75rem | **0.75rem** |
> | Tracking | "locked at 0.25em" | reads the token → 0.18em | **0.18em** |
> | Weight | "uppercase, bold" | `--weight-semibold` | **bold** |
>
> In each case the class body — what DAWN's components have actually *rendered* all along — won
> over the prose, which is the same rule the repo already applies to its own plan docs. The
> reasoning beyond precedent: 0.875rem is also `--text-body-sm`, so an eyebrow there is exactly as
> large as the sentence it labels and stops being a label; 0.25em spaces letters faster than words
> at this size, so a two-word eyebrow reads as two, and it will not fit a `px-2.5` pill; and
> tracking thins a word optically, so semibold reads underweight beside its own heading.
>
> **Net rendered change: zero.** Every eyebrow already painted 0.75rem/0.18em. What moved is that
> the role now has one answer instead of three, the `eyebrow` utility reads its own role token
> rather than borrowing `--text-meta`, and it is **sufficient alone** — no `font-bold` needed
> beside it, which was the habit quietly rebuilding the hand-rolled eyebrow at every call site.
| Display literals `text-3xl`…`9xl` → display roles (pass 2b) | 301 | M/L |
| `tracking-[…]` arbitrary | 72 | S |
| `text-[…]` arbitrary (incl. 3× `text-[9px]`) | 64 | S |
| `text-subtle` + 2xs/3xs AA rule + sweep | 24 | S |

### 🔴 Phase 5 — Shape and depth

| Item | Sites | Size |
| :--- | ---: | :---: |
| `h-[…]` / `w-[…]` arbitrary | 442 | M |
| `literal-radius` → role tokens | 3,824 | L — **spend inside screen passes, never as its own wave** |
| R3: the radius ladder (`sm`…`2xl` in px, `xs`/`3xl`/`4xl` left at Tailwind's rem, so the top rung is a 1.5px step and ignores the density lever) | ~1,319 | S |
| `rounded-[…]` 20 · `shadow-[…]` 2 · `border-[…]` 1 | 23 | XS |

### ⚠️ Phase 6 — Structure and the framework

| Item | Detail | Size |
| :--- | :--- | :---: |
| ⚠️ **The 8 browse surfaces** | Circles, Channels, Classifieds, Events, Housing, Market, Store and the Spaces directory were deliberately migrated OFF `IndexTemplate` onto `MarketHero` + `BlockRender`. `PAGE-FRAMEWORK.md` §8.5 still lists two of them as `IndexTemplate` exemplars. **Needs a ruling: is that a sanctioned 12th composition, or the backlog?** The doc is stale either way | M |
| 5 hand-rolled editors | `admin/appearance/{new,[id]}`, `admin/walkthroughs/[id]`, `circles/[slug]/edit`, `spaces/[slug]/manage` | M |
| ✅ Dead templates | **Done 2026-08-05.** `TwoColumnTemplate` and `HeaderSidebarTemplate` had zero JSX usages while being documented as 2 of the nine shells. Both deleted. The canon is now **eight**: Stream · Index · Detail · Dashboard · Focus · WizardShell · RailGrid · Admin — and `RailGrid` was in §8.1's table but missing from the prose, so the "nine" heading was really counting ten rows | XS |
| `check:headers` scope gap | it walks `page.tsx` only, so an `<h1>` inside a delegated component is invisible to it — 3 confirmed hand-rolled ones evade it today | S |
| Rail widths | `288`/`56` hardcoded in three places plus `w-72`/`w-14`/`lg:min-w-72`; DAWN drives both rails from one grid declaration. Introduce `--rail-w-*` | S |
| The breakpoint | production sheds the left rail at 768px and the right at 1024px; DAWN's law is one 1000px line. Between 768 and 1024 the app is in a state DAWN does not describe | S |
| Rail ladder | Auto / Open / Strip as a persisted standing instruction; today the fold is binary and `useState`-keyed on pathname, so it resets on navigation | M |

`PAGE-FRAMEWORK.md` §8.2 is also stale: it documents a Focus-`'none'` rail policy that the
2026-06-20 owner directive replaced (`FOCUS_NONE_PREFIXES` and `SCOPED_PREFIXES` are both empty —
the rail shows everywhere by design). Fix the doc, do not "fix" the code.

### 🔴 Phase 7 — Marketing

15 of 38 marketing pages bypass `Section` and its four-role rhythm. `.mk-cream` / `.mk-ink` have
**zero** adopters, so the same-tone-halving rule never fires and the thing that makes a tone change
read as a change is inert. Size: M.

### 🅿️ Phase 8 — `resonance/`

A **separate Next.js app**: own `package.json`, `tsconfig`, `next.config`, `supabase/`, and its own
`globals.css` declaring an independent `@theme` block — a wholly separate token vocabulary, not
`@theme inline` over ours. It carries 3 `<style>` tags, 34 inline styles and 8 raw-hex sites, and
no gate in this repo watches it. **Out of scope for this conversion and correctly so.** It needs
its own DAWN adoption decision; do not fold its debt into this app's scoreboard.

---

## 3. What governs all of it

1. **Every phase past 1 changes rendering, and `pr-compare` is not a required check.** Batch the
   rendering work, then recapture once against a finished tree. The runner's capture commit does
   not re-trigger CI.

   > **Measured cost, 2026-08-05.** This is no longer hypothetical. #2038 recaptured baselines that
   > had drifted across **six** merges. #2042 then merged red — because an advisory gate cannot
   > block anything — and the **very next PR** inherited the drift: 4 failures on `/about` mobile,
   > `390×9587` vs `390×9566`, a 21px shortening traced to `SectionHeading`'s eyebrow tightening
   > from 0.25em to 0.18em and un-wrapping a line. Two recapture cycles in two days, both for the
   > same reason.
   >
   > The recapture is also the cleanest attribution tool available: it rewrote **exactly the 4
   > baselines that failed and no others**, which is mechanical proof that the other 60 surfaces
   > were pixel-identical. If a capture rewrites more files than the run reported failing, the
   > extra ones are the real regression and the diff is where to look.
   >
   > **Third cycle, 2026-08-05 (#2047).** Predicted by the two above and arriving on schedule.
   > #2046 merged Phase 4's type sweep; the next PR inherited 8 failures, all `/pricing`, all four
   > theme states × both viewports, `18869px` vs `18864px`. Traced to **one line in the base
   > branch** — `text-3xl` → `text-display-h3` on the featured plan title — where a fixed 1.875rem
   > became a `clamp()` that resolves 5px shorter at both widths, shifting everything below it past
   > the 2% pixel threshold. The PR itself touched nothing under `app/(marketing)/pricing`.
   >
   > The attribution property held again, and is now three-for-three: **56 of 64 shots passed, and
   > the capture rewrote exactly the 8 that failed.** That is mechanical proof the other 56 surfaces
   > were pixel-identical, and it is why a recapture is safe to run on a red `pr-compare` without
   > laundering a real regression into the baseline — the capture can only move what already
   > differs. Use the rule in both directions: **if a capture rewrites more files than the run
   > reported failing, the extra ones are the regression.**
   >
   > **Making `pr-compare` required is the fix.** Until then, budget one recapture cycle per
   > rendering merge and read a green `pr-compare` as "either nothing changed, or nobody looked."
   >
   > **Recapture procedure** (the trap is in step 3, and it is why this is written down):
   > 1. Dispatch `e2e-manual.yml` with `base_url` = the PR's Vercel preview and
   >    `update_baselines: true`. Capture takes ~5 min for all 64 shots.
   > 2. Check the capture commit's file list against the failing-test list. They must match.
   > 3. **Push a real commit afterward.** The runner commits with `GITHUB_TOKEN`, and GitHub
   >    suppresses workflow runs from that token so an Action cannot recurse into itself — so the
   >    baseline commit arrives with no `checks`, no `pr-compare`, no `analyze`. Re-running the
   >    failed job does not help either: a re-run replays the old SHA and would judge the new
   >    baselines against the old tree. Only a fresh push fires `pull_request: synchronize`.
   >    The failure mode is silent: the PR looks mid-run forever because the run was never queued.
2. **Ratchet counts only shrink.** A phase that raises one fails CI, and that is the mechanism.
   New primitives arrive as kit pieces, so adopting them should move a count DOWN.
3. **Build the primitive before sweeping onto it** (Phase 2 before Phase 3). Half this plan's
   volume is blocked on ~11 components that do not exist yet.
4. **A guard that cannot see its subject is not a guard.** Two examples found in this census:
   `check:headers` cannot see a delegated `<h1>`, and `AREA_ICONS` had no test comparing it to the
   nav until one row's fallback had been shipping for months. Prove a guard can fail before
   trusting it.
5. **`check:adoption` counts matches inside comments.** Found 2026-08-05: writing the words
   `shadow-lg` inside a `//` comment raised `shadow-literals` by one and failed the gate, with no
   markup involved. Every utility-class ratchet reads raw file text, so **prose about a token is
   indistinguishable from a use of it** — which also means a sweep can bank a phantom "win" by
   deleting a comment. This is the same defect class as handoff §3.5 (`check:bridge`'s first
   version matched a token *mentioned* in a comment 1,000 lines from the real at-rule) in a
   different script. Fix: strip comments before matching, in `scripts/check-adoption.mjs`. Until
   then, a ratchet delta inside ±2 deserves a look at the diff before it is believed.
