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

### ⏳ Phase 3 — The mechanical sweeps *(the bulk: ~3,124 sites)*

| Sweep | Sites | Size | Ratchet | State |
| :--- | ---: | :---: | :--- | :--- |
| `<button>` → `Button` / `IconButton` | 1,887 | L | `raw-button-bg` 528 → **517** · `handrolled-icon-button` 37 → **12** | ⏳ icon buttons largely done |
| `<input>` / `<textarea>` → field primitives | 970 | L | — | 🔴 |
| `<select>` → `Select` | 267 | M | — | ⏳ **`components/spaces` + `components/admin`: 83 → 0** |
| `<input type=checkbox>` → `Checkbox` | 14 | S | — | ✅ **0 remaining in those two trees** |
| bespoke cards / rows → `EntityCard` / `RowCard` | 37 | M | `bespoke-cards` 24 · `bespoke-rows` 14 | 🔴 |
| hand-rolled tabs → `UnderlineTabs` | 3 + 6 strips | S | `handrolled-tabs` **0** | ✅ |
| hand-rolled bars → `ProgressTrack` | 14 | S | `adhoc-progress` 14 → **12** | ⏳ |
| hand-rolled rank badges → `RankBadge` | 23 | M | `bespoke-cards` | 🔴 **primitive shipped with 0 adopters** |

> **A primitive with no adopters makes the debt worse, not better.** `RankBadge`, `Stat` and
> `Checkbox` all landed in Phase 2 with **zero importers**, and `rank-badge.tsx`'s own docstring
> says it exists to retire "twenty call sites [that] currently hand-roll `<span
> className="rank-badge">`" — 23 of which still exist, so `bespoke-cards` went 23 → 24 when it
> shipped. Build-then-adopt is the sequencing rule (§3.3); the lesson is that the *adopt* half has
> to be scheduled, not assumed. Checkbox has since been adopted by the select sweep. The other two
> are outstanding.
>
> **The rank-badge conversion is a contrast fix, not a restyle.** Measured 2026-08-05: white on
> every rank **core** is 2.46:1–3.88:1, all under AA; **deep** is 6.00:1–8.83:1. Core is a fill or
> a dot; deep is text on light; bright is text on dark. `lib/season-ranks.ts` carries both `color`
> (core) and `solid` (deep) for exactly this reason. A badge putting text on a core fill fails AA
> silently, and `check:contrast` models named pairs with no `white-on-rank` entry, so it is green
> over all of them.

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
| ⏳ Display literals `text-3xl`…`9xl` → display roles (pass 2b). **`app/**` swept: 300 → 112** | 112 left | M |
| 🔴 **Three roles the vocabulary is missing** — decided 2026-08-05, see below | 12 sites | S |
| `tracking-[…]` arbitrary | 72 | S |
| `text-[…]` arbitrary (incl. 3× `text-[9px]`) | 64 | S |
| `text-subtle` + 2xs/3xs AA rule + sweep | 24 | S |

> **Three missing roles, approved 2026-08-05 (owner).** The `app/**` display sweep left 12
> literals rather than guess, and every one of them names the same shape of gap: the ladder is
> entirely `clamp()`-based and fluid, so there is nothing to reach for when a figure must NOT
> scale. All three are approved to be added:
>
> | Role | Value | Why a literal survived without it |
> |---|---|---|
> | **compact stat** | ~1.875rem, **fixed** | `admin/page.tsx:214` is a 4-up KPI strip in a page header. `text-stat` (3.5–4.5rem) breaks the row; nothing else fits. |
> | **fixed mid-scale numeral** | ~2.25rem, **not fluid** | `upgrade` ×2 and `pricing`'s `sizeFor()`. `display-h3` shrinks the conversion-critical price ~22% on phones. |
> | **non-viewport display** | fixed, no `vw` | On a print surface viewport units resolve against the **page box**, so the QR wall-poster title sizes unpredictably. |
>
> A fourth case is NOT a missing role and must not be treated as one: `pricing`'s `sizeFor()` is a
> **length-driven fitting algorithm** — four sizes selected by label character count so the display
> face never wraps mid-figure. Roles have no 4-step ladder in that band, and giving them one to
> serve one call site would be fitting the vocabulary to a layout bug.
>
> Two more that are correctly literals forever: emoji glyphs, avatar initials, and single-letter
> fallback cover glyphs sized to fill a tile. None is display type.
>
> ⚠️ **`events/[slug]:1705` and `detail-template.tsx:133` are a PAIR.** The first is an inline-edit
> input mirroring the second's `titleScale="display"` chain verbatim. They move together or the
> editor stops matching the title it edits.

### 🔴 Phase 5 — Shape and depth

| Item | Sites | Size |
| :--- | ---: | :---: |
| `h-[…]` / `w-[…]` arbitrary | 442 | M |
| `literal-radius` → role tokens | **3,687** (was 3,824) | L — **spend inside screen passes, never as its own wave** |
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
| 🔴 The breakpoint | production sheds the left rail at 768px and the right at 1024px; DAWN's law is one 1000px line. Between 768 and 1024 the app is in a state DAWN does not describe. **Contained fix:** add `--breakpoint-rail: 62.5rem` to `@theme inline` and swap only the five rail/menu classes in `app-shell.tsx`. Do NOT redefine `--breakpoint-md` — that moves **629** `md:`/`lg:` usages repo-wide to fix five | S |
| ✅ Rail ladder | **Done 2026-08-05.** Auto / Open / Strip as a persisted standing instruction (`lib/layout/rail-fold.ts`), both rails, one shared 26px foot control, read via `useSyncExternalStore`. Replaced a `useState` keyed on pathname that discarded the choice on every navigation. `NavLinkList`'s `compact` prop turned out to be a complete implementation with no caller | M |
| ✅ Server-painted fold | **Done 2026-08-05.** A folded rail is different *markup*, not restyled markup, so unlike the theme it cannot be corrected pre-paint by an inline script — by the time any script runs the open rail is already in the HTML. The server is the only actor who can paint it on frame one; `app/(main)/layout.tsx` now seeds `railFold` from the cookie mirror | S |
| 🔴 **Dock bar at strip width — DECIDED: hide it** | `DockBar` hardcodes `w-72` (288px) with no awareness of the fold, so at the 56px strip it overhangs the content column by ~232px. Pre-existing, but making the fold available on every rail page took it from rare to likely. **Owner decision 2026-08-05: hide the bar when the rail is folded**, rather than narrowing it to two icons. The rail-foot account dock and the top-right system dock still cover navigation; what is genuinely lost is one-tap Vault and Messages, and that is accepted. Hiding must route through the same `close()` path Esc and outside-click use, or an open panel is stranded and focus is dropped on `<body>` | S |

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
   > **Making `pr-compare` required is the fix — APPROVED 2026-08-05 (owner), not yet applied.**
   > It is a branch-protection setting on `main`, so it needs repo-admin rights: Settings →
   > Branches → `main` → *Require status checks to pass* → add **`pr-compare`** beside the existing
   > `checks` and `analyze`. Do NOT remove either of those while adding it.
   >
   > Two consequences to accept with it, both real: every rendering PR gains ~11 minutes before it
   > can merge (preview resolution plus a 5-minute visual pass), and a legitimately-changed surface
   > now BLOCKS until its baselines are recaptured, rather than merging red. That second one is the
   > entire point — it converts a silent inheritance into a step someone has to take.
   >
   > Until it is applied, budget one recapture cycle per rendering merge and read a green
   > `pr-compare` as "either nothing changed, or nobody looked."
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

---

## 4. Phase 9 — The instruments *(added 2026-08-05; unscheduled, and it should not be)*

This phase exists because a full day of conversion work produced one finding larger than any of
the sweeps: **the design system was never the bottleneck — the things measuring it were.** The
palette was already 100% correct, all 81 DAWN tokens present value-for-value. What was wrong was
that five separate gates were **green over the exact defects they existed to catch**:

| Gate | Was green over | Fixed? |
| :--- | :--- | :--- |
| `check:adoption` | comments — writing `shadow-lg` inside a `//` raised the count with zero markup involved, so a sweep could bank a phantom win by deleting prose | ✅ `stripComments()`, `CORPUS_BASIS strip-comments@1` |
| `check:phantom` | everything in `lib/`, every `.ts` file, and every alpha modifier — so the classes a sweep moved OUT of `.tsx` left its coverage entirely | ✅ widened 175 → 255, proven against an injected phantom |
| `check:contrast` | white on all 10 rank cores at 2.46:1–3.88:1, because it models *named pairs* and has no `white-on-rank` entry | 🔴 **still green over them** |
| `check:bridge` | a token *mentioned* in a comment 1,000 lines from the real at-rule | ✅ (handoff §3.5) |
| `select-checkbox.test.tsx` | a `className` string containing `w-auto` while the element rendered `w-full` — asserted under the name "shrinks to its options" | ✅ now asks the compiler |

Plus three blind spots that are scope gaps rather than bugs: `check:headers` walks `page.tsx` only,
so a delegated `<h1>` is invisible to it (3 hand-rolled ones evade it today); `check:seo` scans
`app/(marketing)/**` only, so the marketplace routes are unwatched; and **`pr-compare` cannot see
the app shell at all.**

> **The sharpest instance, and it arrived last: a gate whose blind spot is exactly where the
> change lands.** #2048 removed the rail fill, moved the fold control to an edge handle, and
> resized both dock heads. `pr-compare` returned `12 skipped · 64 passed` — **green**. The 12 skips
> are the whole member shell (`/feed`, the room, `/settings`, the Space console), skipped because
> `PW_STORAGE_STATE` is unset; the 64 passes are marketing pages that render outside the `(main)`
> shell and have no rail to photograph.
>
> The gate was not wrong. It reported accurately on what it can reach, and what it can reach
> excludes the product. That is a different failure from the five above — those were instruments
> mis-measuring their subject, this is an instrument pointed somewhere else entirely — and it is
> worse, because nothing about the output hints at it. A skip count is not a failure, so a green
> board and a green board with the app missing from it look identical.
>
> It also inverts the sequencing on ADR-948. See its 🔴 amendment: `PW_STORAGE_STATE` first,
> baselines second, required third. Required-and-blind promotes a known gap to an institutional
> claim.
>
> **Fixed 2026-08-05, and the fix is worth generalising (ADR-950).** The instrument could not be
> pointed at the app without a credential only the owner can create — but *saying that it was not
> pointed at the app* needed no credential at all, and that half shipped first. Every run now
> counts its `@shell` tests and, when none of them execute, prints a **PARTIAL** banner into
> `$GITHUB_STEP_SUMMARY` naming `/feed`, the room, `/settings` and the Space console as
> unphotographed, with the cause and the one command that fixes it. The exit code is untouched:
> an absent owner-held secret is not a pull request's fault, and a red X meaning "nobody has made
> a credential yet" is how a check gets ignored. `PW_REQUIRE_SHELL=1` converts the same situation
> to a failure once the credential exists.
>
> **The transferable rule.** When a gate cannot reach its subject, the reachable fix is not always
> the gate — it is the REPORT. A blind spot that announces itself on every run is a different
> object from one that has to be remembered, and it costs nothing to build. Of the six items in
> this queue, this was the only one whose fix could ship before its blocker.

**The rule this yields, and the one worth carrying past this conversion:**

> **Prove a guard can fail before trusting it.** Reintroduce the defect, watch the assertion go
> red, restore, watch it go green. Every guard added on 2026-08-05 was proven this way — the
> dock-clearance pair by re-applying `sticky bottom-4` and confirming two assertions flipped.
> A guard that has never been observed failing is not evidence; it is decoration that reads
> like evidence, which is worse than nothing because it ends the investigation.

> **The rule paid for itself the same day it was written, and the story is the argument.**
> While widening `check:seo`, the first draft of its private-route detector treated
> `getMyProfileId()` as a wall — reasonable, since a page asking who you are usually needs you to
> be someone. But `/market` calls it to **personalise**, not to gate. So the new gate classified
> `/market` as correctly-private and reported green **over the exact route it had just been
> written to watch**. Nothing about the output hinted at it: 46 pages checked, no failures, a
> clean tick.
>
> Only the fail-proof caught it. Injecting the defect the gate existed to catch produced green,
> which is the one result an injection must never produce. The signal is now the *stop* —
> `redirect(`, `notFound()`, a `require*` guard — not the lookup.
>
> Generalise from it: a gate is at its most convincing in the minutes after you write it, because
> you know what it is for and it agrees with you. That is precisely when it has never been
> observed failing. **Write the injection before you trust the tick.**

The corollary is about *shape*, not diligence. Four of the five failures above share one form: **a
test that greps the string it was just handed cannot see what the compiler or the cascade does with
it.** `cn()` in this repo is a plain join, not `tailwind-merge`, so a class passed to a primitive
does not replace the default — both reach the attribute and emit order settles it. Measured against
the real compiled sheet: `.w-auto` (8610) precedes `.w-full` (8643), so `w-auto` loses; `.w-max`
(8676) follows it, so that wins. **No call site can see this.** Any assertion about width, padding,
or display that does not compile `app/globals.css` is asserting about a string, not a rendering.

### The queue

| Item | Size | Why |
| :--- | :---: | :--- |
| ✅ `white-on-rank` pairs in `check:contrast` | S | **Done 2026-08-05.** 30 pairs × 5 states; the table went 215 → 365 rows. Worst non-waived pair moved 3.68:1 → **3.06:1**, which is the gate showing its real floor rather than a flattering one. Icons take the `edge` 3:1 minimum, text the `body` 4.5 — and that split encodes a ceiling: slate (4.31) and plum (4.46) do not clear 4.5, so a rank **core** may carry a glyph and must never carry a label |
| ✅ `raw-button-bg` → opening-tag form | S | **Done 2026-08-05**, re-frozen at **530**. The `=>` alternative in the new pattern is load-bearing, not tidiness: a plain `[^>]*` truncates at `onClick={() => …}`, which most raw buttons carry *before* their className, and that under-counts 244 against a true 530 — the one direction a ratchet must never be wrong in. Validated against a brace- and quote-aware mini-parser over the identical corpus: **0 missed, 0 extra**, and it needs no proximity window at all |
| ✅ `check:headers` sees delegated `<h1>` | S | **Done 2026-08-05.** It had TWO defects, not one: it walked `page.tsx` only, *and* its `/<h1[\s/>]/` ran per line, so `\s` had no newline to match and a bare `<h1` with attributes on following lines scored zero — **the shape `PageHeading` itself is written in**. Now starts at `page.tsx` *and* `layout.tsx` and follows route-local imports. The 3 evaders are named in a `KNOWN_DELEGATED` map that may only shrink, and a listed file that stops hand-rolling fails as a stale entry |
| ✅ `check:seo` covers non-marketing indexable routes | S | **Done 2026-08-05.** Every crawler-reachable page outside `(marketing)` must now declare intent — advertised, or `index:false`. Silence fails; noindex *and* advertised fails as a contradiction. 47 checked, 158 skipped as private, 0 noise. Found one real defect on its first run: `/spaces/operating` gates by **scoping rather than redirecting**, so an anonymous crawler got a 200 and an empty operator hub |
| ✅ **`PW_STORAGE_STATE`** | S | **Built 2026-08-05 (ADR-950).** Was the top of this queue. Two halves: the harness now ANNOUNCES an unphotographed shell (no credential needed — see below), and `pnpm e2e:session` mints a member session per run from the service-role key, the same `generateLink` + `verifyOtp` pair `impersonate-actions.ts` uses. 🔴 Owner action remaining: create the e2e member account and add three repo secrets |
| 🔴 First member-shell baselines | S | The four shell surfaces have **never had a PNG**. `e2e-manual.yml` gained `capture_shell` (default OFF) so the first capture is chosen, not sprung: `capture_shell + update_baselines` writes 12 new files (16 with `PW_SPACE_SLUG`), then `capture_shell + update_a11y` seeds their a11y counts before a PR run meets `$defaultMax: 0` |
| `PW_REQUIRE_SHELL=1` | XS | The ratchet. Before the credential, a zero-app-surface run announces; after it, the same run fails, so an expiring credential cannot silently re-open the blind spot |
| `pr-compare` required | XS | Approved (ADR-948) — but **strictly after** the four rows above. Required-and-blind is worse than advisory-and-blind: it turns a known gap into a merge gate asserting the shell is fine |

**Sequencing note.** Every sweep after this point is measured by these instruments. Fixing them
first is not overhead — a sweep verified by a gate that cannot see its subject produces a number,
not a result, and this document already carries seven baselines that had to be rebased rather than
earned once `check:adoption` learned to ignore comments.
