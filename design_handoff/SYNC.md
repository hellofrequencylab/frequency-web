# SYNC.md — "sync DAWN" routine for Claude Code

> **Trigger:** when the user says **"sync DAWN"** (or "apply the DAWN handoff"),
> follow this routine exactly. This file is the standing instruction; it does not
> change between rounds. The per-round changes live in `design_handoff/CHANGES.md`.

## Routine

1. **Read the change set.** Open `design_handoff/CHANGES.md`. It lists this
   round's changes as old→new values / asset swaps / icon or rank mappings. If
   `CHANGES.md` is missing or unchanged since the last sync, stop and tell the user.
2. **Create a branch.** `design-sync/<short-summary>` off the default branch
   (`main`). Never commit directly to `main`.
3. **Apply each change using the mapping below.** Confine raw hex to
   `app/globals.css`. Do not paste DAWN's inline-style JSX into the app; recreate
   any component/layout change in the repo's Tailwind v4 + TSX conventions.
4. **Build + sanity check.** Run the project build (and `npm run dev` to eyeball
   the affected surfaces if a visual change). Fix anything that breaks.
5. **Open a PR.** Title `DAWN sync: <summary>`. Body = the changelog from
   CHANGES.md. **Do not deploy and do not merge** — the user reviews and merges.
6. **Report back** the PR link and a one-line summary of what changed.

## Mapping (DAWN file → this repo)

| Change type (in CHANGES.md) | Apply to | Notes |
|---|---|---|
| Color / shadow / radius **tokens** | `app/globals.css` → the `:root` and `.dark` blocks (and `@theme inline` for shadows) | Value-for-value. Raw hex lives ONLY here. |
| **Effect** classes (`.bg-slat`, `.light-strip`, `.amber-glow`, `.brandmark`, `.rank-badge`, focus ring, keyframes) | `app/globals.css` → the matching CSS blocks | Lifted from globals.css; sync value-for-value. |
| **Fonts / type** | `app/globals.css` + `app/layout.tsx` (`next/font`) | Only touch if family/weights changed. |
| **Logo** | `public/frequency-logo.png` | Drop-in file replace. |
| **App icons** | `public/icons/*` | Drop-in; regenerate the set if the mark changed. |
| **Photography / images** | `public/images/site/*` | Drop-in; keep or update the referenced filename. |
| **Icon choice** (lucide name) | `components/layout/nav-icons.ts` + affected components | Swap the `lucide-react` glyph by name. |
| **Rank → color mapping** | wherever season ranks set the `.rank-badge` `--rank*` vars (search `rank-` in `lib/` + components) | Change the rank's spectrum color name only. |
| **Component / layout visual** | the existing component in `components/**` | Recreate in Tailwind/TSX; do NOT paste inline-style JSX. |

## Golden rule
Raw hex appears only in `app/globals.css`; everything else reads semantic tokens
(`bg-primary`, `text-muted`, `var(--color-signal)`). A palette change should be a
one-file edit that propagates everywhere.
