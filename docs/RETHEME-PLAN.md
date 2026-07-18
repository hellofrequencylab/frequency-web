# Site Re-Theme Plan — every surface unified, one parent to change

> **The goal.** Any look change (a color, a corner radius, a heading font, a header, a card, a line of
> copy) is a **single edit to a parent**, and the change reaches **every surface** with no drift. This is
> the execution roadmap that finishes the [THEME-PROTOCOL](THEME-PROTOCOL.md) — it turns "mostly
> parent-driven" into "fully parent-driven," phase by phase, each shippable on its own.
>
> **Decision record:** [ADR-781](DECISIONS.md) (the protocol). **Legend:** ✅ done · ⏳ in flight · 📋 planned.
> **Lift:** S ≈ 1 day · M ≈ 2–4 days · L ≈ 1–2 weeks. Numbers below are measured from the codebase.

---

## Where we are (grounded, 2026-07-18)

| Layer | Parent-driven today? | The gap |
|---|---|---|
| **Color** | ✅ fully (one `globals.css` edit) | none — enforced by `check:tokens` |
| **Headers** | ✅ one `PageHero` for browse/commerce | entity pages (DetailTemplate) not yet folded in |
| **Layout / Menu** | ✅ single-source engines | none |
| **Radius** | 🔴 **not at all** | **4,722** literal `rounded-2xl/xl/lg` + **1,000** `rounded-full`; **0** use the `rounded-card/control/pill` tokens |
| **Type / weight** | ⚠️ partial | heading weight/line-height/letter-spacing are raw values in base CSS; no locked scale contract |
| **Controls / cards** | ⚠️ mostly | 590 `EntityCard/StatCard/PersonCard` (good) but ~18 raw `<button bg-primary>` + hand-rolled cards |
| **Browse heroes** | ⚠️ partial | 7 of 31 `IndexTemplate` pages use the hero band; 24 are still plain |
| **Copy** | ⚠️ shallow | `page_content` is header-only, opt-in, no cascade; body copy hardcoded |
| **Per-Space theming** | ⚠️ accent-only | skin/accent/page-theme ship but the override surface is deliberately narrow |

The re-theme closes every 🔴/⚠️ above.

---

## The phases

| Phase | Goal — what gets unified | Lift | After it ships, to change X you edit… | Depends on |
|---|---|---|---|---|
| **P0** ✅ | Headers behind one `PageHero` + `check:tokens`/`check:headers` gates + the protocol doc | — | `PageHero` / a `globals.css` token | — |
| **P1** | **Radius tokens.** Codemod the 4,722 literal `rounded-2xl/xl/lg` + 1,000 `rounded-full` to `rounded-card`/`rounded-control`/`rounded-pill` by role; extend `check:tokens` to flag literal `rounded-*` | **L** | `--radius-card/control/pill` (one line → every corner) | — |
| **P2** | **Type + weight contract.** Move raw heading weight/line-height/letter-spacing into tokens; lock the named type scale as the contract every surface uses | **M** | `--font-display`/`--font-body` + the weight/scale tokens | — |
| **P3** | **Control + card consolidation.** Migrate the ~18 raw `<button bg-primary>` → `Button`; fold hand-rolled cards → `EntityCard`/`ModuleCard`; unify badges + empties; add a lint flagging a raw styled `<button>`/card | **M** | `Button` / `EntityCard` (one component → every instance) | — |
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
   parent-driven, and every later phase is cleaner on top of them. P1 is the heavy one (a codemod over
   ~5,700 sites); do it as one reviewed mechanical sweep guarded by the extended `check:tokens`.
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
