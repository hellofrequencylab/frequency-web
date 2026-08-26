# Production ahead of DAWN — the standing outbound sheet

> **What this is.** The complete, current list of every colour token where `app/globals.css`
> disagrees with `design_handoff/dawn/tokens/colors.css`, with the reason production is right.
> `SYNC.md` § "Going the other way" requires these travel back on the next round; this is the sheet
> the outbound handoff copies. It holds no work status — that lives in
> [`docs/BUILD-BACKLOG.json`](../docs/BUILD-BACKLOG.json).
>
> **It is machine-checked.** `lib/theme/dawn-divergence.test.ts` derives the divergence set from
> both stylesheets on every `pnpm test` and fails if this sheet gains a stale row, misses a real
> one, or quotes a hex neither project holds. Do not hand-edit a value here: change the CSS, run the
> test, and it will tell you what this file should say.

Last derived **2026-08-19** against `app/globals.css` and DAWN's `tokens/colors.css` (5 tests
green). The outbound round that copies this sheet is
[`HANDOFF-TO-DAWN-2026-08-19.md`](HANDOFF-TO-DAWN-2026-08-19.md).

---

## 0. 🔴 READ FIRST — this sheet is derived from a bundle that is three weeks behind

**DAWN applied every correction in §2 and §3 on 2026-08-25. Do not send them again.**

`design_handoff/CHANGES.md` is the **2026-08-25** round and its §2 lists all five corrections plus
the aliasing decision as *applied, value for value*, along with the twelve additions from §5. The
vendored copy this sheet is derived from — `design_handoff/dawn/tokens/colors.css` — is still the
**2026-08-03** export. It was never re-copied, so it still holds the pre-correction values
(`--color-focus-ring: #E2912F`, and the rest).

That is why every row below still reads as open. **The rows are true about the file on disk and
false about DAWN.** The tables are kept, unchanged and machine-checked, because they are what the
divergence guard derives and compares — but the next outbound handoff must carry §0, not §2.

| | |
| :--- | :--- |
| **What is actually outstanding** | Nothing in §2 or §3. The plate divergence in §6a is, and it is new. |
| **Why the guard is green anyway** | `lib/theme/dawn-divergence.test.ts` asserts *found divergences == declared divergences*. Both sets are eight rows. Green means "they disagree in the ways we wrote down", never "they agree". |
| **What closes this** | Re-export `design_handoff/dawn/` from DAWN, then move `BUNDLE_ROUND` in `scripts/check-dawn-bundle.mjs`, the ledger in the divergence test, and this sheet, in one change. |
| **Who** | Owner — DAWN is an external Claude Design project and the bundle is copied by hand. Backlog row `LIVE-127`. |

`pnpm check:dawn-bundle` measures this gap and fails the moment the bundle is refreshed without the
three files above moving with it.

---

## 1. The answer, first

**Three AA fixes and one aliasing decision are waiting to go back, plus twelve tokens DAWN has no
row for at all.** A fourth row that four documents still carry — `--color-text-on-primary` — is
**stale and must not be sent**. See §4.

---

## 2. Corrections — DAWN's value is wrong, production's is right

Replace these values in `tokens/colors.css`. Every one was measured, not preferred.

| Token | Mode | DAWN | Production | Why production is right |
| :--- | :--- | :--- | :--- | :--- |
| `--color-focus-ring` | light | `#E2912F` | `#B86A15` | ⚠️ PR #2036 took the ring from **1.75:1 to 3.87:1** against the canvas. DAWN's value is the brand amber, and a focus ring has to be seen, not matched. Dark mode already agrees (`#F2B14E`). |
| `--color-text-on-broadcast` | light | `#FFFFFF` | `#1A1206` | ⚠️ White on the broadcast cyan fails AA. Warm ink passes. |
| `--color-text-on-broadcast` | dark | `#FFFFFF` | `#1A1206` | ⚠️ Same fill, same failure. The broadcast family is fixed across modes. |
| `--color-text-subtle` | light | `#8F8675` | `#6E6558` | ⚠️ The contrast sweep darkened the quietest text step. |
| `--color-text-subtle` | dark | `#7E735F` | `#A2957D` | ⚠️ Same sweep, lightened on the espresso ground. |
| `--color-primary-strong` | light | `#9A5E12` | `#965C12` | ✅ One rounding step, kept because the sweep measured this one. Low stakes; take ours so the two files stop differing. |

## 3. Structure — not a retune, a decision about how the token resolves

| Token | Mode | DAWN | Production | Why |
| :--- | :--- | :--- | :--- | :--- |
| `--color-surface-post` | light | `#F7F5F0` | `var(--color-surface)` | ✅ The post surface follows the surface token instead of holding its own hex, so a skin that moves one moves both. Renders identically today. |
| `--color-surface-post` | dark | `#2B2415` | `var(--color-surface)` | ✅ Same decision, dark side. |

## 4. 🔴 Do not send: the row four documents still carry

`docs/UX-MATURITY-PLAN.md` Addendum 2026-08-05 §4 finding 3 lists a fourth prod-ahead token:

> `--color-text-on-primary` — DAWN `#FFFFFF`, production `#1A1206`, "white on amber fails AA; ink passes"

**That has not been true since 2026-08-06.** Production is `#FFFFFF` in both modes, identical to
DAWN, and the two files agree. What actually happened is a split, not a revert of the fix: the moment
`--color-text-on-primary` became ink, every rank core inherited an ink glyph and gold — the lightest
core in the spectrum by design — fell to **2.46:1**. The glyph moved to its own token
(`--color-text-on-rank`, §5) and the button label went back to white.

Sending the old row would ask DAWN to make on-primary ink, reintroducing from the very sheet meant
to prevent regressions the exact failure the split fixed. It is listed here so the next person
reading that finding stops at this line.

## 5. Additions — tokens production has and DAWN has no row for

Send as new rows, not corrections. Values are production's.

| Token | Light | Dark | What it is |
| :--- | :--- | :--- | :--- |
| `--color-text-on-rank` | `#1A1206` | inherits | The glyph on a **rank core**, decoupled from the button label. See §4 for why it exists. Fixed across skins. |
| `--color-chrome-hover` | `#FFFFFF` | `#2B2415` | Hover ground for the app frame (top bar, rails, menus), which sits a step down from the canvas. |
| `--color-text-on-danger` | `#FFFFFF` | `#1A1206` | Label on a solid semantic fill. Split from `--color-text-on-primary` because one shared token cannot serve both: ink on the light danger red is 3.31, sub-AA. |
| `--color-text-on-warning` | `#1A1206` | `#1A1206` | Same split. Ink is what passes on the light warning yellow. |
| `--color-text-on-success` | `#FFFFFF` | `#1A1206` | Same split. |
| `--color-on-media` | `var(--color-on-media-light)` | — | Text over **member photography** (profile / space / event covers). The live value, flipped per photo by the content-aware hero (ADR-830). |
| `--color-on-media-light` | `var(--color-on-ink)` | — | The light copy, for dark imagery. |
| `--color-on-media-dark` | `var(--color-ink)` | — | The dark copy, for bright imagery. |

The `on-media` family follows the **image**, not the theme, which is why it aliases rather than
holding hexes. That distinction is the point of the tokens; carry the comment with them.

---

## 6. Beyond colour — four answers DAWN asked for, and one correction it did not expect

The 2026-08-25 round asked four questions and made one assumption. All five were checked against the
tree on 2026-08-25. **The assumption is the important one, and it is wrong in the expensive
direction**: DAWN drew a plate the owner deleted.

### 6a. 🔴 The hero plate does not exist in production — delete it, do not retune it

CHANGES.md §Q2b ships four legibility rungs in `tokens/effects.css` — "0 nothing, 1 per-glyph halo,
2 halo + blurred plate, 3 halo + strong plate" — and closes: *"DAWN's rungs are drawn from the
description, not from `globals.css:2307+`. The blur radius, the plate opacities (40% / 74% ink…)
and the `inset: -0.6em -1.1em` are DAWN's numbers. If yours differ, that is a §2-style value diff."*

**They do not differ. There is no plate at all, in any rung.** Owner ruling, 2026-07-28, on seeing
it ship:

> "I do not want the dark boxes behind header content. Can you add a subtle shadow to any white
> fonts or buttons in content aware mode. Leave black as is, but make a shadow for white."

What production actually does, at `app/globals.css:2307+`:

| | Production |
| :--- | :--- |
| **Plate rectangle** | **None.** `HERO_PLATE_ALPHAS` in `lib/images/hero-contrast.ts:210` is `{0: 0, 1: 0, 2: 0, 3: 0}`, and a drift guard asserts the CSS and the constant agree so a bar cannot be reintroduced on one side of the contract alone. |
| **Light copy** (`data-media-tone="dark"`, and the unmeasured server default) | A per-glyph halo only: `0 1px 2px` ink at 55%, `0 2px 12px` ink at 45%. |
| **Dark copy** (`data-media-tone="light"`) | `text-shadow: none`, explicitly. Black on a bright backdrop already has its edge, and a light halo behind black reads as a smudge — that is the "leave black as is" in the ruling. |
| **The measurement** | Still runs, and still stamps `data-media-plate`. Measuring is what picks the tone correctly on a split cover; nothing paints a box with the result. |

So this is a **deletion, not a value diff**. The rungs stay as a measurement ladder; rungs 2 and 3
must stop painting. The same correction applies to `guidelines/on-media.card.html`, whose whole
premise is "all four rungs side by side on real photographs".

⚠️ **Why this one matters more than a hex.** A colour that disagrees renders slightly wrong. A plate
that disagrees puts back, through a faithful sync, the exact thing the owner rejected on sight — and
the tone-conditional halo above is the design that replaced it, not a lesser version of it.

### 6b. ✅ `.theme-light-lock` re-declares. DAWN's step-in-kind was right

CHANGES.md §2: *"If production's light lock is a class rather than a re-declaration, ignore this; if
it re-declares, check it."* It re-declares — `app/globals.css:525`, `color-scheme: light` plus the
full palette.

Take the correction further than the five DAWN matched: the lock must carry **all 57** roles, not the
29 it originally had. A partial lock lights the page and leaves the accents dark. The live instance:
the induction's scarcity counter rendered dark-mode `--color-warning` `#F2B14E` on the locked cream
`#FAF8F4` — **1.77:1**, which is not low contrast, it is invisible. `scripts/check-contrast.mjs`
tests five render states now, and the fifth is the lock, because the first four were all green on
that pair.

### 6c. ✅ `/spaces/*` heroes are member uploads — and the cover is **not** the CLS

DAWN asked whether the hero is a member-uploaded photo of unknown dimensions. **Yes**, and there is
no enforced crop: the uploader ships a *hint*, "Wide banner across the top of your page. About 1600
by 500" (`components/spaces/space-branding-form.tsx:270`), and accepts whatever arrives.

**But the render already reserves the box, so the cover cannot be producing CLS 0.222.** The band is
a fixed-height container from the one ladder in `lib/layout/cover-height.ts` — `h-48 sm:h-56` /
`h-72 sm:h-[22rem]` / `h-[24rem] sm:h-[36rem]` — and the photo is `h-full w-full object-cover` inside
it. Any aspect ratio crops to the same geometry.

So the honest answer to DAWN's own framing is: it *is* a contract rather than a treatment, and the
contract is **already in place**. The 0.222 is coming from something else on that page and needs
finding before anything is drawn for it. Nothing to design this round.

### 6d. ✅ The admin rail editor does not remount on drop — the CLS is the first paint

DAWN asked whether the drag list remounts on drop rather than reordering in place, offering to respec
the row so drag state is a transform. **It already reorders in place.**
`components/admin/menu/menu-arrange-board.tsx` keys every box by `key={box.id}` and `persistOrder`
splices a copy of the array and calls `setBoxes(next)`. React reconciles by key; rows move, nothing
unmounts.

**The 0.622 is the mount, not the drag.** The board loads its categories over the network in a
`useEffect`, and until that resolves the entire surface is one line of text:

```
loading ? <p className="text-body-sm text-muted">Loading the menu…</p>
        : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"> … every category box …
```

A single paragraph is replaced by a multi-row grid after a round-trip, with no height reserved. That
is the whole shift, and it is a DAWN screen, so the design answer is in scope: **a skeleton whose
geometry is the board's** — the same grid, the same box count, the same row height. Worth pairing
with the feed skeleton spec DAWN already offered, since it is the same law on a different surface.

---

## 7. How to keep this sheet true

1. Change a token in `app/globals.css`.
2. Run `pnpm test lib/theme/dawn-divergence.test.ts`. It prints exactly which rows are wrong.
3. Update the ledger in that test **and** this sheet in the same change. Neither is allowed to
   drift from the CSS, and neither is allowed to drift from the other.
