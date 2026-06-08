# CHANGES.md — DAWN sync (this round)

> **▶ Paste this into Claude Code (in your repo):**
> *"sync DAWN"* — or, spelled out: *"Read `design_handoff/SYNC.md` and
> `design_handoff/CHANGES.md`, apply this round's changes per the mapping, create
> a `design-sync/...` branch, build, and open a PR. Do not merge or deploy."*

Three brand changes were made in DAWN this session. All are **mechanical** (token
+ mapping edits). Apply to `frequency-web` per the mapping table in `README.md`.

Reference source (already updated in DAWN): `tokens/colors.css` is copied into
this folder as `colors.css` for side-by-side comparison.

---

## 1. Signal → deep emerald-teal (was a green-blue teal)
**Why:** Signal and the new Broadcast read too close. Signal moves to a deeper,
green-leaning emerald so it's distinct in *hue* from Broadcast's cyan, and stays
cohesive with the teal `success`.

Edit `app/globals.css`:

**`:root`**
| Token | Old | New |
|---|---|---|
| `--color-signal` | `#1E9E89` | `#0F8E78` |
| `--color-signal-strong` | `#0F6657` | `#0A5C4D` |
| `--color-signal-bg` | `#D6F0EA` | `#D2EDE6` |

**`.dark`**
| Token | Old | New |
|---|---|---|
| `--color-signal` | `#5FD3BE` | `#53CFAC` |
| `--color-signal-strong` | `#5FD3BE` | `#53CFAC` |
| `--color-signal-bg` | `#0F2C24` | `#0C2C25` |

`--color-text-on-signal` unchanged (`#04231E`).

---

## 2. Broadcast → robin's-egg / Tiffany blue (was azure)
**Why:** Brighter, more cyan comms accent. Still cool against the amber lead;
still **comms / dispatches / onboarding ONLY** — never general chrome.

Edit `app/globals.css`:

**`:root`**
| Token | Old | New |
|---|---|---|
| `--color-broadcast` | `#2F8FE2` | `#1EB6C5` |
| `--color-broadcast-strong` | `#1B6BB5` | `#0E808D` |
| `--color-broadcast-bg` | `#E2EFFB` | `#D8F2F5` |

**`.dark`**
| Token | Old | New |
|---|---|---|
| `--color-broadcast` | `#5BAAEC` | `#69D6E6` |
| `--color-broadcast-strong` | `#5BAAEC` | `#69D6E6` |
| `--color-broadcast-bg` | `#11243A` | `#0F2A34` |

`--color-text-on-broadcast` unchanged (`#FFFFFF`). Note: robin's-egg is light —
verify white-on-broadcast legibility on any solid fills; if a fill reads weak,
switch that instance to `text-broadcast-strong` on `broadcast-bg`.

---

## 3. Agent rank → olive (was jade)
**Why:** the season rank **Agent** now uses the **olive** spectrum instead of jade.

This is the rank-name → spectrum-color mapping (in DAWN it lives in
`components/core/RankBadge.jsx`). In `frequency-web`, find where season ranks map
to a rank spectrum color (the `.rank-badge` `--rank` / `--rank-deep` /
`--rank-bright` vars are set per rank — search for `rank-jade` usage tied to
"agent", likely in a rank util or `lib/`). Change Agent's mapping:

```
agent:  rank-jade  →  rank-olive
```
so it sets `--rank: var(--rank-olive)`, `--rank-deep: var(--rank-olive-deep)`,
`--rank-bright: var(--rank-olive-bright)`. The rank spectrum primitives
themselves are unchanged.

---

## Verify
- `npm run dev`, eyeball: a Signal/secondary badge, a Broadcast/dispatch chip,
  and an Agent rank badge.
- Confirm no raw hex leaked outside `app/globals.css`.
- Open a PR titled **"DAWN sync: signal/broadcast palette + agent rank"**. Do not deploy.
