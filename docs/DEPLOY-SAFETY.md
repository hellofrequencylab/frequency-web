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

⚠️ **Superseded on 2026-08-17 — the paragraph below is kept because its measurements are still
right and its conclusion is instructive. See rule 10, at the end of this section.**
It reads "leave it alone" because it assumed the build cache *is* the Turbopack cache. It is not:
`@vercel/next`'s `prepareCache` caches `node_modules/**` **and** `.next/cache/**`, and the install is
the bigger, flatter and far more valuable half. A correct fact and a wrong assumption gave a wrong
verdict for five days ([ADR-1064](DECISIONS.md)).

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

### 10. The build cache is `node_modules` **plus** `.next/cache`, and only one half of it grows. 🔒 `check:cache-budget`

**Read the builder, not the guess.** `@vercel/next`'s `prepareCache` is thirty lines and it is the
whole contract — the cache is exactly `node_modules/**`, `<distDir>/cache/**`, `.yarn/cache/**`.
Everything below follows from that, and §9's wrong verdict followed from not having read it.

| Term | Measured 2026-08-17 | Behaviour | Worth |
|---|---|---|---|
| `node_modules` | **948 MB** restored / **1073 MB** fresh | Flat — identical on every warm build | warm install **1s** vs **~15s** cold for 804 packages |
| `.next/cache` | ~92 MiB clean → **618 MiB** at invalidation | **All** of the growth | ~13s of compile (§9) |

**The proof needs no unit convention.** node_modules is reported as 948 MB on *every* warm build, so
100% of the 1.14 GB → 1.53 GB movement is `.next/cache`. The observed run: 1.14 clean, then 1.19,
1.21, 1.23, 1.24, 1.25 … 1.53 → `Invalidating cache`.

- **The cheap half evicts the valuable half, and the build pays both.** Vercel discards the cache
  **whole**, so a compiler cache worth 13s periodically costs an install worth 15s — plus 804
  package downloads' worth of network flake, on a repo that has already lost a deploy to a
  third-party fetch (§9).
- **The trim runs, and the floor fails.** `scripts/check-cache-budget.mjs` drops the **compiler
  caches, by name** (`turbopack`, `rspack`, `webpack`, `swc`) when the estimate would exceed the
  ceiling, so Vercel stores a cache it accepts. Separately, `node_modules` over **1.25 GiB** fails
  the build: a trim can absorb the compiler cache growing, nothing can absorb the install growing.
  Fail-safe plus the gate that notices it fired (rule 6), in one file.
- **🔴 The trim may never touch `.next/cache/fetch-cache`, and this is why.** It used to drop
  subdirectories **biggest-first**, so that growth in a directory nobody had thought of would still
  be caught. `.next/cache` also holds the **incremental fetch cache**, and page-data collection
  prerenders hundreds of Supabase-reading routes: warm those reads are local, cold every one goes to
  the network three workers deep. The one trim that ever ran emptied the cache and **the next two
  builds both died** — ~2.4 min to compile, then hung in *Collecting page data*,
  `BUILD_EXCEEDED_MAXIMUM_TIME` at 46 minutes — while a control branch with a healthy cache finished
  in **59 seconds** ([ADR-1081](DECISIONS.md)). The trim now iterates a named list and can reach
  nothing else; an unrecognised directory is **printed and kept**, because naming growth is a thing a
  build can do and deleting it is not ([ADR-1086](DECISIONS.md)).
- **The threshold is in Vercel's units, and it says so.** Vercel weighs the **packed** archive; this
  script can only see raw bytes, and the two ran **~2:1 apart** while a comment claimed ~3%. The
  conversion is one named constant, `PACKED_PER_RAW = 0.50`, derived from real builds (raw 2.58 GB
  measured here against packed uploads of 1.26–1.33 GB, 2026-08-18) and carried in the file with its
  measurements. It is **provisional**: the raw and packed readings come from different builds, so
  every run prints the raw figure and the ratio next to the `Uploading build cache [N GB]` line to
  compare it with. Do not tune it to make a run green.
- **⚠️ There is no setting that raises the 1.50 GB ceiling.** No `vercel.json` key, no project
  option, no plan toggle — the only cache control Vercel exposes is turning it off for a deployment.
  Build under it.
- **Every build now prints the composition.** `check:cache-budget` names what Vercel is about to
  store and what it is made of. Before it, the only instrument was subtracting two numbers in a log
  tail — and note the trap §9 records: `Build cache: <1 MB` in the build report does **not** measure
  the build cache.

### 11. The bytes a member's phone parses are an artifact too. 🔒 `check:shell-weight`

Rules 1 and 10 weigh what the **deploy** writes. Nothing weighed what the **browser** downloads, and
that gap had already been paid for: dc47b89 found the entire operator admin console statically
reachable from `app/(main)/layout.tsx`, so every member shipped **2.78 MB** of eager JS against
**1.30 MB** outside the shell, to render an admin rail `admin-bar.tsx` returns `null` from. FCP p75
was 4,623 ms against 3,274 ms while TTFB p75 was 155 ms — **the server was fast the whole time**.
That commit fixed it and said so plainly: *there is no guard for this*.

`check:shell-weight` ([ADR-1066](DECISIONS.md#adr-1066)) is that guard, and it is built to work the
same way its two siblings do — on the real build — because `dynamic()` and a static import are one
keyword apart in review and 1.6 MB apart in the artifact.

> 🔴 **IT IS NOT IN `postbuild` YET, AND THAT IS DELIBERATE (LIVE-035).** Both this and
> `check:cache-budget` ship as `pnpm check:` scripts only. Neither has been run against a real
> COMPLETED production build: the attempt on 2026-08-17 died collecting page data for
> `/discover/cities/[citySlug]`, which needs Supabase credentials the agent container deliberately does
> not hold. A build-blocking gate that has never seen a real artifact is this document's own incident
> with the roles reversed — the 2026-08-11 outage was gates that passed while the artifact was broken;
> this would be a gate that fails while the artifact is fine, and it kills deploys just as dead. Run
> both against one green production build, then wire them into `postbuild` in the same commit. It reads
`entryJSFiles['[project]/app/(main)/layout']` from the client-reference manifests, which **is** the
shell's eager first-load JS, and holds it to a budget (**957 KB measured 2026-08-17**, ceiling 1,400
KB). It then does the thing a byte count cannot: it looks for **fingerprints** — literals that exist
in exactly one lazily-mounted admin module — and names any module whose body reappears in those
chunks. That is not a new trick; it is how dc47b89 proved the bug was real, by finding
`"This nexus is archived"` inside a chunk every member downloads.

- **The budget is the loose arm, on purpose.** A paired A/B on one tree measured 1,023 KB raw /
  299 KB gzip before ADR-1066 and 957 / 280 after. **66 KB fits inside any ceiling worth setting** —
  a byte budget alone would have watched six admin bodies enter the shell and said nothing. The
  fingerprints named all six. Rule 2 still applies to the budget; the fingerprints are what make the
  gate specific.

- **The fingerprints fail both ways.** A needle missing from its source file, missing from every
  built chunk, or a positive control missing from the shell's chunks **fails the guard**. "Absent
  from the shell" proves nothing if the string was never findable — rule 6's lesson, applied to the
  gate itself.
- **It has a PR-time half.** `scripts/check-shell-weight.test.ts` asserts the source property and the
  fingerprints' integrity in `test`, because rule 5 means the artifact arm's first chance to fire is
  *after* the merge.
- **What it does NOT cover:** it weighs the shell **layout** entry, not each route's own eager JS. A
  single page shipping 2 MB of its own is invisible to it.

---

## The checklist, before merging anything structural

1. `pnpm build` locally, then read the `postbuild` output. **Every** gate must be ✅ —
   `check:build-budget` (rule 1), `check:og-trace` (rule 6), `check:shell-weight` (rule 11),
   `check:cache-budget` (rule 10). A ⚠️ trim line from the last one is not a failure, but it is
   telling you the cache is at its ceiling.
2. `pnpm exec tsc --noEmit` · `pnpm lint` · `pnpm test` (which now carries six of the contract
   guards directly — ADR-1011) · the 20 guards in `ci.yml`'s `guards=( )` array.
3. Migrations: is every file in `supabase/migrations/` actually applied, and does the applied ledger
   contain nothing the repo lacks? A revert can leave the DB **ahead of** the code.
4. After merge: **watch the production deployment reach READY.** A merge is a deploy.
5. If it fails: revert first, diagnose after. Restoring the last known-good tree is not giving up, it
   is buying the time to find the cause with production up. That part of 2026-08-11 was done right.
