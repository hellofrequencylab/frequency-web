# Reviewing changes — the owner's guide

You do not read code to review a change. **The machine reviews the code; you review the result.**
This is the whole point of the hard rules in CI (docs/EMBEDDABLE-ELEMENTS.md, MENU-CONTRACT, etc.):
if the checks are green, the change is structurally safe, so your job is just "does it look right?"

## The 3-step review (every PR)

1. **Is CI green?** On the PR, the checks show a green ✓ (or a red ✗). Green means: the code
   compiles, the 5,600+ tests still pass, the security scan (CodeQL) is clean, and every platform
   contract holds (one menu source, RLS on every table, design tokens not raw colors, apps mounted
   through the registry). **Green = structurally safe to ship.** If it's red, don't merge — I fix it.
2. **Open the Preview.** Every PR has a **Vercel Preview** link — a real, live deployment of exactly
   this change. Click it and look. Each PR's **"How to review"** block tells you the 2-3 specific
   things to click (e.g., "open a Journey, hit the cover, confirm the Loom popup opens").
3. **Ship it.** If the preview looks right, click **Merge** (or, with auto-merge on, it merges itself
   the moment CI goes green). If something's off, tell me what — you don't need to diagnose it.

## What the green check already guarantees (so you don't have to)

| Gate | What it protects |
|---|---|
| `tsc` + `lint` | No broken or malformed code |
| tests (5,600+) | Existing behavior isn't broken |
| CodeQL | No new security vulnerability |
| `check:menu` / `check:rls` / `check:tokens` / `check:elements` | The architecture rules can't be violated (one menu source · every table has RLS · tokens not hex · apps go through the registry) |
| Vercel build | It actually builds + deploys |

## Bots you can ignore

- **"Help docs review"** (the long checklist of `content/help/*.md`) is **advisory** — nothing
  publishes. Only tick it if you *want* to update member-facing help copy. It never blocks a merge.
- **Vercel bot** comments are just deployment status ("Building" → "Ready"). No action.

## Draft vs ready

- **Draft** = I'm still building it; don't merge.
- **Ready for review** = green + preview-checked on my end; safe for you to look + merge.
- **Auto-merge** (when on) = you don't even wait; it ships the instant all checks pass.

## Making it hands-off (recommended repo settings)

Two GitHub settings make "green = shipped" automatic and safe (a repo admin sets these once, in
**Settings → Branches → `main`**):

1. **Require status checks to pass before merging** — pick the `checks`, `analyze` (CodeQL), and
   `Vercel` checks. Now nothing can merge unless the gates are green.
2. **Allow auto-merge** — then each PR can be set to merge itself the moment it's green.

With both on, your review is exactly step 2 above: click the preview, and if it's right, it's already
on its way (or one Merge click away).
