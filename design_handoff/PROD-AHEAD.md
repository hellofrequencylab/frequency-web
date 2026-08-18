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

Last derived **2026-08-17** against `app/globals.css` and DAWN's `tokens/colors.css`.

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

## 6. How to keep this sheet true

1. Change a token in `app/globals.css`.
2. Run `pnpm test lib/theme/dawn-divergence.test.ts`. It prints exactly which rows are wrong.
3. Update the ledger in that test **and** this sheet in the same change. Neither is allowed to
   drift from the CSS, and neither is allowed to drift from the other.
