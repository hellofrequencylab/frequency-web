# Site Re-Theme Plan — every surface unified, one parent to change

> ⚠️ **Historical sequencing (2026-07-18).** The near-term order of operations now lives in [UX-MATURITY-PLAN.md](UX-MATURITY-PLAN.md) §Sequencing ([ADR-925](DECISIONS.md)) interleaved with the DAWN rounds (`design_handoff/SYNC.md`); this doc remains the phase-detail reference for the re-theme (P1–P8) linked from [BUILD-LIST.md](BUILD-LIST.md).

> **The goal.** Any look change (a color, a corner radius, a heading font, a header, a card, a line of
> copy) is a **single edit to a parent**, and the change reaches **every surface** with no drift. This is
> the execution roadmap that finishes the [THEME-PROTOCOL](THEME-PROTOCOL.md) — it turns "mostly
> parent-driven" into "fully parent-driven," phase by phase, each shippable on its own.
>
> **Decision record:** [ADR-781](DECISIONS.md) (the protocol). **Legend:** ✅ done · ⏳ in flight · 📋 planned.
> **Lift:** S ≈ 1 day · M ≈ 2–4 days · L ≈ 1–2 weeks. Numbers below were measured from the codebase **on 2026-07-18**.

> ⚠️ **The numbers in this doc are from 2026-07-18 and three of them are off by an order of
> magnitude. Re-derived 2026-08-11; corrections are inline below.** Re-derive before quoting:
> `node scripts/check-adoption.mjs` is the live scoreboard.
>
> | Figure this doc quotes | Live 2026-08-11 | How |
> | :--- | ---: | :--- |
> | `4,722` literal `rounded-*` | **2,450** | `check:adoption` → `literal-radius`, `✅ held`, frozen 2026-08-06 `lowered` |
> | `1,000` `rounded-full` | **1** | `git ls-files 'app/**/*.tsx' 'components/**/*.tsx' 'lib/**/*.tsx' \| xargs rg -o --no-filename 'rounded-full' \| wc -l`. The codemod ran; `rounded-full` → `rounded-pill` is done |
> | `~18` raw `<button bg-primary>` | **526** | `check:adoption` → `raw-button-bg`. Off by ~29×, and in the direction that under-scopes P3 |

---

## Where we are (grounded, 2026-07-18)

| Layer | Parent-driven today? | The gap |
|---|---|---|
| **Color** | ✅ fully (one `globals.css` edit) | none — enforced by `check:tokens` |
| **Headers** | ✅ one `PageHero` for browse/commerce | entity pages (DetailTemplate) not yet folded in |
| **Layout / Menu** | ✅ single-source engines | none |
| **Radius** | ⏳ **partly** (was 🔴 "not at all") | ~~4,722~~ → **2,450** literal `rounded-2xl/xl/lg` + ~~1,000~~ → **1** `rounded-full`; ~~**0** use the `rounded-card/control/pill` tokens~~ → **1,719 role usages** and the roles are re-anchored to the steps (`--radius-control` 14px, `--radius-card` 24px, `app/globals.css:195-197`, #2077) |
| **Type / weight** | ⚠️ partial | heading weight/line-height/letter-spacing are raw values in base CSS; no locked scale contract |
| **Controls / cards** | ⚠️ mostly | 590 `EntityCard/StatCard/PersonCard` (good) but ~~~18~~ **526** raw styled buttons (ratchet `raw-button-bg`) + hand-rolled cards. ⚠️ Note the ratchet counts opening tags carrying a background, not literally `<button bg-primary>` |
| **Browse heroes** | ⚠️ partial | 7 of 31 `IndexTemplate` pages use the hero band; 24 are still plain |
| **Copy** | ⚠️ shallow | `page_content` is header-only, opt-in, no cascade; body copy hardcoded |
| **Per-Space theming** | ⚠️ accent-only | skin/accent/page-theme ship but the override surface is deliberately narrow |

The re-theme closes every 🔴/⚠️ above.

---

## The phases

| Phase | Goal — what gets unified | Lift | After it ships, to change X you edit… | Depends on |
|---|---|---|---|---|
| **P0** ✅ | Headers behind one `PageHero` + `check:tokens`/`check:headers` gates + the protocol doc | — | `PageHero` / a `globals.css` token | — |
| **P1** | **Radius tokens.** ⏳ **The codemod SHIPPED** (`ecd8f52`): `rounded-full` → `rounded-pill` site-wide plus role adoption. ~~4,722~~ → **2,450** literal `rounded-2xl/xl/lg`, ~~1,000~~ → **1** `rounded-full`, **1,719** role usages. **Still open:** `check:tokens` has zero occurrences of `rounded`, so the `literal-radius` ratchet holds the line instead of a gate. Per [`DAWN-CONVERSION.md`](DAWN-CONVERSION.md) §Phase 5, spend the remaining 2,450 **inside screen passes, never as its own wave** | ~~L~~ **M** | `--radius-card/control/pill` (one line → every corner) | — |
| **P2** | **Type + weight contract.** Move raw heading weight/line-height/letter-spacing into tokens; lock the named type scale as the contract every surface uses | **M** | `--font-display`/`--font-body` + the weight/scale tokens | — |
| **P3** | **Control + card consolidation.** Migrate the ~~~18~~ **526** raw styled buttons → `Button` (ratchet `raw-button-bg`); fold hand-rolled cards → `EntityCard`/`ModuleCard`; unify badges + empties; add a lint flagging a raw styled `<button>`/card. ⚠️ **The card half needs a triage pass first**: `bespoke-cards` (24) and `bespoke-rows` (14) are filename heuristics whose population is largely action clusters, not cards ([`BUILD-LIST.md`](BUILD-LIST.md) §"Needs a triage pass") | ~~M~~ **L** | `Button` / `EntityCard` (one component → every instance) | — |
| **P4** | **Every browse surface gets the hero band.** The 24 plain `IndexTemplate` pages adopt `heroOverlay` (with section-default covers), so the hero is universal | **M** | `PageHero` covers all browse pages | P0 |
| **P5** | **Entity headers → `PageHero`.** Fold the 43 `DetailTemplate` pages' band onto the one `PageHero` grammar (cover · avatar · title · badges · tabs), so entity + index headers are literally one component | **M–L** | `PageHero` (one component → every header) | P4 |
| **P6** | **Copy cascade.** Generalize `page_content` into a `site → section → page` inherit-cascade; widen editable fields to body copy + images; extend `check:canon` to `.tsx` strings | **L** | the global/section content row (words + images, operator-editable) | — |
| **P7** | **Per-Space / white-label depth.** Widen the child-theme override surface beyond accent (surfaces + type), add operator theme controls + a **theme-contract** compile check (a canonical token list every theme must fill) | **L** | a Space's theme (or the site theme) via an operator control | P1–P3 |
| **P8** | **Dark-mode + a11y + visual regression.** Contrast/dark audit across the newly-tokenized surfaces; add visual-regression snapshots so a parent edit can't silently break a surface | **M–L** | (safety net — a bad token change fails CI, not prod) | P1–P5 |
| **P9** | **Marketing ↔ in-app reconciliation** (optional). Align the marketing brand system (`PhotoHero`, `marketing-ui`) with the app tokens where they diverge; keep the intentional brand parts | **M** | one token set spans marketing + app | P1–P2 |

**Total lift:** roughly **6–9 weeks** of focused work, fully parallelizable across phases with no hard chain except P4→P5 and P1–P3→P7. P1 (radius) is the single biggest unifier and the biggest diff.

---

## Sequencing recommendation

1. **P1 + P2 + P3 first** (the token foundation) — they are independent, together they make *style* fully
   parent-driven, and every later phase is cleaner on top of them. ~~P1 is the heavy one (a codemod over
   ~5,700 sites); do it as one reviewed mechanical sweep~~ ⏳ **The P1 codemod already ran** (`ecd8f52`);
   what is left of P1 is the 2,450-site residue, and `DAWN-CONVERSION` §Phase 5 says to spend it inside
   screen passes rather than as one sweep. **P3 is now the heavy one** at 526 sites.
2. **P4 then P5** (finish the header unification) — visible, low-risk, closes the structure layer.
3. **P6** (copy cascade) — the content half; the biggest *new* system, best done once style is stable.
4. **P7 + P8** (operator theming + safety net) — turns the whole thing into a control a non-engineer uses,
   with visual regression so a site-wide edit is provably safe.
5. **P9** last / optional.

---

## Best-practice guardrails (carried through every phase)

- **One canonical component/token per thing** — never a per-page copy. New drift fails a CI gate, not a
  future audit (`check:tokens`, `check:headers`, `check:menu`, + the P1 radius rule + the P7 theme-contract).
- **Codemods over hand-edits** for the mechanical sweeps (P1/P3) — deterministic, reviewable, reversible.
- **Editor + renderer share one resolver** so an operator's preview never diverges from what ships.
- **Every phase is additive + independently shippable** — no big-bang rewrite; each merges on its own.

---

## Definition of done (the whole re-theme)

A non-engineer can change the site's color, radius, heading font, header look, card style, or a page's
copy from **one control or one file**, and it reaches **every surface**, in light and dark, provably (a
visual-regression + the CI gates), with **no way to hand-roll around it**.

---

*Owner: Daniel (Vision Steward). Created 2026-07-18. Tracked in [BUILD-LIST.md](BUILD-LIST.md); protocol in [THEME-PROTOCOL.md](THEME-PROTOCOL.md).*
