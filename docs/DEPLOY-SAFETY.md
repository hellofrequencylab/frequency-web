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

#### ⚠️ Retracted: the `node_modules` theory (2026-08-12)

A third theory outlived the other two because it was never written down as a theory. #2102's commit
message (`3a4436762`) offered, as the cache-free report's measured deltas, *"node_modules at 1073MB
against 948MB on the last healthy build, and 408 serverless functions against 403."* **The dependency
half is refuted, and nothing in the tree ever supported it.**

| Half of the claim | Verdict | Command |
|---|---|---|
| `node_modules` grew 125 MB | 🔴 **False** — the lockfile never changed | `git diff --numstat 3f8d62b89 origin/main -- pnpm-lock.yaml` → **empty** |
| 403 → 408 functions | ✅ True, and not a cause | `git diff --name-status 3f8d62b89 97443260d -- 'app/**/page.tsx' 'app/**/route.ts'` → **5 additions** |

`pnpm-lock.yaml` is byte-identical from `3f8d62b89` — the last tree that reached production — through
today's `main`, across the entire #2098 + #2099 + #2100 range. No dependency was added, removed or
bumped anywhere in the window. The reported growth was **self-inflicted measurement noise**: with
`VERCEL_FORCE_NO_BUILD_CACHE` set, pnpm re-materialises `.pnpm-store` on disk and the 106 MB
`@supabase/cli-linux-x64` binary is counted twice. That variable was removed again for this reason.

The five new functions are real, and they are the last straw rather than the weight — the build was
already ~1.5× over budget. **The two real causes, both found by measuring the artifact:**

1. **A root metadata image.** `app/opengraph-image.tsx` sat at the root of `app/`, Next inherits
   metadata images into every page's metadata module, that module imports `next/og`, and `next/og`
   loads `sharp` — putting `libvips-cpp.so` (17.7 MB) into **403 functions**: 6.99 GB, 42% of the
   build, for a codec 18 routes use ([ADR-1002](DECISIONS.md)).
2. **A path the tracer could not resolve.** `lib/ai/quality-gate.ts` called
   `join(process.cwd(), ...standard.rubricPath)`. `@vercel/nft` cannot resolve a spread of a runtime
   array, so it globbed the only thing it could — the repo root — into every function reaching that
   module, ~300 of them. The Studio tree measured **57.23 GB** with it ([ADR-1004](DECISIONS.md),
   which corrects ADR-1002's "no commit crossed the disk"; the gate that caught it is
   [ADR-1003](DECISIONS.md)).

Neither cause is a dependency. Left standing, the retracted half reads as evidence against the Studio
work in the permanent record, and it is the first thing the next reader would find.

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

### 9. A build that dies in `[next]/internal/font/google/*` gets REDEPLOYED before it gets debugged

**Measured 2026-08-12.** PR #2109's deploy failed with `module-not-found` repeated across
`[next]/internal/font/google/nunito_*.module.css`. Fifteen seconds earlier, `fonts.gstatic.com`
returned **HTTP 404** on five Nunito `woff2` URLs that Google's own CSS had just named. `next/font`
caches only in memory (`loader.js:45-46`) and `retry.js` retries a 404 straight back into the same
404. A redeploy of the byte-identical commit went green.

This is rule 3 with a specific name attached: **the control costs three minutes and settles it.**

⚠️ **The tempting wrong theory, and how it was killed.** The failing build opened with *"Previous
build cache was too large, starting from a clean state"*, so the obvious story was "cold cache
forced a font re-fetch". The orchestrator stated that as the likely cause. **It is wrong, and the
control was already sitting in the logs**: the successful redeploy printed *"Skipping build cache,
deployment was triggered without cache"* — it was **also cold**. Two cold builds, opposite
outcomes. Reasoning from a plausible mechanism instead of looking for the control is exactly the
`node_modules` mistake in §3, made again by the same process nine hours later.

**The cache is a real but separate finding, and the measured answer is to leave it alone.** It is
discarded on **6 of 38 builds (15.8%)** because Turbopack's cache grows past Vercel's 1.50 GB limit
— a sawtooth of ~1.07 GB clean, ~1.33 GB warm, then 1.64 GB and invalidated, so it survives about
one reuse. It is worth roughly **13 seconds on a four-minute build**, and the two fastest builds in
the sample were both cold. Fixing it would make font flakes *more* frequent, since Turbopack module
reuse is currently the only thing shielding five builds in six from Google. ⚠️ And note the trap:
every build report prints `Build cache: <1 MB`, which does **not** measure the build cache — the
real figure lands under *Input source code*, 2668 MB warm against 311 MB clean. Same shape as the
`Output files: 873 MB` trap in §1.

The durable fix, if the flake ever becomes routine, is `next/font/local` for **all eleven** Google
families in `app/layout.tsx` — not just Nunito, and not by reusing `lib/og/load-nunito.ts`, which
carries two weights as TTF where the layout needs six as woff2. 🔴 Whoever does it must **not** put
the files in `public/fonts/`: that glob is what [ADR-1010](DECISIONS.md) spent 612 MB removing.

---

## The checklist, before merging anything structural

1. `pnpm build` locally, then read the `postbuild` output. Both gates must be ✅.
2. `pnpm exec tsc --noEmit` · `pnpm lint` · `pnpm test` (which now carries six of the contract
   guards directly — ADR-1011) · the 20 guards in `ci.yml`'s `guards=( )` array.
3. Migrations: is every file in `supabase/migrations/` actually applied, and does the applied ledger
   contain nothing the repo lacks? A revert can leave the DB **ahead of** the code.
4. After merge: **watch the production deployment reach READY.** A merge is a deploy.
5. If it fails: revert first, diagnose after. Restoring the last known-good tree is not giving up, it
   is buying the time to find the cause with production up. That part of 2026-08-11 was done right.
