# Production → DAWN handoff — the divergence round (2026-08-19)

> **▶ ONE STEP, AND ONLY THE OWNER CAN TAKE IT. Give DAWN this file and say:**
>
> *"Apply `HANDOFF-TO-DAWN-2026-08-19.md`: §2 + §4 → `tokens/colors.css`, §5 → `tokens/skins.css`
> (both modes), §6 → `tokens/spacing.css` + the skin radii, §7 → `tokens/effects.css`, §8 →
> `tokens/typography.css`. Sweep §9's twelve files. Fix §10 in `ui_kits/app/nav-rail.jsx` +
> `readme.md`. Regenerate the reference cards. Answer §11 with a `/the-community` reference frame,
> desktop and mobile. Then reply through `design_handoff/CHANGES.md`, answering §12's trip rows and
> §13's budget rows — a change, a reasoned decline, or a question back; 'not addressed this round'
> is legal, silence is not."*
>
> 🔴 **Strike `--color-text-on-primary` from any older sheet before applying it (§3).** Production
> and DAWN agree on `#FFFFFF` in both modes; re-applying the old row would reintroduce the exact AA
> failure the rank-glyph split fixed.
>
> Nothing in this repo can perform the send. DAWN is an external Claude Design project and
> [`README.md`](README.md)'s copy-the-bundle loop is owner-mediated in both directions. The round is
> tracked as `LIVE-027` in [`BUILD-BACKLOG.json`](../docs/BUILD-BACKLOG.json) and closes when a
> `CHANGES.md` reply references this handoff. Re-measured 2026-08-24: the five correction rows in §2
> still diverge and §3 still agrees, so this document is current as written.

> **Direction: reversed.** The repo is the source of truth for everything in this
> document. `SYNC.md` § "Going the other way" requires that when production moves
> ahead of DAWN, the differences travel back on the next round — this is that round.
> The owner's ask: **"Sync everything. Find all the conflicts."** Every divergence
> between `app/globals.css` and DAWN's artifact is listed, with both values, which
> side is right, and what DAWN must change.
>
> **Two sources feed this doc, one of them machine-checked.** The colour rows in
> §2–§4 are derived by `lib/theme/dawn-divergence.test.ts` from both stylesheets on
> every `pnpm test` (5 tests, green 2026-08-19) and mirrored in
> [`PROD-AHEAD.md`](PROD-AHEAD.md), which the test also checks. The skin, feel,
> effect, copy and kit-mirror rows (§5–§10) were derived by hand this round by
> diffing the same files; they are the part a colour-token test cannot see.
>
> Work status lives in `docs/BUILD-BACKLOG.json` (LIVE-027, OWN-019), never here.

Legend: ⚠️ correction (DAWN's value is wrong) · 🆕 addition (DAWN has no row) ·
🔴 do not apply / stale claim · ⏳ open question or missing data

---

## 1. The answer, first

| # | Area | Count | What DAWN must do |
|---|---|---|---|
| 1 | Colour tokens, corrections (§2) | 6 rows | Replace the values in `dawn/tokens/colors.css` |
| 2 | Colour tokens, structure (§2) | 2 rows | Alias `--color-surface-post` to the surface token |
| 3 | 🔴 The row that must NOT be applied (§3) | 1 row | Strike `--color-text-on-primary` from any older sheet |
| 4 | Colour tokens, additions (§4) | 12 rows | Add to `colors.css` as new rows |
| 5 | Midnight skin (§5) | 8 rows | Correct `dawn/tokens/skins.css`, both modes |
| 6 | Feel tokens — radius roles (§6) | 4 rows | Correct `dawn/tokens/spacing.css` + the skin radii |
| 7 | Effects — the focus ring (§7) | 3 changes | Correct `dawn/tokens/effects.css` |
| 8 | Type ladder additions (§8) | 8 rows | Add to `dawn/tokens/typography.css` |
| 9 | Stale September-1 / beta-grace copy (§9) | 12 files | Retire the claims — ADR-1087 removed the window |
| 10 | Funnels rename residue (§9) | naming | "Beta induction" → Funnel induction, front door `/join` (ADR-1090) |
| 11 | Kit mirrors — nav rail (§10) | 5 fixes | `ui_kits/app/nav-rail.jsx` + `readme.md` |
| 12 | ⏳ THE ASK — `/the-community` reference frame (§11) | 1 page | The one marketing route with no DAWN frame (OWN-019) |

Regenerate the Design System reference cards after §2–§8 land so review reflects
production, exactly as the 2026-08-03 round did.

---

## 2. Colour tokens — corrections (⚠️ DAWN's value is wrong, production's is right)

Replace these values in `dawn/tokens/colors.css`. Every one was measured, not preferred.
These are the three prod-ahead tokens LIVE-027 has held open since 2026-08-05, plus a
rounding step and an aliasing decision.

| Token | Mode | DAWN | Production | Why production is right |
| :--- | :--- | :--- | :--- | :--- |
| `--color-focus-ring` | light | `#E2912F` | `#B86A15` | ⚠️ PR #2036 took the ring from **1.75:1 to 3.87:1** against the canvas. DAWN's value is the brand amber, and a focus ring has to be seen, not matched. Dark mode already agrees (`#F2B14E`). |
| `--color-text-on-broadcast` | light | `#FFFFFF` | `#1A1206` | ⚠️ White on the broadcast cyan fails AA. Warm ink passes. |
| `--color-text-on-broadcast` | dark | `#FFFFFF` | `#1A1206` | ⚠️ Same fill, same failure. The broadcast family is fixed across modes. |
| `--color-text-subtle` | light | `#8F8675` | `#6E6558` | ⚠️ The contrast sweep darkened the quietest text step. |
| `--color-text-subtle` | dark | `#7E735F` | `#A2957D` | ⚠️ Same sweep, lightened on the espresso ground. |
| `--color-primary-strong` | light | `#9A5E12` | `#965C12` | One rounding step, kept because the sweep measured this one. Low stakes; take ours so the files stop differing. |

**Structure — a decision about how the token resolves, not a retune:**

| Token | Mode | DAWN | Production | Why |
| :--- | :--- | :--- | :--- | :--- |
| `--color-surface-post` | light | `#F7F5F0` | `var(--color-surface)` | The post surface follows the surface token instead of holding its own hex, so a skin that moves one moves both. Renders identically today. |
| `--color-surface-post` | dark | `#2B2415` | `var(--color-surface)` | Same decision, dark side. |

## 3. 🔴 Do not apply: the stale row older documents still carry

An older prod-ahead list (UX-MATURITY-PLAN Addendum 2026-08-05 §4 finding 3) named a
fourth token: `--color-text-on-primary` — DAWN `#FFFFFF`, production `#1A1206`.
**That has not been true since 2026-08-06.** Both projects hold `#FFFFFF` in both
modes today (verified in both files 2026-08-19). What happened was a **split**, not a
revert: while on-primary was ink, every rank core inherited an ink glyph and gold —
the lightest core by design — fell to 2.46:1. The glyph moved to its own token
(`--color-text-on-rank`, §4) and the button label went back to white. Applying the
old row would reintroduce the exact AA failure the split fixed. If any DAWN-side note
still carries it, strike it.

**One place this bites in this bundle:** `dawn/tokens/skins.css` Midnight **dark**
still holds `--color-text-on-primary: #1A1206`. Production is `#FFFFFF` there too —
see §5. Same law, one more file.

## 4. Colour tokens — additions (🆕 production has them, DAWN has no row)

Add as new rows, not corrections. Values are production's.

| Token | Light | Dark | What it is |
| :--- | :--- | :--- | :--- |
| `--color-text-on-rank` | `#1A1206` | inherits | The glyph on a **rank core**, decoupled from the button label. See §3 for why it exists. Fixed across skins. |
| `--color-chrome-hover` | `#FFFFFF` | `#2B2415` | Hover ground for the app frame (top bar, rails, menus), which sits a step down from the canvas. |
| `--color-text-on-danger` | `#FFFFFF` | `#1A1206` | Label on a solid semantic fill. Split from `--color-text-on-primary` because one shared token cannot serve both: ink on the light danger red is 3.31, sub-AA. |
| `--color-text-on-warning` | `#1A1206` | `#1A1206` | Same split. Ink is what passes on the light warning yellow. |
| `--color-text-on-success` | `#FFFFFF` | `#1A1206` | Same split. |
| `--color-on-media` | `var(--color-on-media-light)` | — | Text over **member photography** (profile / space / event covers). The live value, flipped per photo by the content-aware hero (ADR-830). |
| `--color-on-media-light` | `var(--color-on-ink)` | — | The light copy, for dark imagery. |
| `--color-on-media-dark` | `var(--color-ink)` | — | The dark copy, for bright imagery. |

The `on-media` family follows the **image**, not the theme, which is why it aliases
rather than holding hexes. That distinction is the point of the tokens; carry the
comment with them.

## 5. The Midnight skin — `dawn/tokens/skins.css` corrections

The colour test only derives `:root`/`.dark`; these were diffed by hand against
`app/globals.css`'s `[data-skin="midnight"]` blocks. The same three laws from §2
apply inside the skin, plus the radius correction from §6.

| Token | Skin mode | DAWN | Production | Why |
| :--- | :--- | :--- | :--- | :--- |
| `--color-focus-ring` | midnight light | `#D9852A` | `#B86A15` | ⚠️ The §2 AA fix carries into the skin. DAWN's comment says "focus follows primary"; production's ring is a contrast value, not a brand value. Midnight dark already agrees (`#F0AD4E`). |
| `--color-text-subtle` | midnight light | `#6E7A91` | `#5B6576` | ⚠️ The contrast sweep, cool side. |
| `--color-text-subtle` | midnight dark | `#6B7689` | `#8D9AB0` | ⚠️ Same sweep, lightened on the deep slate. |
| `--color-text-on-primary` | midnight dark | `#1A1206` | `#FFFFFF` | ⚠️ The §3 split: on-primary is white everywhere; rank glyphs carry the ink via `--color-text-on-rank`. |
| `--color-surface-post` | both | hexes | `var(--color-surface)` | The §2 aliasing decision, applied in the skin too. |
| `--color-chrome-hover` | midnight light | 🆕 none | `#FFFFFF` | The §4 addition has skin values. |
| `--color-chrome-hover` | midnight dark | 🆕 none | `#1F2736` | Same. |
| dark selector | — | `[data-skin="midnight"][data-mode="dark"], .dark [data-skin="midnight"]` | `.dark[data-skin="midnight"], .dark [data-skin="midnight"]` | ⚠️ There is no `data-mode` attribute anywhere in production. The second form exists because the skin can land on `<html>` itself (the preview script / e2e stamp), i.e. the SAME element that carries `.dark`. |

## 6. Feel tokens — the radius roles moved (owner decision, 2026-08-10)

DAWN's `spacing.css` still carries the 2026-08-03 values. Production re-seated the
role tokens on the step scale ("the roles follow the steps"): the old values made
adopting `rounded-control`/`rounded-card` a REGRESSION on components that already sat
on the steps, so the ratchet was punishing adoption.

| Token | Scope | DAWN | Production | Note |
| :--- | :--- | :--- | :--- | :--- |
| `--radius-control` | base | `0.5rem` (8px) | **`14px`** | = `--radius-lg` / `rounded-lg` |
| `--radius-card` | base | `1rem` (16px) | **`24px`** | = `--radius-2xl` / `rounded-2xl` |
| `--radius-control` | midnight (both modes) | `0.375rem` | **`11px`** | Kept its 0.75× multiplier of the base, so no design relationship changed |
| `--radius-card` | midnight (both modes) | `0.625rem` | **`15px`** | Kept its 0.63× multiplier |

`--radius-pill`, the step scale, motion durations, easings, `--density-root`, all
shadows (`--shadow-2xs` … `--shadow-menu`) and the text-shadow presets were verified
value-identical — no action.

## 7. Effects — the focus ring itself changed shape (PR #2036, 2026-08-10)

`dawn/tokens/effects.css` still ships the 2026-08-03 ring. Three corrections,
value-for-value per SYNC.md's effects row:

1. **The ring is SOLID now.** `box-shadow: 0 0 0 3px var(--color-focus-ring)` — the
   45% `color-mix` thinning was the actual AA defect, not just the hue: pure black at
   45% over white tops out at 3.35:1, so **no colour choice could rescue a 45% ring**.
   Solid, the tokens measure 3.87:1 light / 4.11:1 dark.
2. **Text fields lost the "calmer neutral ring".** The split treatment DAWN documents
   (inputs on `--color-border-strong` at 60%) is retired; `input`/`textarea` get the
   same solid `--color-focus-ring` ring. One ring, one token, everywhere.
3. **The selector grew:** `:where(button, a, select, summary, [tabindex]:not([tabindex="-1"])):focus-visible`.
   `summary` is natively focusable and never matched the `[tabindex]` branch — 30
   disclosure controls painted nothing on focus; and `[tabindex="-1"]` (programmatic
   focus targets) is excluded on purpose.

The three opt-outs (composer textarea, header wordmark, admin command-bar search)
still stand.

## 8. Typography — 🆕 ladder steps production added (DAWN has no row)

The 2026-08-03 base ladder is unchanged; production wrapped every step in a
`--type-scale` multiplier (the generation/feel axis) and added fixed steps. Add as
new rows in `typography.css`:

| Token | Value | What it is |
| :--- | :--- | :--- |
| `--text-display-poster` | `2.25rem` | Print/poster display step (fits `--text-display-h3`'s ceiling on A4) |
| `--text-stat-md` | `2.25rem` | Fixed stat step below the hero numeral (ADR-947) |
| `--text-stat-sm` | `1.875rem` | The smaller fixed stat step |
| `--text-page-title-lg` | `clamp(1.5rem, 4vw, 2.25rem)` | The large page-title variant |
| `--text-*--line-height` companions | see `app/globals.css` | Each display/stat step now carries its own line-height token |

Production also multiplies every display/stat/page step by `var(--type-scale, 1)` —
model it if DAWN documents the generation axis; the resolved DAWN-baseline values are
unchanged.

## 9. 🔴 Claims in DAWN's artifact that expired this week

Two decisions landed 2026-08-19 and DAWN's copy now asserts things production no
longer does. These are conflicts exactly like a wrong hex — the next inbound round,
applied faithfully, would put stale claims back on real screens.

### 9a. ADR-1087 — the beta grace window is REMOVED (applied to production 2026-08-19)

`pricing_settings.beta_grace` is `{"until": null}` and `featureGatesLive()` is true:
**the free allowances count NOW, meters and paid gates are armed NOW.** September 1
is no longer a switch date for anything (the automatic Founding-badge grant ended
with the window too). The beta *program* ("Summer of Frequency", access framing) is
still real; what is wrong is every "free until / starts counting September 1" claim.
Files in this bundle that carry one:

| File | Stale claim |
| :--- | :--- |
| `dawn/readme.md` (≈line 46) | "the paid meters do not bite until graduation on September 1, 2026" |
| `dawn/readme.md` (≈line 484) | "September 1 2026 is when the free allowances start counting (`beta_grace` ends)" |
| `dawn/templates/app-shell/AppShell.dc.html` | banner: "free allowances only start counting after that" |
| `dawn/ui_kits/app/index.html` | same banner |
| `dawn/ui_kits/screens/space-console.html` | GateNotice "The free allowances start counting September 1" |
| `dawn/ui_kits/screens/settings.html` | GateNotice "Everything is open until September 1" |
| `dawn/ui_kits/screens/event.html` | GateNotice "Paid passes turn on September 1" — they are on now |
| `dawn/ui_kits/screens/admin-dashboard.html` | "September 1" countdown eyebrow |
| `dawn/ui_kits/marketing/pricing.html` (2 places) | "Allowances start counting September 1, 2026" + the FAQ row |
| `dawn/components/kit/GateNotice.d.ts` | "`gated` — turns on at a known moment (September 1 graduation)" |
| `dawn/components/kit/GateNotice.prompt.md` | "Memberships are free through September 1 … the button just does not charge anybody yet" — billing has charged since 2026-07-25 and gates are live |

Production's `components/ui/gate-notice.tsx` is the reference for the replacement
copy: no dates, no countdowns ("This opens later. It comes with graduation or a plan
step. Everything you have now keeps working."). Note the `preview` kind itself is
now largely historical — with gates live, "visible and free while billing is off"
describes almost nothing; prefer `gated`/`dormant` in new screens.

*Not a conflict:* `housing.html`'s "Available September 1 · 6 month minimum" is a
sample listing date, not a beta claim. Leave it.

### 9b. ADR-1090 — the sign-up feature is named **Funnels** and lives at **/join**

The "beta induction" name is retired for the machinery: the flow is the **Funnel
induction**, the feature is **Funnels**, one of them is **a Funnel**, and the routes
moved `/onboarding/beta` → `/join`, `/beta/<slug>` → `/join/<slug>` (308s cover the
old links). `/beta` itself still serves the Beta *program* page. In this bundle:

- `dawn/components/core/Button.prompt.md` already points at `/join` — ✅ correct, keep.
- `dawn/ui_kits/marketing/beta.jsx`'s header comment ("the beta induction 'Oath'…")
  and any prose that names "the beta induction" should say **Funnel induction**. The
  Oath itself was reworked by ADR-1088 (no founding-cohort ceremony).
- No `/onboarding/beta` or `/beta/<slug>` hrefs exist in the bundle — nothing to fix
  there.

### 9c. `dawn/readme.md` internal drift

- Lists `stories.html` among `ui_kits/marketing/` — **the file is not in the bundle.**
  Ship it or strike the line.
- "the Opening Beta rate closed on 2026-08-17" — ✅ still true, keep.

## 10. Kit mirrors — `ui_kits/app/nav-rail.jsx` vs `lib/nav-areas.ts` + `nav-icons.ts`

The rail mirror is built from the two files SYNC.md names, and both moved:

| # | In the mirror | Production | Verdict |
|---|---|---|---|
| 1 | `vault` icon `'gem'` | `AREA_ICONS.vault = Vault` | ⚠️ Your 2026-08-03 open question #1 ("Keep Gem or finish the swap?") was answered: the swap to **Vault** landed. Update the mirror. |
| 2 | `journal` row in The Quest group | `railHidden` since the 2026-08-06 regroup — Journal renders in My Frequency, filed under "You" | ⚠️ Production followed DAWN's OWN `chrome-docks.card.html` (and `docks.jsx` line 117, which already has it right). Drop the rail row; the mirror contradicts the guideline beside it. |
| 3 | `connections` ("My Contacts") row in the rail | `railHidden` — it is a tab of the Members hub; the rail row lit two locations for one page | ⚠️ Drop the rail row. |
| 4 | id `broadcast` for "Around You" | key `nearby`, route `/nearby` (ADR-1020 retired the "broadcast" route name; label unchanged) | Minor: rename the id so greps line up. Label + megaphone glyph are ✅ correct. |
| 5 | Admin group: Dashboard → Leadership → Programs → Growth → Resonance CRM → Vera AI → QR Studio → Manage Spaces | Production order inserts **Community** (after Dashboard) and **Operations** + **Loom Studio** (after Vera AI), and ends … Manage Spaces → Market admin | ⚠️ The mirror shows a janitor's rail; a janitor sees those rows. Add them or note the elision. |

Verified ✅ this round, no action: the reaction row (`feed.jsx` matches
`lib/feed/reactions.ts` — six emoji, medium-tan modifiers, zap math), the docks
grouping, section labels and order otherwise, `.press`/`.dimmed`, shadows, motion.

## 11. ⏳ THE ASK — a reference frame for `/the-community` (OWN-019)

**The one marketing route with no DAWN frame**, and it blocks Lift 5b's template
regeneration for that page (the mapped order: about → the-lab → the-quest → spaces →
**the-community** → home → pricing; everything before it has a frame — `about.html`,
`lab.html`, `quest.html`, `circles.html`, `index.html`, `pricing.html`).

What the production page is today (`app/(marketing)/the-community/page.tsx`, 635
lines + a 389-line interactive product tour), so the frame answers the right brief:

- **Title/intent:** "What is a Circle? Community with a shape" — the Community
  Collective explainer. A stranger's second click from the splash.
- **Anatomy:** PhotoHero → the four **Pillars** (Mind / Body / Spirit / Expression,
  `PillarNav`) → ZigZag editorial beats on what a Circle / Hub / the ladder is →
  Statement + Marquee → an interactive **product tour** (`tour.tsx`) → FAQ
  (FAQPage JSON-LD) → BetaCTA close (CTA href is `/join` now).
- **Voice guardrails:** NAMING.md ladder (Circle → Hub → Nexus → Outpost → Frequency
  Lab; "Circles never meet in Outposts"), no em dashes, member price comes from the
  pricing ladder (never a typed "$0").
- **Mobile:** per standing rule 2, the frame must come with a **mobile reference
  frame**, not a description — this page is a long editorial scroll and the ZigZag /
  tour behavior on a phone is the part nobody has decided yet.
- **Perf constraint:** `/the-community` has **no vitals samples in the 28-day
  window** (below the traffic floor), so no 🔴 constraint is stated for it — but its
  siblings' LCPs in §13 are a warning: photography-led marketing pages are failing
  LCP across the board. The frame should assume ONE hero image request above the
  fold, nothing else.

## 12. What users tripped on (standing rule 1)

**No moderated round has run yet.** The protocol that will produce the trip table is
[`docs/research/PROTOCOL.md`](../docs/research/PROTOCOL.md); recruiting is the 🔴
owner action in UX-MATURITY-PLAN Lift 1b. This heading is never omitted: silence is
not evidence.

## 13. Vitals vs budget (standing rule 1)

Measured **2026-08-19** from production `interaction_events` (`kind='web_vital'`),
trailing 28 days, p75, scored by `lib/analytics/vitals-budgets.ts` (marketing LCP
2.0s / app+operator 2.5s; INP 200ms, operator 300ms; CLS 0.1; ⚠️ = within 10% of the
ceiling; ⏳ = fewer than 5 samples). Worst-first within class.

**Marketing (public, anonymous, indexed):**

| Route | LCP p75 | INP p75 | CLS p75 |
| :--- | :--- | :--- | :--- |
| `/spaces/danieltyack` | 🔴 6.32s (6) | ⚠️ 190ms (8) | 🔴 0.222 (7) |
| `/events/:id` | 🔴 5.90s (9) | 🔴 202ms (10) | ✅ 0.071 (13) |
| `/spaces/directory` | 🔴 3.72s (6) | 🔴 390ms (8) | ⚠️ 0.091 (7) |
| `/` (splash) | 🔴 3.31s (82) | ✅ 110ms (63) | ✅ 0.017 (49) |
| `/onboarding/beta` → now `/join` | 🔴 2.67s (13) | ✅ 120ms (7) | ✅ 0.000 (10) |
| `/discover` | 🔴 2.06s (5) | ⏳ 600ms (4) | ✅ 0.002 (5) |
| `/beta/personal` → now `/join/personal` | ✅ 1.73s (6) | — | ✅ 0.000 (6) |
| `/sign-in` | ✅ 1.28s (8) | ✅ 40ms (5) | ✅ 0.000 (10) |
| `/the-community` (this round's ask) | ⏳ no samples | ⏳ | ⏳ |

**App shell (signed in):**

| Route | LCP p75 | INP p75 | CLS p75 |
| :--- | :--- | :--- | :--- |
| `/feed` | 🔴 5.18s (108) | 🔴 240ms (131) | 🔴 0.232 (89) |
| `/circles/mindless` | 🔴 5.32s (5) | ⚠️ 180ms (7) | 🔴 0.129 (6) |
| `/nearby` | 🔴 4.88s (13) | ⚠️ 190ms (16) | 🔴 0.103 (18) |
| `/circles` | 🔴 4.68s (5) | ✅ 140ms (12) | 🔴 0.154 (5) |
| `/connections/:id` | ⏳ (4) | ✅ 110ms (5) | ⏳ (4) |
| `/settings`, `/market`, `/events` | ⏳ | ⏳ | ⏳ |

**Operator consoles:** `/admin/crm`, `/admin/menu`, `/admin/pricing` — all ⏳ (4
samples each; for the record their raw p75s would read 🔴 on LCP and `/admin/menu`
CLS 0.622).

**Stated constraints per the standing rule:** no surface THIS round redesigns has a
🔴 (the round is tokens + copy + one net-new frame with no samples). But the pattern
is loud: **every measured marketing page except sign-in fails LCP**, and `/feed`
fails all three. Those are repo-side perf tasks, not DAWN asks — recorded here so
the two-consecutive-🔴 rule has its first week on the books. The one DAWN-side
consequence is the §11 constraint: new marketing frames must be light by design.

## 14. Mobile behavior (standing rule 2)

Per screen this round touches, explicitly:

- **Token / skin / effect corrections (§2–§8): mobile unchanged.** Value-for-value
  edits; no breakpoint, layout, or interaction changes on any screen.
- **Copy retirements (§9): mobile unchanged.** Same banners and notices, honest words.
- **Nav-rail mirror fixes (§10): mobile unchanged** — the rows in question are
  desktop-rail rows; the phone overlay menu derives from the same list and simply
  loses the same two rows.
- **`/the-community` (§11): mobile is the open half of the ask** — the frame must
  name the breakpoint and what moves (ZigZag stacking order, tour behavior), not
  "it reflows".

## 15. Ratchet check (standing rule 3)

**No adoption count rises.** This round changes token values, copy, and DAWN-side
mirrors only; no repo component gains a literal radius, shadow, white/black literal,
ad-hoc progress bar, bespoke card/row, or hand-rolled tab. Adopting the §6 radius
values is what KEEPS the ratchet honest (the 2026-08-10 correction exists because the
old role values made adoption a visual regression). Nothing here needs an allowlist
entry or a baseline change.

---

## 16. How to apply (for Claude Design)

1. Apply §2 + §4 to `tokens/colors.css`, §5 to `tokens/skins.css` (both modes).
2. Apply §6 to `tokens/spacing.css` (and the skin radii), §7 to `tokens/effects.css`,
   §8 to `tokens/typography.css`.
3. Sweep §9's twelve files for the September-1 / beta-grace claims and the "beta
   induction" name; production's `gate-notice.tsx` has the replacement copy shapes.
4. Fix §10 in `ui_kits/app/nav-rail.jsx` and `readme.md`.
5. Regenerate the reference cards.
6. Answer §11 with a `/the-community` frame (desktop + mobile), which unblocks
   Lift 5b's conversion order.
7. Reply through `design_handoff/CHANGES.md` as usual — and per standing rule 1,
   answer §13's rows (a design change, a reasoned decline, or a question back;
   "not addressed this round" is legal, silence is not).
