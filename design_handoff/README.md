# DAWN → frequency-web — Claude Code handoff guide

This is the bridge between the **DAWN design system** (where styles, icons, and
graphics are designed and reviewed) and the **production app**
(`github.com/hellofrequencylab/frequency-web`). Hand this folder to Claude Code
in the repo and it can apply a round of design changes and open a PR. **Nothing
here auto-deploys** — Claude Code produces a branch + PR for a human to merge.

> The HTML/JSX in DAWN are **design references** (token-driven prototypes), not
> code to paste. The task for Claude Code is to land the *values and assets* into
> the repo's real environment (Next.js + Tailwind v4 + lucide-react), using its
> existing patterns.

---

## How DAWN maps to the repo (1:1 where it counts)

| You edit in DAWN | Lands in `frequency-web` | Nature of change |
|---|---|---|
| `tokens/colors.css` (`--color-*` raw hex, `:root` + `.dark`) | `app/globals.css` — the `:root` and `.dark` blocks | **Mechanical.** Copy the hex values across. Raw hex lives only here in both projects. |
| `tokens/spacing.css` (shadows, radii) | `app/globals.css` — the `@theme inline` shadow tokens (`--shadow-*`, `--shadow-pop*`) | Mechanical for the shadow/elevation values. |
| `tokens/effects.css` (`.bg-slat`, `.light-strip`, `.amber-glow`, `.brandmark`, `.rank-badge`, focus ring, keyframes) | `app/globals.css` — the matching CSS blocks | Mechanical. These are lifted from globals.css, so it's a value-for-value sync. |
| `tokens/fonts.css` / `typography.css` | `app/globals.css` + `app/layout.tsx` (`next/font`) | The repo self-hosts via `next/font`; only change family/weights if the type changed. |
| `assets/frequency-logo.png` | `public/frequency-logo.png` | **Drop-in file replace.** |
| `assets/icon.svg`, `assets/icon-512.png` | `public/icons/*` | Drop-in file replace (regenerate the icon set if the mark changed). |
| `assets/images/*` | `public/images/site/*` | Drop-in. Match or update the referenced filename. |
| Icon choices (lucide names) | `components/layout/nav-icons.ts` + component imports | Swap the `lucide-react` glyph by name. DAWN uses the same Lucide set. |
| `components/*` (DAWN React primitives) | `components/marketing/marketing-ui.tsx`, `components/ui/*`, etc. | **Intent, not copy.** Recreate the visual change in the repo's Tailwind/TSX component; don't paste the inline-style JSX. |

**The golden rule (shared by both projects):** raw hex appears **only** in the
color token file. Every component reads semantic tokens (`bg-primary`,
`text-muted`, `var(--color-signal)`). So a palette change is a one-file edit in
`app/globals.css` and it propagates everywhere.

---

## The workflow

1. **Design + review here.** Edit tokens/assets/components in DAWN; approve the
   cards in the Design System tab.
2. **Ask me for a handoff.** I regenerate this folder with a **CHANGES.md** that
   lists exactly what changed this round (old → new hex, which asset files,
   which icons), plus the changed source files copied in.
3. **Download** the folder (zip) and drop it into your repo, or point Claude Code
   at it.
4. **Tell Claude Code:** *"Apply the changes in `design_handoff/CHANGES.md` to
   this repo following the mapping table, then open a PR."*
5. **Review the PR, merge, deploy.** Your call, every time.

### A prompt you can paste into Claude Code
```
Read design_handoff/README.md and design_handoff/CHANGES.md.
Apply each listed change to this repo using the mapping table:
- color/shadow/effect token changes → edit app/globals.css (:root and .dark)
- asset changes → replace the file in public/ at the mapped path
- icon changes → update components/layout/nav-icons.ts and affected components
- component visual changes → recreate in the existing Tailwind/TSX component, do
  not paste the DAWN inline-style JSX
Keep raw hex confined to app/globals.css. Run the build, then open a PR titled
"DAWN sync: <summary>" with a short changelog. Do not deploy.
```

---

## What's safe to sync mechanically vs. by hand
- **Mechanical (low risk):** color tokens, shadow/radius tokens, effect classes,
  asset files, icon-name swaps. These are value-for-value.
- **By hand (needs judgment):** new components or layout changes — recreate in
  the repo's component conventions and run it on `localhost` to eyeball, since
  DAWN primitives use inline styles while the repo uses Tailwind utilities.

---

## This round's changes
See `CHANGES.md` (generated per handoff). If it's absent, no specific change set
was attached — use this README as the standing sync reference.
