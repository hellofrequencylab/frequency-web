# DAWN → repo handoff

**What this is.** DAWN is the design system for Frequency, authored as HTML/JSX design
references. Nothing in it is production code: the JSX uses inline styles and is meant to
be *recreated* in this repo's Tailwind v4 + TSX conventions, never pasted.

**Repo:** `hellofrequencylab/frequency-web`, branch `main`, subtree `design_handoff/`.

---

## How to sync (two steps)

**1. Put this folder in the repo.** Copy the contents of this bundle into
`design_handoff/` on a branch, replacing what is there:

```
design_handoff/
  README.md      ← this file
  SYNC.md        ← the standing routine (does not change between rounds)
  CHANGES.md     ← THIS round's change set (read newest section last)
  dawn/          ← the vendored DAWN reference set (tokens, components, templates)
```

Token sheets live in `dawn/tokens/` (`colors.css`, `skins.css`, …) — the bundle-era
root copies were byte-identical duplicates and were removed; `dawn/tokens/` is canonical.

**2. Say this to Claude Code, in the repo:**

> sync DAWN

Spelled out, if you would rather be explicit:

> Read `design_handoff/SYNC.md` and `design_handoff/CHANGES.md`, apply the listed
> changes, create a `design-sync/2026-08-03` branch, build, and open a PR.
> Do not merge and do not deploy.

`SYNC.md` holds the routine and the DAWN-file → repo-file mapping. `CHANGES.md` holds
what changed, newest section at the bottom, written as old → new values, asset swaps and
explicit repo actions.

---

## Reading CHANGES.md

Sections are append-only and dated. Each one is written to be actionable without the
conversation that produced it:

- **§1b tokens to push** — the only values DAWN differs from production on.
- **§2 answers** — the four questions the production handoff left open.
- **§3, §4 repo actions** — the Vault icon swap, the rank-ladder audit.
- **Later dated sections** — each round's laws (docks, rails, texture, spacing roles,
  the marketing header, pricing canon) with the repo-side consequence called out in
  **bold** wherever one exists.

## The golden rule (from SYNC.md)

Raw hex appears only in `app/globals.css`; everything else reads semantic tokens. A
palette change should be a one-file edit that propagates everywhere.

## Where the designs live

The DAWN project itself is the reference for anything CHANGES.md describes visually:

| Area | Files |
|---|---|
| Tokens | `tokens/*.css`, `styles.css` |
| Components (24) | `components/{core,kit,forms,feedback,navigation,marketing}/` |
| App screens (18) | `ui_kits/screens/*.html`, `ui_kits/app/*` |
| Marketing pages (7) | `ui_kits/marketing/*` |
| Guideline cards (79) | `guidelines/*.card.html` |
| Spec | `readme.md` |
