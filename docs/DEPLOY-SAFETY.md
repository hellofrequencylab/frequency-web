# Deploy safety — the rules the 2026-08-11 outage bought

**Read this before merging anything large, and before debugging a deploy that fails after a green
build.** Every rule below is here because breaking it cost real production time. Where a rule can be
machine-enforced it is, and the gate is named; a rule with no gate is a rule that will be forgotten.

---

## What happened, in four sentences

A 215-file PR ([#2098](https://github.com/hellofrequencylab/frequency-web/pull/2098), the Studio/Vera
wizard kernel) merged to `main`. It compiled clean, passed 26 contract guards, 9,000+ tests, lint and
typecheck — and then every production deploy died with `ENOSPC` about nineteen minutes into
`Deploying outputs`. Production served a week-old tree for a day, the wizards could not ship, and
roughly six hours went into two theories that were both wrong. The cause
([ADR-1002](DECISIONS.md)) was not in that PR at all: the build had been ~1.5× over the container's
disk budget for months, and #2098's five extra serverless functions were what finally did not fit.

---

## The rules

### 1. Measure the artifact, not only the source. 🔒 `check:build-budget`

Every gate in this repo measured the **source tree**. Not one measured the **thing that gets
deployed**. That is the whole reason a build could sit 1.5× over budget indefinitely with a green
board.

`scripts/check-build-budget.mjs` runs as `postbuild`, so it runs on Vercel's real build and fails it
before a bad artifact can ship. It sums `.next/server/**/*.nft.json` — the per-function traced set —
because **Vercel copies each function's files into that function's own directory**. A file reachable
from 400 routes is written 400 times.

> ⚠️ Vercel's own "Output files: 873 MB" line is the **unique** set. The real write was **16.73 GB**.
> Do not reason about deploy size from that number.

### 2. When a gate fails on size, fix the fan-out. Do not raise the budget. 🔒 the gate prints the fan-out

The budget is a ratchet in spirit: it may fall, and raising it needs a reason in the commit, not a
reflex. The failure output ranks costs by *size × number of functions carrying it*, which names the
cause directly. ADR-1002's was one file: `app/opengraph-image.tsx` was the ROOT metadata image, Next
inherits metadata images into every page's metadata module, that module imports `next/og`, and
`next/og` loads `sharp` — so `libvips-cpp.so` (17.7 MB) landed in 403 functions. **6.99 GB, 42% of
the build, for a codec 18 routes use.**

The general shape: **anything reachable from a root layout, a root metadata file, or a shared server
module is multiplied by every route beneath it.** That is where to look first, every time.

### 3. Run the control experiment before theorising. No gate — this one is discipline

Deploying the last known-good tree on the current infrastructure took **three minutes** and excluded
platform, region, container class and account state in one shot. Two hours of theorising before it
excluded nothing. **When something that used to work stops working, re-run the thing that worked.**

Both theories that ate the evening were plausible and both were dead ends, recorded in ADR-1002 so
nobody re-runs them: the Turbopack build cache (a build with the cache disabled at the platform level
failed identically) and an unpaid invoice (another project on the same account deployed throughout).

### 4. Let builds finish. 🔴 No gate — and it cost the most

At least one cancelled production build might have completed. **Cancelling mid-flight destroys the
evidence you are trying to collect**, and the log you killed is usually the one that answers the
question. Let it run and read the log, unless the queue is genuinely blocking a fix that is ready.

### 5. A green CI is not a green deploy. `main` is protected, so a merge *is* a deploy

CI never builds — Vercel owns that. So `lint`, `test`, `checks` and `analyze` all being green tells
you the source is sound and tells you **nothing** about whether the artifact fits. That gap is now
covered by rule 1, but the habit matters: after merging anything structural, **watch the production
deployment reach READY** before calling it done.

### 6. Fail-safe code must have a gate that detects the degraded state. 🔒 `check:og-trace`

`deliverCard` swallows a failed `sharp` import and serves the raw PNG rather than throwing, which is
correct — a heavy card previews on most clients, a 500 previews on none. But it means a missing
`sharp` is **completely invisible**: no error, no failed test, no red build, just every share card
silently twelve times heavier.

**Any fail-safe needs a second thing that notices it fired.** `check:og-trace` fails the build if
`sharp` is missing from a route that rasterises a card, or present in one that does not.

### 7. Verify claims against code before acting on them. Already canon in [`AGENTS.md`](../AGENTS.md)

Repeated here because it kept mattering during the incident:

- `lib/og/deliver.ts` carried a comment saying its lazy import kept the native binary "out of every
  route that merely imports this file's constants". **The intent was right and the mechanism did
  nothing** — nft reads the literal specifier out of the emitted chunk regardless.
- The handoff doc said branch `feat/studio-kernel` was deleted. It was not.
- The handoff doc named a nav commit as "stranded" on that branch. That SHA does not exist in the
  repository at all.

A comment is a claim. A doc is a claim. **Check the file.**

### 8. Split what you can measure separately

#2098 changed 215 files across the Studio kernel, 14 manifests, AI wiring, migrations and CI scripts,
and merged as one commit. Nothing about it was wrong — but when the deploy broke there was no way to
ask *which part*, and the answer turned out to be "none of it, it was the last straw". Where work can
land in slices that each deploy on their own, it should.

---

## The checklist, before merging anything structural

1. `pnpm build` locally, then read the `postbuild` output. Both gates must be ✅.
2. `pnpm exec tsc --noEmit` · `pnpm lint` · `pnpm test` · the 26 contract guards.
3. Migrations: is every file in `supabase/migrations/` actually applied, and does the applied ledger
   contain nothing the repo lacks? A revert can leave the DB **ahead of** the code.
4. After merge: **watch the production deployment reach READY.** A merge is a deploy.
5. If it fails: revert first, diagnose after. Restoring the last known-good tree is not giving up, it
   is buying the time to find the cause with production up. That part of 2026-08-11 was done right.
