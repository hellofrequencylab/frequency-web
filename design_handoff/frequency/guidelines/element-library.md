# Frequency elements in the Theme Element Library

How this design system plugs into the website editor proposal ("Theme Element Library", 2026-10-13). The short version:
- **Theme pack:** Frequency becomes the first platform-level theme pack.
- **Infographics:** our primitives become the rendering layer for the proposal's 10 infographic kinds.
- **Data model:** the proposal's infographic JSON model renders today through `assets/infographics/ig.js` (`data-ig="infographic"`).

## 1. Where each of our pieces lands (the five kinds)
| Proposal kind | From this system | Notes |
|---|---|---|
| **Element** | 76 sprite icons, the 12 house marks, the wordmark and roundel, iridescent text and rims, glass panel, orb, signal line | Token roles only. Place them through the generic Element block (L1). |
| **Smart element** | Infographic (10 kinds below), streak arc, streak thread, layered bars, leaderboard podium, orbit, weave | Each stores the binding plus the data, never the rendered result. Streak, podium, orbit and weave are new kinds for v2, bound to platform data. |
| **Section preset** | Website kit sections: hero with location pill, Keep going panel, event map band, chapter split, live strip, closer | Named arrangements of existing blocks. No new render code. |
| **Theme pack** | **Frequency pack:** grain, mood orbs (sphere, halo, jewel), gradient seams, FR roundel, logo flow, house marks, breath rings | Manifest: `assets/infographics/theme-pack.json`. Every item names a fallback. |
| **Saved block** | Nothing new to add | Footer and header from the web kit are good first candidates. |

## 2. The 10 infographic kinds, drawn with our primitives
| Kind | Item shape | Our primitive | Variants we provide |
|---|---|---|---|
| stats | value, unit, label | `.ig-stat` / `.ig-card` | `grid-2`, `grid-4`, `cards` (stat card with trend) |
| iconList | icon, title, line | sprite icon + `.ig-path` text | `rows`, `grid` |
| steps | title, line, icon | `.ig-path` | `numbered`, `orbit` (steps around a core) |
| timeline | date, title, line | `.ig-path` with dates | `horizontal`, phone reflows vertical |
| comparison | columns × rows | table with check orbs | `columns`, `versus` |
| bar | label, value | `.ig-bars`, layered bars for multi-series | `single`, `layered` (D/W/M/Y) |
| donut | label, value | conic ring; `.ig-donut` overlap for two parts | `ring`, `overlap` |
| meter | current, goal, label | `.ig-meter` + stat | `tide`, `segments` |
| pictogram | count, of, icon, label | sprite icon row, lit to count | `icons`, `orbs` |
| quote | text, who, role | serif italic | `pull` |

Rules carried over from the proposal and enforced by the renderer:
- `value: null` or `needsValue: true` renders as a dashed "needs a number" slot. It never shows a made-up figure.
- `source` always prints as a source line.
- `describe` becomes the figure's text version, and a "See the data" table is generated from the items. The visual is `aria-hidden`.
- No chart code is needed at render: the markup is plain HTML/SVG on tokens. `ig.js` is a client convenience for this kit; the production version is the same markup produced server-side from the same JSON.

## 3. Token roles (the manifest's `tokens` block)
Our tokens map onto the editor's `--th-*` roles. Switching theme only changes these values.
| Role | Stage | Commons |
|---|---|---|
| `--th-bg` | `#0A0612` | `#FFFFFF` |
| `--th-text` | `#F6F0FF` | `#34312E` |
| `--th-muted` | `#A89BC2` | `#7C766F` |
| `--th-accent` | `--iridescent-sweep` | `--pa` |
| `--th-on-accent` | `#0A0612` | `#1E1B18` |
| `--th-r` | 24px | 24px |
| display / body / accent type | Unbounded / Hanken Grotesk / Instrument Serif italic | same |

## 4. Answers to the proposal's open decision
- **Does the Frequency design system get its own theme pack? Recommended: yes.** It's the first platform-level pack, available on every site theme, with fallbacks to plain shapes on Default and Bold.
- **Build order:** L3 (Infographics v1) can use `ig.js` output as the reference markup for each kind. The probes in L3 compare server output against it.

## 5. Next steps
1. Agree the variant names per kind (table in §2) so the Default and Bold themes can map them.
2. Port each kind's markup into a server component behind `defineBlock`, using `theme-pack.json` as the manifest.
3. Add streak, podium, orbit and weave as v2 smart elements bound to platform data (streaks, standing, Circle membership).
