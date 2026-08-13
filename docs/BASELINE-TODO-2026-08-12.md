# Frequency Web — baseline to-do, 2026-08-12

> **Provenance.** Produced 2026-08-12 by a 13-agent fan-out (six parallel dimension scans, each
> adversarially refuted by a second agent, then synthesised). 47 findings survived verification.
> Companion to [`DEPLOY-SAFETY.md`](DEPLOY-SAFETY.md) and ADR-1002/1003. White Label (W1-W5, E10)
> excluded by owner instruction. Items marked CONFIRMED were personally re-verified against the
> code by the refuting agent; PLAUSIBLE ones say what is unproven.

**Prepared 2026-08-12.** Every item below carries `file:line` evidence and an effort estimate. Findings were adversarially verified; where two findings disagree I have adjudicated and said which is right. White Label / W1–W5 / E10 are excluded by owner instruction.

> **Effort key:** **S** ≤ 1 hour · **M** half day to a day · **L** 2–4 days · **XL** a week or more.
> **Status key:** ✅ done · ⏳ in flight · ⚠️ needs an owner decision · 🔴 blocking

---

## ✅ END-OF-DAY STATUS, 2026-08-12 — read this before working any row below

**36 of 47 items are closed.** The Studio/Vera wizards are on `main` (#2105), the baseline sweep
landed (#2106), and the build is gated on the artifact. Every ✅ below was re-verified against the
**code or the live database**, not against another doc — several rows in this repo were false for a
full day, which is the reason for the rule. Where a row is still open, it is open for a stated
reason.

| Item | State | Verified against |
|---|---|---|
| CP-1 Vercel Build Command | ⚠️ **Still open — owner only** | `vercel.json` holds **only** a `crons` array; still no `buildCommand`. Both artifact gates remain unproven |
| CP-2 `studio` in the CI guards | ✅ | `.github/workflows/ci.yml:206-210` — the array now ends `studio creates`. §2 adjudicated "studio only"; both were added, which is harmless |
| CP-3 `/drafts` entrance | ✅ | `lib/nav/registry.ts:429` (`palette: true` ⇒ ⌘K) + `lib/nav/my-frequency.ts:70,146`. **Item 3 was a no-op:** `railFor` defaults to `'global'`, so a member page needs no `page-chrome.ts` line |
| CP-4 `countMyCreateProposals` | ✅ **Option (a)** | Wired at `lib/nav/my-frequency.ts:53,146`. The ADR-246 exception now earns its keep |
| CP-5 `StudioLaunchButton` | ✅ Deleted | Zero hits repo-wide |
| CP-6 ADR-1004 + three false status lines | ✅ | `docs/DECISIONS.md:21821` — and ADR-1006/1007/1008 landed with it |
| CP-7 / CP-8 the re-land | ✅ | `origin/main` = `4bcc51ba6`, carrying #2105 then #2106 |
| CP-9 retire four branches | ⏳ **Verified, awaiting the owner's delete** | All four hold **nothing** `main` lacks — see the box below |
| A-1 `public/tracks` excluded | ✅ | `next.config.ts:223-225` `outputFileTracingExcludes` |
| A-2 icons behind a route · A-3 HEIC door | ✅ ([ADR-1008](DECISIONS.md)) | `app/api/site-icons/route.ts`, `lib/library/heic-decode.ts`; 9.16 GB → **6.45 GB** |
| A-4 / A-6 the `public/` glob + per-entity OG cards | ⏳ In flight elsewhere | The two `opengraph-image.tsx` files are open in another change |
| A-5 fonts off `'/**'` | ✅ | `next.config.ts:92-95` `OG_CARD_FONTS`, keyed per card route; `lib/og/load-nunito.ts:67-71` reads three **literal** paths |
| B-1 the referral prize | ✅ Owner ruling | See §4 — and **its second half is still open, see 🔴 below** |
| B-2 revoke `friendships_freeze_identity` | ✅ Applied | `supabase/migrations/20270224000100_revoke_friendships_freeze_identity_execute.sql`, present in the live ledger |
| B-3 `safeUrl` / `safeHref` | ✅ | `RELATIVE_BASE` parse in **both** `lib/entity-blocks/block-content.ts:814` and `lib/page-editor/richtext.tsx:31` |
| B-4 `signup_leads` comment | ✅ | Migration `20270215000000` now states what the capture door actually allows |
| C-1 … C-10 plan-doc drift | ✅ | Spot-checked live: UX-MATURITY `:398` re-scoped, `:605` reads 11/~7 not 52, BUILD-LIST `:917` carries its SUPERSEDED banner, `app/globals.css:1626` corrected |
| C-11 retract the `node_modules` theory | ✅ | [`DEPLOY-SAFETY.md`](DEPLOY-SAFETY.md) §3 + [`HANDOFF-2026-08-12.md`](HANDOFF-2026-08-12.md) |
| D-1 seven orphans | ✅ **All seven resolved** | Five deleted; the two carrying product weight were **mounted, not deleted** — `createBundleCheckout` at `app/(main)/settings/billing/actions.ts:60` **with** the webhook seating branch (`lib/billing/bundle-seats.ts`), and `requestClaimLink` behind `claim-request-cta.tsx`, both under wiring tests |
| D-2 · D-3 · D-4 · D-5 | ✅ Deleted | `components/elements/` now holds `previews.tsx` alone |
| E-1 17 env vars | ✅ | All 17 present in `.env.example` |
| E-2 "Drafts" names three surfaces | ⚠️ **Still open** | NAMING.md still defines no `Drafts` noun |
| E-3 `check:migrations` ledger rule | ✅ ([ADR-1007](DECISIONS.md)) | Rule 4 compares repo ⇄ **live** ledger head, no pinned numbers |
| E-4 function-grant guard | ⏳ Backlog | Unchanged |
| F-1 the two editor rulings | ⚠️ **Still open** | Unchanged; `EDITOR-ARCHITECTURE.md` is under an open PR |

### CP-9 · the four branches, verified 2026-08-12 — **all four safe to delete**

Verified by content, not by merge topology: a squash merge leaves no ancestry, so `--is-ancestor`
answers "NO" for every one of them and proves nothing either way.

| Branch | Verdict | Evidence |
|---|---|---|
| `feat/studio-kernel` (`78b9ba52b`) | ✅ **Safe to delete — and do not resurrect it** | Re-landed as #2105. The **"unmerged nav work" claim is false**: `git cat-file -t 4444d28b6` → *"Not a valid object name"*, and the drafts entrance is on `main` while the branch **lacks** it (`lib/nav/drafts-entrance.test.ts`, 69 lines, exists only on `main`). Every file it has that `main` lacks is a file `main` deleted on purpose — including `app/opengraph-image.tsx`, **the root metadata image that caused the outage** |
| `claude/studio-reland` (`b29cddc56`) | ✅ Safe to delete | Squash-merged as **#2105** (`merged_at` 2026-08-12T14:57:56Z). Its 11 commits are all in `main`; `main` is strictly ahead (it also narrowed the OG font tracing this branch still carries wide) |
| `fix/codeql-allowlist` (`c55e8b41f`) | ✅ Safe to delete | Squash-merged as **#2099**. All five changed files are **byte-identical** to `main` |
| `fix/codeql-seeder-write-allowlist` (`a2bc8096c`) | ✅ Safe to delete | ⚠️ **The "superseded by #2099" claim is imprecise.** No PR was ever opened for this branch, and #2099 did **not** carry its `lib/safe-image-src.ts` or `loom-image-field.tsx` halves — those reached `main` later via #2105. It is superseded by **#2099 + #2105 together**. Six of its seven files are byte-identical to `main`; the seventh differs only cosmetically (`main` extracted the same `__proto__`/`constructor`/`prototype` guard into `isUnsafeObjectKey()`) |

> ⚠️ One thing to carry forward, not a blocker: in extracting that helper, `main` dropped the
> branch's *"The last inch"* comment explaining **why** the guard sits at the write rather than
> upstream — *"consolidating it upstream for elegance is exactly what let the alerts come back once
> already."* The guard is intact; only its rationale was lost.

### ✅ Both promises are down — see §4, B-1 and B-1b

The owner ruled on B-1b the same day and the same way as B-1: **take the copy down** (option 1).
`/referral` no longer offers Founding-Member perks, the clause is out of both beta email catalog
rows, and `FOUNDING_PERK_MIN_REFERRALS` plus the `foundingPerkEarned` / `toFoundingPerk` fields are
deleted. The page states only the two payouts the ledger makes, and reads them from the constants
that grant them so the copy cannot drift. Guarded by `lib/beta/referral-contest.test.ts`.

---

## 0. State of the world — four corrections to the findings, verified just now

The findings were gathered against a moving tree. Four of them are already stale in your favour, and you should not spend time on them:

| Finding said | Actually now | Evidence |
|---|---|---|
| `claude/studio-reland` is unpushed, one container teardown from gone | ✅ **Pushed and in sync.** `origin/claude/studio-reland` = `bc58686fb`, `rev-list --left-right --count` → `0 0` | `git ls-remote --heads origin` |
| Its tracking ref points at `origin/main`, so a bare `git push` lands 7 commits on main with no PR | ✅ **Fixed.** Upstream is now `origin/claude/studio-reland` | `git branch -vv` |
| `loom-image-field.tsx` keeps a private copy of the image guard (finding 34) | ✅ **Fixed** — it is the branch tip commit, *"One image allowlist, not a private copy in the Loom control"* | `bc58686fb` |
| The branch is 7 commits | It is **8**: `71670e182 → 8c94c0156 → 8a8687aa3 → a5916edaa → 81543ea2e → a9cdba229 → 7c4eb8a12 → bc58686fb` | `git log origin/main..claude/studio-reland` |

Production is **not** down. `origin/main` (`73058faae`) carries the ADR-1002 OG fix and deploys. The Studio/Vera kernel is off main, intact on a green branch measuring **9.98 GB against a 13 GB budget**. This is a merge-and-verify operation, not a repair.

---

## 1. CRITICAL PATH — production deploys AND the Studio/Vera wizards go live

Do these in order. Everything from §2 down waits.

### CP-1 · Prove the Vercel Build Command is `pnpm build`, then pin it ⚠️🔴 · **S**

**This is the only load-bearing fact in the whole plan that nobody has verified.** Both artifact gates — the ones that would have caught the 2026-08-11 ENOSPC — run as `postbuild`, not in CI:

- `package.json:8` → `"postbuild": "node scripts/check-build-budget.mjs && node scripts/check-og-trace.mjs"`
- `vercel.json` contains **only** a `crons` array. No `buildCommand`.
- `.github/workflows/ci.yml:4` is a comment stating Vercel owns `next build`.

If the Vercel dashboard's Build Command has ever been overridden to `next build`, `pnpm run build`, or anything that skips pnpm lifecycle scripts, **both size gates are dead and nothing tells you.** pnpm 10.33.0 honours pre/post scripts (verified by scratch package), so the wiring is correct *if* the command is right.

**Action:** read the project setting, then write `"buildCommand": "pnpm build"` into `vercel.json` so it cannot be changed silently again. Needs your dashboard access — no agent can close this.

### CP-2 · Add `studio` to the CI guards array + fix the AGENTS.md claim ✅-safe · **S**

`.github/workflows/ci.yml:172-175` lists 26 guards: `authz canon menu gate-parity workflows elements labels render-path help tokens phantom bridge contrast adoption headers seo collective crm-parity vocab rls grants admin-client migrations adr docs-links templates`. Neither `studio` nor `creates` is present.

`scripts/check-studio.mjs` is the **only** mechanical enforcement of #2098's central architectural claim — the one-way kernel→entity arrow. Its own header: *"That property survives only while the dependency arrow points ONE way… so it cannot decay through good intentions."* It exits 0 today, so it lands clean.

Meanwhile `AGENTS.md:114` asserts *"Enforced in CI by `pnpm check:studio` + `lib/studio/registry.test.ts`"* — and `lib/studio/registry.test.ts:8` says the opposite, that the filesystem property is left to the guard. Fix both in the same commit.

**Must ride in the reland PR.** After 215 files land, the first violating import arrives with nothing to catch it.

### CP-3 · Give `/drafts` an entrance — three data rows ✅-safe · **S**

`app/(main)/drafts/page.tsx` is a finished member-facing IndexTemplate page with `metadata.title = 'Drafts'` and **zero entry points repo-wide**. `grep -rn "['\"`]/drafts" app lib components` returns only self-references (`actions.ts:27/35/51` revalidatePath, `draft-row.tsx:57` router.push fallback, `page.tsx:64` its own breadcrumb). No row in `lib/nav/registry.ts`, `lib/nav/my-frequency.ts`, `lib/nav/studio.ts`, `lib/apps/`; no entry in `lib/layout/page-chrome.ts`.

ADR-998 shipped this page as the member-visible half of governed create proposals; ADR-1001 made it additionally the member's **erasure surface** for staged wizard answers. Both are reachability-dependent by construction. As it stands, a Vera proposal expires in silence — the exact defect ADR-998 exists to close.

The nav commit that would have fixed it (`4444d28b6`) is unrecoverable — not in the object DB, on no remote ref.

**Three rows, not a rewrite:**
1. One row in `lib/nav/registry.ts` — this also lights up ⌘K for free, because `components/search/search-overlay.tsx:109` projects its "Go to" group from `paletteDestinations(viewer, trimmed)`.
2. One My Frequency entry in `lib/nav/my-frequency.ts` using the existing `notices`/`total` shape, counted as `listMyCreateProposals().length + listStagedDrafts(profileId).length` — so the proposals-only badge the handoff describes is never re-landed.
3. One line in `lib/layout/page-chrome.ts`.

### CP-4 · Decide `countMyCreateProposals`: wire it or delete it ⚠️ · **S–M**

`lib/ai/vera/create-entity.ts:432` defines it. Repo-wide it has **two** references: its own definition and a prose mention at `create-tools.test.ts:80`. Its docblock at `:418` claims *"This runs in the app shell on EVERY page load (the My Frequency menu, `lib/nav/my-frequency.ts`)"* — that file contains no draft reference at all; its only hrefs are `/spaces/${s.slug}` and `/circles/${c.slug}`. The real consumer, `app/(main)/drafts/page.tsx:41-44`, calls `listMyCreateProposals()` — the function the docblock argues against. `COUNTABLE_CREATE_ENTITIES` (`:410`) is used only at `:447`, inside the dead function, and `:446` carries a deliberate **ADR-246 rule-break** for jsonb arrow filters.

So: a React-cached, index-justified count with a paragraph of performance rationale and a deliberate ADR exception, bought for a badge nobody renders.

**Decide:** (a) wire the badge into `lib/nav/my-frequency.ts` — which is what CP-3 item 2 is doing anyway, and makes the filter and the ADR-246 exception earn their keep; or (b) delete `countMyCreateProposals` + `COUNTABLE_CREATE_ENTITIES`. **Do not merge with the false docblock intact.** (a) is the natural choice given CP-3.

### CP-5 · Decide `StudioLaunchButton` ⚠️ · **S**

`components/studio/kit/studio-launch-button.tsx:12` has zero importers on this branch, and its header at `:9` claims *"Used by NewJourneyButton"* — `components/studio/journey/new-journey-button.tsx` imports only `next/link` and lucide's `Plus`.

**This is orphaned BY the reland, not before it.** `git grep -n StudioLaunchButton main` → `main:components/studio/market/new-listing-button.tsx:6,57,147`. The reland rewrote that file into a plain Link under ADR-986 (its new header: *"A LINK, not a modal launcher, on purpose"*). Its sibling `StudioWindow` remains live in three places.

**Decide inside the PR:** if ADR-986 makes every create entry point a deep-linkable Spark link, the modal launcher has no future consumer — delete it. Otherwise keep it and fix `:9`.

### CP-6 · Write ADR-1004 and strike three false status lines ✅-safe · **S**

`docs/DECISIONS.md:21594` still asserts **"No commit crossed the disk."** The branch's own commit `a9cdba229` says: *"⚠️ This corrects ADR-1002's 'no commit crossed the disk'. That was measured on main alone, where it held. #2098 does cross it, hugely"* — with the table main 16.73 GB / +ADR-1002 9.80 GB / **+Studio spread path 57.23 GB** / +this fix 9.98 GB. The code fix is in the tree (`lib/ai/quality-gate.ts:169`, `const RUBRIC_DIR = join(process.cwd(), 'content', 'leader-training', 'authoring')` replacing the spread `rubricPath`) — the ADR is not. There is no ADR-1004; `grep '^## ADR-100' docs/DECISIONS.md` returns only 1000, 1002, 1001, 1003.

> ✅ **CLOSED 2026-08-12.** ADR-1004 exists (`docs/DECISIONS.md:21821`, *"Correcting ADR-1002 — a
> commit did cross the disk, and the gate is what found it"*), and ADR-1006/1007/1008 landed in the
> same pass. `grep '^## ADR-10' docs/DECISIONS.md` now returns 1000, 1002, 1001, 1003, 1004, 1006,
> 1007, 1008. ⚠️ **The number between 1004 and 1006 is a gap** — no entry was ever written at it, and
> nothing in the repo references it, which is why `check:adr` stays green. Either a number was
> reserved and abandoned or one was skipped. Worth an owner glance; harmless either way. *(Written
> without spelling the number, because `check:adr` reads any `ADR-nnnn` token as a citation and
> fails on one a reader cannot follow — which is the guard working, and how this note was caught.)*

The consequence is a misled reader, not a repeat outage — `check-build-budget.mjs:40` sets `BUDGET_GB = 13`, so a 57 GB relapse fails the build regardless. But the 57 GB path is one `join(cwd(), ...spread)` away from returning and nothing in DECISIONS.md warns about the class.

Same pass, strike the two false "UNAPPLIED" statements — `docs/DECISIONS.md:21675` (§1) and `:21765` (Consequences) — and `docs/HANDOFF-2026-08-12.md:171`. ADR-1001's header at `:21641` (*"migration applied 2026-08-12"*) is the correct one: prod returns `to_regclass('public.studio_draft')` with 9 columns.

Land it in the PR carrying `a9cdba229` so the doc and the fix cannot separate again.

### CP-7 · Open ONE PR: `claude/studio-reland` → `origin/main` (73058faae) 🔴 · **S**

**Do not cut from `origin/feat/studio-kernel`** (still live at `78b9ba52b`). Verified:
- `git merge-base --is-ancestor 3bb950d00 origin/feat/studio-kernel` → **NO**. It does not contain the merged #2099.
- `git merge-base origin/main origin/feat/studio-kernel` → `3f8d62b89`, the commit *before* #2098.
- `git diff --stat 3bb950d00 origin/feat/studio-kernel` over the four #2099 files → 4 files, **26 insertions, 164 deletions** (`lib/events/seed/draft.ts` alone 106 lines). Moving to that branch *removes* the security work.
- Its `lib/safe-image-src.ts:23` is the weak `if (s.startsWith('/')) return s`; the reland's version parses through `RELATIVE_BASE = 'https://relative.invalid'`.

Its commit titles ("Potential fix for pull request finding CodeQL/Prototype-polluting assignment") make the security work look present. It is an earlier, different resolution. Reading "18 commits ahead" as "most complete" re-opens closed prototype-pollution and DOM-text-as-HTML alerts.

Skip the old advice to "land the OG fix alone first" — it is already merged at `73058faae`. And note the OG fix alone would **not** have made this re-land survivable: `a9cdba229` measures Studio-on-top-of-ADR-1002 at **57.23 GB**.

### CP-8 · Merge, then watch the deploy through "Deploying outputs" 🔴 · **S**

Five things self-heal on merge and need no separate action:

| Currently broken on `origin/main` | Fixed by the merge |
|---|---|
| Ledger guard pins 602 while prod has 605 — `scripts/maintenance/ledger-parity.test.ts:56` `expect(rows.length).toBe(602)`, restored by the #2102 revert | Re-pinned to 605 by `7c4eb8a12`, 20/20 pass |
| 3 migration files missing (`20270222000000_event_intake`, `20270223000000_studio_steer`, `20270224000000_studio_draft`) so `check:rls`/`check:grants` are blind to three live tables | All three plus their `rls-deny-all.txt` / `table-grants.txt` rows are staged |
| `safeImageSrc` leading-slash pass-through live — `git show origin/main:lib/safe-image-src.ts` line 23 | Hardened by `a5916edaa` + 15 lines of regression test |
| No artifact gate at all — `git show origin/main:package.json` has no `postbuild` | `81543ea2e` adds it |
| `check-build-budget.mjs` does not exist on main | Added by `81543ea2e` |

**If the reland slips more than a few days**, that changes: main is then knowingly running a lying parity guard over two uncovered production tables. Back-port in that case: the three migration files + two txt rows (pure `create table if not exists`, replays clean), and cherry-pick `a5916edaa` and `81543ea2e` independently.

### CP-9 · Retire the four dead branches ✅-safe · **S**

`origin/feat/studio-kernel` → rename `archive/studio-kernel-superseded` so its ahead-count stops reading as authority. Delete `claude/studio-reland-old` (`7cc993708`), `origin/fix/codeql-allowlist`, `origin/fix/codeql-seeder-write-allowlist` — everything on both CodeQL branches is now at HEAD following `bc58686fb`, so the handoff's "keep whichever is stricter" reconcile (`docs/HANDOFF-2026-08-12.md:169`) is a no-op.

---

## 2. Conflicts and overlaps — adjudicated

Read this before assigning any work below; six findings collapse into three items.

| Conflict | Ruling |
|---|---|
| **Three findings say "wire `check:studio` + `check:creates` into CI"** (build-deploy, reland, orphans). One says *do not* add `creates` — it already runs. | **The dissenter is right, and I re-verified it.** `scripts/check-creates.test.ts:236` opens `describe('check-creates · the live repo')` and calls `runCheck()` asserting `violations` empty and the ratchet total equals `CREATE_ENTRIES.size`; `.github/workflows/ci.yml:119` runs `pnpm test`. So `creates` is genuinely enforced. Adding it to the guards array is harmless but redundant. **Add `studio` only.** It has no test wrapper — `lib/studio/registry.test.ts:8` explicitly defers to the guard. |
| **One finding proposes adding `og-trace` to the ci.yml guards array**; another says that would break the build. | **The objection is right.** The guards step runs pre-build; there is no `.next` to read, so it fails for a reason no PR can fix. `og-trace` and `build-budget` are correctly wired as `postbuild` (`package.json:8`). Do not move them. |
| **`public/` glob (62 fns), og-trace headroom (67/70), and libvips fan-out (83 fns)** are filed as three findings. | **One defect cluster, three symptoms.** The 62 carriers are exactly the segments whose OG modules take a variable path: `app/(main)/spaces/[slug]/**` (49 + og/twitter), `app/(main)/events/[slug]/**` (6), the three claim segments. Fixing `spaces/[slug]/opengraph-image.tsx` structurally resolves all three. Treat as **A-6** below, with A-1/A-4 as the cheap partial. |
| **iconify (2.31 GB) and heic2any (515 MB)** filed separately. | **Same carrier component.** `components/loom/loom-picker.tsx:19` imports `searchSiteIcons`; `:21` imports `image-shrink`. One pass at LoomPicker's import surface narrows both. Do them together — **A-2/A-3**. |
| **"17 env vars missing from .env.example"** vs **"RECRAFT_API_KEY missing from .env.example."** | The second is a **subset** of the first. Do the 17. Note the RECRAFT finding's actual thesis (that the key is unset in Vercel) is **PLAUSIBLE only** — unprovable from the repo, since the code is identical either way. |
| **`docs/FINALIZE-PLAN.md:928`** lists `<AppElement>` under "genuinely finished — do not re-audit" as *"deleted, not orphaned"*; **`docs/EMBEDDABLE-ELEMENTS.md:48-58`** flags it 🔴 as still referenced. | **EMBEDDABLE-ELEMENTS is right.** The mounter is gone (`ls components/elements/` → `previews.tsx, registry.test.ts, registry.tsx`) but the map `ELEMENT_COMPONENTS` (`registry.tsx:31`) is not. Fix FINALIZE-PLAN in the same pass as D-5. |
| **`docs/UX-MATURITY-PLAN.md:602`** sizes kit sweeps at **52 sites**; **`docs/BUILD-LIST.md:1222`** says the triage pass ran and `bespoke-cards` 24→0, `bespoke-rows` 14→0. | **BUILD-LIST is right; the live checker agrees.** `node scripts/check-adoption.mjs` → both at 0/0, `handrolled-icon-button` 3, `adhoc-progress` 8, `handrolled-tabs` 0 = **11**, and `BUILD-LIST.md:1220` records 4 of the 8 `adhoc-progress` hits as false positives (`rounded-pill object-cover` avatars). **True remaining population ≈ 7. The row is overstated ~7×, not ~5×.** |
| **The contrast row**: one reading says ADR-980's 16 dark-mode failures are closed and the row should be struck. | **Partially.** Strike is wrong. `test/e2e/a11y-baselines.json`'s own header says amber used as **display text** (`.text-primary` headlines at 2.18–2.86:1) and the `.text-text/10` watermark numerals in dark are *"NOT WAIVED, and staying failed on purpose"* — that residue is what the `/spaces` (2) and `/the-community` (3) dark baselines still count. **Re-scope to the residue.** |

---

## 3. Build headroom — the mechanism that killed production, one layer down

Ranked by bytes recovered per hour spent. Total addressable: **~4.4 GB** of a 9.98 GB build. None of this is blocking today (the gate passes with 3 GB spare); all of it is the headroom your next feature will want.

### A-1 · Exclude `public/tracks` from tracing — 877 MB ✅-safe · **S** — *best ratio on the board*

`public/tracks` is 877.5 MB, traced into exactly 62 functions. The **only** server reference to the mp3s is `lib/on-air.ts:338-340`, emitting URL strings (`'/tracks/forest.mp3'`) for the browser player. No server code opens them.

`next.config.ts` has `outputFileTracingIncludes` at `:122` and **no `outputFileTracingExcludes` at all**. Add:

```ts
outputFileTracingExcludes: { '/**': ['./public/tracks/**'] }
```

Cannot regress behaviour, because nothing reads those files server-side. One config line, 877 MB.

### A-2 · Move `searchSiteIcons` behind a route handler — 2.31 GB · **M** — *largest single line in the artifact*

`node scripts/check-build-budget.mjs` prints this as its top cost: **2315 MB (6.9 MB × 337 fns)**. Byte-probed: offsets 1M/3M/5M are Phosphor glyph bodies, offset 7M is Tabler.

- `lib/loom/site-icons.ts:14-16` statically imports `@iconify-json/lucide` (577 KB), `ph` (4.57 MB), `tabler` (2.12 MB) `icons.json`.
- `components/loom/loom-picker.tsx:19` imports `searchSiteIcons` from it.
- LoomPicker is statically imported by 10 components including `components/ui/image-upload.tsx:7`, `multi-image-upload.tsx:7`, `header-image-field.tsx:7`, `components/elements/registry.tsx:13`, `components/studio/spark/field/field-control.tsx:23`.

No ADR accepts this cost — ADR-505 only decided the sets are build-time data. Same mechanism as ADR-1002, one layer down.

**Fix:** put `searchSiteIcons` behind `app/api/site-icons/route.ts` and have LoomPicker's Icons view fetch it. **Do not forget the second importer:** `components/ui/icon.tsx:3-5` imports the same three collections (RSC-only, 2 consumers — `app/(main)/admin/library/icons-lane-view.tsx`, `app/onboarding/sequence-preview/page.tsx`). Floor after the fix is **~3 functions, not 1**. Verify with `scripts/check-build-budget.mjs`, **never** by inspecting the client bundle.

### A-3 · Isolate the HEIC decode branch — 515 MB · **M** — *do with A-2*

`515.1 MB = 1320 KB × 381 fns .next/server/chunks/ssr/0yk4_heic2any_dist_heic2any_12pcxeh.js`. The dynamic import is `lib/library/image-shrink.ts:176`, inside a browser-only decode path. Turbopack still emits an SSR copy of the client component graph, so nft traces the async chunk everywhere that graph reaches: (main) 296, (marketing) 38, discover 22, onboarding 5, (capture) 4, (help) 4, ~12 top-level.

A WASM decoder whose purpose is running in the user's browser, copied into 381 server functions where it can never execute.

**Fix:** client-only boundary (`next/dynamic` with `ssr:false` on a thin wrapper), or a specifier nft cannot statically resolve. The wide path is `loom-picker.tsx:21` → `image-shrink`, not the `capture-launcher` chain the original diagnosis named (which cannot account for the 85 carriers outside `(main)`) — **narrow both.** `docs/DEPLOY-SAFETY.md §7` records the identical lesson: a lazy import does not stop nft reading the literal specifier out of the emitted chunk.

### A-4 · Kill the `public/` glob at source — ~690 MB · **S–M**

After A-1, `public/images` (686.4 MB), `public/maplibre` (31.0 MB), `public/vera-avatar.png` (6.8 MB), `public/icons` (5.1 MB) are still in the same 62 functions. Three call sites take a variable path:

- `app/(main)/spaces/[slug]/opengraph-image.tsx:45-49`
- `app/(main)/events/[slug]/opengraph-image.tsx:48-52` — its **only** caller is line 175, `localImage('images/Frequency-Logo-Round-Icon-white.png')`, a literal. Inline it.
- `lib/og/claim-card.tsx:27-31`

The spaces card's non-literal argument comes from `lib/spaces/cover-placeholder.ts:8-15`, a frozen 6-entry `as const` array — so a `Record` of literal-pathed `readFile` calls closes it exactly.

**Precedent, in-repo:** HEAD commit `a9cdba229` fixed this exact failure mode in `lib/ai/quality-gate.ts`, where a spread path globbed the repo root into ~300 functions (47 GB).

*Honest caveat:* nobody instrumented `@vercel/nft` to prove globbing is the mechanism. The inference rests on the carrier set matching the three call sites exactly, plus the identical documented case. Strong but circumstantial.

### A-5 · Fonts: literal reads + move off the `'/**'` key — ~290 MB ✅-safe · **S**

`LiberationSans-Bold.ttf` 199.8 MB (405 KB × 482), `Nunito-Bold` 60.5 MB, `Nunito-Black` 60.4 MB — all three named at `next.config.ts:143-148` under `'/**'`. Plus `LiberationSans-Regular.ttf` 28.3 MB (× 69), which is **not** in the include list; its 69 carriers are exactly the functions reaching `lib/og/load-nunito.ts:40` `readFile(join(process.cwd(), 'public/fonts', file))` with `file` a parameter. `public/fonts` holds exactly 4 ttf files — a directory glob explains the fourth precisely. Only 16 routes rasterise a card.

This also corrects the record on the config's own comment: `next.config.ts:138-142` says it named three faces specifically so the `*.ttf` glob would not sweep in LiberationSans-Regular *"which nothing reads from disk"*. That reasoning was right; a different code path swept it in anyway.

**Fix:** `loadNunito` only ever calls `read()` with three literals (`:74-79`) — replace the parameterised helper with literal-pathed reads, then move the three font entries off `'/**'` onto the card routes. Keep the belt-and-braces intent at `:132-137`: Satori throws on an empty fonts array, so verify the OG routes still trace the faces. **Leave `content/help` on `'/**'`** (91.9 MB) unless verified — `lib/help/content.ts:14` reads it at runtime.

### A-6 · The `spaces/[slug]` OG card — 890 MB + the headroom problem ⚠️ · **L**

This is the cluster from §2. `libvips-cpp.so.8.18.3` is 18,195,640 bytes in exactly 83 traces = **1.51 GB, 15% of the build**; 49 of those 83 are under `app/(main)/spaces/[slug]`, all inherited from one file. Add sharp-linux-x64 `.node` 34.5 MB, `resvg.wasm` 114.4 MB (×83), `@vercel/og` index.node.js 72.3 MB + index.edge.js 61.0 MB.

**The actionable half is the headroom, not the gigabytes.** `node scripts/check-og-trace.mjs` prints: *"sharp ships to all 16 rasterising route(s), and to **67** other function(s) by segment inheritance (budget **70**)."* Three functions of slack, under a subtree that already has 49 pages. **Adding four ordinary pages under `spaces/[slug]` — a routine product change — fails a disk gate whose failure message talks about share cards.**

Note the framing correction: the ~1.39 GB is **not an unfixed oversight**. `scripts/check-og-trace.mjs:33-38` explicitly documents segment-level inheritance as legitimate (*"those cards are per entity so they cannot become static files"*), and ADR-1002 fixed only the root case on purpose. Under this repo's rules that is a deliberate documented decision.

**Two options, and this needs your call:**
- **Cheap (S):** raise `MAX_INCIDENTAL` deliberately with the reason in the commit. The guard's own comment at `:33-41` explicitly permits this and says raising it *"is a real decision."* Buys the breathing room, banks none of the bytes.
- **Structural (L):** move each per-entity card to a plain route handler (`app/api/og/space/[slug]/route.tsx`) and point `openGraph.images` at that URL from `generateMetadata`. Removes metadata-image inheritance entirely, drives `MAX_INCIDENTAL` to ~0, recovers ~890 MB. Costs: absolute-URL construction, cache-header parity with `lib/og/deliver.ts`, and **re-proving the privacy contract the spaces card documents at `:29-32`** — a private Space must render the identity-free card.

Also worth banking here: `check-build-budget.mjs`'s ratchet comment says the number *"may fall, and raising it is a decision that needs a reason in the commit."* After A-1…A-5 land, lower `BUDGET_GB`.

### A-7 · The irreducible floor — **XL, do not chase** ℹ️

Recorded only so nobody hunts it. `617.9 MB = 1547 KB × 390 fns` in `node_modules__pnpm_19w914v._.js` — a merged blob with supabase, zod, anthropic and stripe markers, no single library. Plus `app-page-turbo.runtime.prod.js` 334.6 MB (678 KB × 482), zod 85.4 MB, jsonwebtoken 58.3 MB, two `lib/billing/stripe` chunks 130.5 MB, `@anthropic-ai/sdk` across **four** chunks ≈ 207 MB.

After the named fixes the build lands near **6.7 GB**, of which ~1.5 GB is merged-vendor fan-out no single fix reaches. **Relevant before anyone proposes lowering `BUDGET_GB` below ~7.** The four anthropic chunks and two stripe chunks are worth exactly one look for duplicate chunking, no more.

*(Also close ADR-1002's loose ends here: `docs/DECISIONS.md:21636-21638` names two multi-GB duplication lines and assigns them to nobody. A-1 and A-2 are those two lines. Add them as rows on BUILD-LIST so they have an owner — see C-10.)*

---

## 4. Correctness and product landmines

### B-1 · `graduateBeta()` is unreachable, so the referral contest prizes can never fire ✅ **CLOSED — owner ruling, 2026-08-12: the promise came down, not the mechanism up**

> **Resolution (supersedes the "Decide: (a)/(b)" below, which is kept for the record).** Neither option
> was taken. The beta program is over: `billing_live` has been on for three weeks, and the contest board
> was empty (0 referrals, 0 founding grants), so no member was owed anything. Rather than wire a payout
> path for a finished program, the owner ruled that **the page may only claim what the code does**.
>
> | What | State |
> |---|---|
> | `lib/beta/graduation.ts` (`graduateBeta`, `GRADUATE_CONFIRM`) | 🔴 deleted |
> | `awardReferralWinners` + `WINNER_PRIZE_MONTHS` (`lib/beta/referral-contest.ts`) | 🔴 deleted, with the podium test assertions |
> | `/referral` prize copy ("the top referrers win free membership") | 🔴 removed; the page now states the Zaps it actually pays |
> | Referral + Circle-starter scoring, Zaps, leaderboard | ✅ unchanged and live |
>
> ### ✅ B-1b · The second unbacked promise — RULED 2026-08-12: option 1, take the copy down
>
> **Resolution (the brief below is kept verbatim as the record that produced it).** The owner ruled
> the same way as B-1. Shipped: the perks card and `foundingCopy` are gone from
> `app/(main)/referral/page.tsx`; `FOUNDING_PERK_MIN_REFERRALS`, the docstring citing the deleted
> "at graduation" mechanism, and the `foundingPerkEarned` / `toFoundingPerk` fields are gone from
> `lib/beta/referral-contest.ts`, so the file no longer violates its own stated rule; the "win
> founding perks" clause is out of both `lib/beta/email-templates.ts` and `lib/beta/launch-emails.ts`.
> In its place the page and both emails state the two payouts that are real, and the page renders
> them from `ZAP_AMOUNTS.referral_activated` (25) and `CIRCLE_STARTER_ZAPS` (150) rather than from
> literals, so no surface can outrun the ledger. `grantFoundingStatus` (option 2's lever) was
> deliberately **kept**: it is live for reserved founders through beta onboarding and the Stripe
> webhook, and it was never the referrer path. A guard in `lib/beta/referral-contest.test.ts` fails
> if any of the three surfaces states the claim again.
>
> **The answer first:** `/referral` offers **Founding-Member perks at 3 activated referrals**, and
> **no code path grants them.** `reward_kind: 'founding_perk'` has **zero** occurrences in the
> repo — its only writer was the insert inside the deleted `awardReferralWinners`. Nothing was
> touched here; this is a map, not a fix.
>
> **Nobody is currently being shown it, and nobody is owed anything.** Verified against production
> 2026-08-12: `platform_flags.beta_referral_contest` = **false**, so
> `app/(main)/referral/page.tsx:47` calls `notFound()` and the whole surface 404s. `beta_referrals`
> holds **0** rows and `reward_grants` holds **0** rows with `reward_kind = 'founding_perk'`. The
> exposure is latent — one flag flip away — not live.
>
> **Every surface that states or implies the offer:**
>
> | Surface | What it says | Reachable today? |
> |---|---|---|
> | `app/(main)/referral/page.tsx:93-104` | A `Gift`-iconed card headed **"Founding-Member perks"** with a `ProgressTrack` to 3 | 🔴 Only if the flag flips |
> | `app/(main)/referral/page.tsx:59-63` | *"You earned Founding-Member perks. Nice work."* / *"N more activated friends to earn Founding-Member perks."* | 🔴 Same |
> | `lib/beta/referral-contest.ts:50` | Docstring: *"threshold that earns Founding-Member perks **at graduation**"* — graduation is the deleted mechanism | ℹ️ Comment |
> | `lib/beta/referral-contest.ts:413,422` | `foundingPerkEarned`, `toFoundingPerk` — computed, returned, rendered, and **never acted on** | 🔴 Same |
> | `lib/beta/email-templates.ts:118,128` | Subject **"Bring a friend, start a Circle, win founding perks"**; body *"…win founding perks and a spot in the launch story."* | ⚠️ In the operator catalog, re-sendable |
> | `lib/beta/launch-emails.ts:246,270` | The same email as blocks, same subject and same sentence | ⚠️ Same |
>
> Both emails are live rows in the Email Studio catalog (`app/(main)/admin/email-studio/actions.ts`,
> `components/admin/beta/email-section.tsx`), so an operator can re-send the claim tomorrow without
> touching code.
>
> **What could still honour it.** One thing, and it was built for a different purpose:
> `grantFoundingStatus({ profileId, kind: 'member' })` (`lib/founding/status.ts:325`) creates an
> ACTIVE founding row at the locked rate. It is live at `app/onboarding/beta/actions.ts:228` and via
> the Stripe webhook (`lib/billing/beta-founding.ts:95`), and it serves **reserved** founders — never
> referrers. Wiring it to the referral threshold is a few lines; it is also the one call that hands
> out paid entitlement, which is why it is your call and not an agent's.
>
> **The sharpest detail:** `lib/beta/referral-contest.ts:24-26` states the governing rule in its own
> header — *"the rewards this module still pays are Zaps… and they are the only rewards the copy may
> claim."* Twenty-five lines later the same file exports `FOUNDING_PERK_MIN_REFERRALS`. **The file
> violates its own rule.**
>
> **The options, in ascending cost:**
>
> | # | Option | What it costs | What it risks |
> |---|---|---|---|
> | 1 | **Take the copy down**, exactly as the prize came down — delete the perks card, `foundingCopy`, `foundingPerkEarned`/`toFoundingPerk`, and the "founding perks" clause from both emails | S. The page keeps the Zaps and the leaderboard, which do pay | Nothing owed: 0 referrals, 0 grants. Consistent with the 2026-08-12 ruling |
> | 2 | **Honour it** — call `grantFoundingStatus({kind:'member'})` when `activatedReferrals` crosses 3, idempotently | S–M, plus a backfill decision (none needed at 0 rows) | Founding status is a **locked price**. Every future referrer at 3 earns real margin |
> | 3 | **Retire the contest whole** — the flag has been false since launch and the beta is over | S | Loses the Zaps payouts and the leaderboard with it |
> | 4 | **Leave it** | 0 | The defect that produced B-1 in the first place, knowingly repeated. Not recommended |
>
> Option 1 is the consistent reading of the ruling already made ("the page may only claim what the
> code does"); option 2 is the only one that makes the rendered progress bar true. **Do not let an
> agent pick between them.**

*Original finding, for the record:*

`lib/beta/graduation.ts:33` exports `graduateBeta(confirm)`. A repo-wide grep for `graduateBeta|GRADUATE_CONFIRM` outside that file returns **only prose** (`referral-contest.ts:458,470`, `founding/status.ts:12,312`, `beta/audit.ts:18`). No route, action, admin UI or cron imports the module. `awardReferralWinners` (`lib/beta/referral-contest.ts:473`) has exactly one caller repo-wide — `graduation.ts:68` — so it is transitively unreachable.

Meanwhile the flag it was meant to accompany **has a live operator button**: `app/(main)/admin/pricing/pricing-console.tsx:779` renders a `billing_live` FlagRow through `setPricingFlag` with a `window.confirm` at `:848`.

**The trap is precise.** An operator flips `billing_live` from a complete-looking, confirm-guarded console, and the referral / Circle-starter contest prizes are silently never recorded. `lib/beta/referral-contest.ts:21` states the contract the product promised members: *"Prizes are RECORDED at graduation (awardReferralWinners)."* Graduation day happens once and is not re-runnable by hand without someone knowing this file exists.

Framing corrections from verification: `grantFoundingStatus` is **not** graduation-only — it is live at `app/onboarding/beta/actions.ts:228` and `app/api/webhooks/stripe/route.ts:31` → `lib/billing/beta-founding.ts:95`. What is genuinely dead is the untargeted sweep form (`graduation.ts:57`), the contest award (`:68`), and the `graduate_beta` audit row (`:76`).

**Decide:** (a) make the `billing_live` FlagRow's ON path call `graduateBeta()` instead of the bare `setPricingFlag`, so the flip carries its grants and audit row; or (b) add a janitor-gated "Graduate the beta" control to the pricing/beta console calling `graduateBeta(GRADUATE_CONFIRM)`. Either way, fix the stale header at `lib/beta/graduation.ts:7-9`, which claims the function does **not** grant founding status or award winners while the body does both.

### B-2 · Revoke `friendships_freeze_identity` from anon ✅-safe · **S**

Queried production directly: `pg_proc` for public SECURITY DEFINER trigger-returning functions where `has_function_privilege('anon', oid, 'EXECUTE')` returns exactly **one** row — `friendships_freeze_identity`, proacl `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}`. Every other trigger function is correctly revoked.

The cause: `supabase/migrations/20261231000000_revoke_trigger_fn_rest_execute.sql` is a one-shot `do $$` loop whose comment claims *"a trigger function added later by another migration is covered on the next `db reset` replay."* Replay is version-ordered, so it runs **before** `20270221000000_friendships_freeze_identity_on_update.sql`, which creates the function `security definer` returning trigger with no revoke.

Exploitability is essentially nil — plpgsql returning trigger raises outside trigger context and PostgREST cannot use that return type. What is real is a **false stated invariant in a security migration**, and the class it belongs to (a SECURITY DEFINER function that *does* return data left anon-executable) has **no repo-side gate at all**: `scripts/` has `check-grants.mjs` (tables only) and nothing anywhere references `has_function_privilege` or asserts over `grant execute`. The catalog shows 29 anon-executable SECURITY DEFINER functions in `public`.

**Fix:** one-line `revoke execute on function public.friendships_freeze_identity() from public, anon, authenticated;` in a new migration, plus correct the `20261231000000` comment to say the loop is one-shot. **The durable fix** — a function-grant sibling to `check-grants.mjs` that replays create-function statements out of migrations and demands a verdict per function — is **M** and belongs on the backlog.

### B-3 · `safeUrl` / `safeHref` return protocol-relative URLs their comments say they block ✅-safe · **S**

`lib/entity-blocks/block-content.ts:810-819`. The comment: *"Everything else (javascript:, data:, vbscript:, protocol-relative) becomes '' so it never reaches an href/src."* The body's first test is `if (v.startsWith('/') || v.startsWith('#')) return v`. Executed: `'//evil.com/x'` returns `'//evil.com/x'`; `'/\\evil.com'` returns `'/\\evil.com'`. 45 call sites. `lib/page-editor/richtext.tsx:15-22` `safeHref` has the identical hole.

**Bounded honestly:** `safeUrl` already admits arbitrary `https://`, so protocol-relative grants a block author no new capability, and all 45 call sites were grepped for redirect/`location`/`router.push` sinks — **zero**; every one is an `href` or `src` (`lib/email-studio/render.ts:288`, `block-content.ts:891`, `components/entity-blocks/content-block-view.tsx:363`, `design-block-view.tsx:156`). The defect is that a shared helper documents an origin guarantee it does not provide, so the next caller who reasons "starts with `/` therefore same-origin" will be wrong.

**Fix:** the pattern the repo already uses twice (`app/auth/callback/route.ts:22`, `app/sign-in/page.tsx:20`) and that `a5916edaa` just installed in `lib/safe-image-src.ts` — parse against `'https://relative.invalid'`, keep only if `u.origin` is unchanged. Same edit to `richtext.tsx:19`. At absolute minimum, correct the comment.

### B-4 · `signup_leads` — correct the "the id is the capability" comment ✅-safe · **S**

`supabase/migrations/20270215000000_signup_leads.sql`. `update_signup_lead`'s comment claims the lead id *"is a v4 uuid the caller only ever holds in an httpOnly `fq_lead` cookie, so it is neither guessable nor readable from script"* — but `capture_signup_lead` is `security definer`, ends `on conflict ((lower(email))) do update set … returning l.id into v_id`, and is anon-executable, so any caller supplying a known email gets that row's id.

**Narrower than it looks, and the narrowing matters.** The `on conflict do update` branch already lets an anon caller who knows the email overwrite `first_name`, `last_name`, `display_name`, `handle` and merge into `payload` — the identical field set `update_signup_lead` reaches. So the leaked id grants essentially nothing the capture door does not. Grepping `app/`, `lib/`, `components/` for `signup_leads` finds **no read path in application code at all**.

**Fix the comment.** If anon tampering with half-finished signups is worth closing, the change belongs in `capture_signup_lead`'s do-update branch (fill NULL columns only), **not** in suppressing the returned id — that would leave the capture path wide open.

---

## 5. Plan-doc drift — the "what's next" wave is pointing at finished work

Every item here is **S** and mechanical. Ranked at this level because the cost is a wasted session each, they compound, and the top two are literally the next two things on the sequencing table. Do them as **one regeneration pass over four docs**, deriving every number by running the scripts rather than copying prose.

### C-1 · `INTERACTION-STATES` §5 + §6 and UX-MATURITY's 8b entry ✅-safe · **S** — *do this one first*

`docs/UX-MATURITY-PLAN.md:398` reads *"8b kit state sweep — **0 of 10** action + field controls carry their required states, the largest single UX gap on this plan."* `docs/INTERACTION-STATES.md:119-120` repeats it; §5's tables at `:123-142` head *"Action controls — 0 / 5"* and *"Fields — 0 / 5"* with 🔴 across press/loading/error/disabled.

**8 of 10 shipped in #2084 (`ec80e693c`, an ancestor of `origin/main`).** Verified at `git show origin/main:<file>`, not just the working tree:

- `components/ui/button.tsx:69` BASE includes `press`; `:94` `loading?: boolean`; `:115-116` `disabled={disabled || loading}` + `aria-busy`
- `components/ui/icon-button.tsx:51` base includes `press`, both `disabled:` and `aria-disabled:` variants
- `components/ui/switch.tsx:45` `press`, `:49` hover states, `:24/:37/:52` `pending` → `aria-busy` + `.dimmed`
- `components/ui/field.tsx:33` `aria-[invalid=true]:border-danger …`, `:117` seamless, `:186` `error?: ReactNode`, `:197` renders the danger line
- `staff-edit-button.tsx:23` `press` · `directory-search.tsx:14,57,65` `disabled` · `facet-dropdown.tsx:21,85-86` `disabled` + `press` · `streak-meter.tsx:43-46` empty state · `skeleton.tsx:53` `aria-hidden`

Of §5's six-item sweep list (`:186-193`), items **1, 2, 3, 4, 6 are shipped**.

**Genuinely open — this is what 8b should be re-scoped to:**
1. `components/cards/row-card.tsx:100` — `const surface = 'rounded-2xl border border-border bg-surface lift-1 transition-colors hover:border-primary-bg …'`; no `press`, no `has-[:focus-visible]`
2. `IconButton` has no `loading` prop (zero grep hits for `loading|aria-busy` in the file)
3. `DirectorySearch` gained `disabled` but still has no in-flight cue

*Strict-reading note:* `ConfirmSubmitButton` inherits `press` via `buttonClasses()` but has only a `useRef` re-entrancy guard and no visible busy state (`components/ui/confirm-submit-button.tsx:25-39`), so 7–8 of 10 is the honest count. Either way "0 of 10" is flatly false. Also fix `UX-MATURITY-PLAN.md:574` (*"the kit state sweep (8b) has not run"*).

**Same pass, §6:** `docs/INTERACTION-STATES.md:200-202` says *"None of the five action controls or five fields"* carry colocated tests. `ls components/ui/*.test.tsx` → **17 files**, same on `origin/main`. Against §5's own populations: 3 of 5 action controls tested (`button`, `icon-button`, `switch`), and `field.test.tsx` covers three §5 field rows. The doc's "none" is false, which makes **lift 8d's gate cheaper than the doc implies**.

### C-2 · UX-MATURITY package 6: 52 sites → ~7 ✅-safe · **S**

`docs/UX-MATURITY-PLAN.md:602` sizes it at **52 sites**, scored **+4.0**, mid-sequence in the road-to-100 order. Live (`node scripts/check-adoption.mjs`, exit 0): `bespoke-cards` 0/0 (rebased 2026-08-11), `bespoke-rows` 0/0, `handrolled-icon-button` 3, `adhoc-progress` 8, `handrolled-tabs` 0 = **11**, of which 4 `adhoc-progress` are documented false positives → **~7**.

Both named exemplars are fixed: `components/events/rsvp-controls.tsx:13,326,337` now renders `<IconButton>` (no `h-7` anywhere in the file); `components/gamification/standing-hero.tsx:9,107` imports and renders `ProgressTrack`, with a past-tense note at `:95`.

Mis-sizing a +4.0 package by 7× mis-orders everything after it in the sequence.

### C-3 · BUILD-LIST "Sweepable, deliberately stopped" table ✅-safe · **S**

`docs/BUILD-LIST.md:1216-1219` quotes `raw-input` **186**, `raw-select` 6, `raw-textarea` 6, `handrolled-icon-button` 6, `literal-radius` **2450**. Live: `raw-input` baseline 119 / current **118**, `raw-select` **3**, `raw-textarea` **1**, `handrolled-icon-button` **3**, `literal-radius` baseline 2440 / current **2298**.

`git blame -L 1214,1222` shows #2084 rewrote `:1218` and `:1220` and left `:1216`, `:1217`, `:1219` at #2080 / 2026-08-05. **The PR that did the sweeps updated two rows of the table and left three.**

Worse, each stalled row's stated blocker is obsolete — the primitives it asks for exist:
- *"Needs a borderless variant on the primitive"* → `components/ui/field.tsx:105` `export type FieldVariant = 'boxed' | 'seamless'`, `:120` the branch, with a docstring at `:78-92` naming the ~45 borderless inputs it was built for
- *"Both need a `tone`/borderless variant"* → same, plus `field.tsx:29` on `Select`'s `tone` prop
- *"Four need a tinted/selected variant"* → `components/ui/icon-button.tsx:113` `TINTED_TONE`, `:123` `if (variant === 'tinted')`

The reasons currently send someone to build variants that already shipped.

### C-4 · BUILD-LIST "Owed to the owner" is now empty ✅-safe · **S**

`docs/BUILD-LIST.md:1198` heads *"⏳ Owed to the owner (one item, down from four)"*; `:1207` says *"🔴 STILL OWED, and it is the only one… `test/e2e/a11y-baselines.json` holds **40** surface entries and **not one** is an `app-*` key."*

Measured live (file byte-identical to `origin/main`): **49** entries, **9** of them shell keys — `/feed` ×3, `/settings` ×3, `/spaces/danieltyack/manage` ×3. The file's 2026-08-11 header names them exactly: *"THE NINE NEW KEYS ARE A FIRST FLOOR, NOT AN ABSORBED REGRESSION."* The doc's test was also looking for the wrong key shape — the registry keys by path, not by an `app-feed` slug, so *"not one is an `app-*` key"* would have been true even after seeding.

**Carry this caveat into the fix:** three of the nine (`/feed` 12, `/settings` 7, `/spaces/…/manage` 8 in dawn-light desktop) are described in the JSON header as *"CEILING, not a reading"* — raw totals seeded without subtracting waivers because the run log truncated at 5 nodes. **Close the row as "owed to the owner", not as "nothing left to do here."** The section's own banner at `:1200-1203` says a mostly-stale blocker list is worse than no list; this is the fourth of four rows to go stale the same way.

### C-5 · Re-scope, do not strike, the contrast row ✅-safe · **S**

`docs/UX-MATURITY-PLAN.md:398` still schedules *"ADR-980's 16 dark-mode contrast failures… the cheapest points on the board."* The closure is real: `test/e2e/a11y-waivers.ts` is keyed on the painted colour pair and records the 2026-08-06 owner decision (white on brand amber, 2.52:1 light / 1.88:1 dark, darkened `#A06621` shown and **rejected**). Per-context notes: *"/feed … 0 measured 3, ALL three the amber. Clean."* ADR-1000 closed the remaining dawn-dark shell failure (`bg-border-strong` 3.27:1 → `primary-strong on primary-bg` 4.81:1, `components/ui/avatar.tsx`). `node scripts/check-contrast.mjs` exits 0.

**But the closure is not total** — see §2. The residue (amber as display text at 2.18–2.86:1, and `.text-text/10` watermark numerals in dark) is *"NOT WAIVED, and staying failed on purpose"* and is what the `/spaces` (2) and `/the-community` (3) dark baselines count. Re-scope the row to that residue.

The hazard the finding worried about — someone raising baselines — **is already blocked in code**: `scripts/a11y-baselines.mjs` merges asymmetrically and `exit(1)`s before `writeFileSync` unless `--force`, which the workflow does not pass.

### C-6 · Put a superseded banner on BUILD-LIST's visual-baselines 🔴 ✅-safe · **S**

`docs/BUILD-LIST.md:916` — *"### 🔴 The visual baselines are stale — `pr-compare` is red on every branch (2026-08-07)"*, with a standing instruction at `:932`: **"Do not re-record the baselines to make it green until the 22px is explained."** No superseded banner; it sits under `## P6` as a peer of two other live sections.

Contradicted by the same file at `:1209` — *"~~Recapture the marketing pixel baselines~~ | S | ✅ **CLOSED.** Done in #2071 (`8c345df`, 2026-08-10)"* — and by `docs/EDITOR-ARCHITECTURE.md:513-516`: *"68 of 72 baselines recaptured; `pr-compare` went from 62 failures to 1."* `test/e2e/__screenshots__/visual.spec.ts/` holds 76 PNGs.

A standing "do not re-record" order left live after the recapture shipped is an **active hazard**: the next person to hit a red `pr-compare` either leaves a genuinely stale baseline in place or burns a session hunting a 22px drift that a settled recapture already absorbed.

**The correct edit is a banner pointing at #2071 plus EDITOR-ARCHITECTURE's caveat of 1 residual failure (`/feed` refusing to settle between captures) — not a claim of zero failures.** (`pr-compare` was not run here; it needs a deployment.)

### C-7 · `.mk-cream` / `.mk-ink` are adopted — fix all three copies ✅-safe · **S**

`docs/UX-MATURITY-PLAN.md:604` (package 8, +3.0): *"`.mk-cream` / `.mk-ink` have **0** adopters, so the same-tone-halving rule never fires."* Repeated at `:624` as §4 finding 2, and it is the stated basis for the §1 scorecard row 7 (`:571`, "Marketing rhythm + page spine", 70%).

`components/marketing/marketing-ui.tsx:276` — `const toneClass = tone === 'ink' ? 'mk-ink' : 'mk-cream'`, emitted at `:278` on **every** `<Section>`, with a docstring at `:261-274` explaining the adoption in as many words. Also emitted at `:707` and `:1047`. Proven in a committed snapshot: `lib/page-editor/block-render.test.tsx:170` asserts `<section class="bg-marketing-canvas mk-cream px-6 mk-tight ">`.

**The third copy is the sharper hazard:** `app/globals.css:1625-1627` — *"Nobody has seen this because the rule has never fired: .mk-cream / .mk-ink have zero adopters today, so the defect is latent."* A spacing bug caused by the halving rule will be diagnosed against a stylesheet comment asserting it cannot happen.

**Narrow the claim, don't delete the row:** package 8's other half — *"15 of 38 marketing pages bypass `Section`"* — was not verified and may well still be true.

### C-8 · Re-derive the quoted ratchet counts ✅-safe · **S**

All read live 2026-08-12; both scripts exit 0:

| Doc says | Live | Where |
|---|---|---|
| "**14 debt classes**" | **17** ("17 debt class(es) held or shrank — 4 shrank, −153 sites retired"); the three added are `raw-select`, `raw-input`, `raw-textarea` | `UX-MATURITY-PLAN.md:589` |
| `literal-radius` **2,450** ("re-confirmed 2026-08-11") | baseline **2440**, current **2298** (−142 unclaimed) | `:573`, `:606` |
| `subtle-tiny-type` 23 | baseline 23, current **22** | `:599`, `:571` |
| "365 pairs" | **372** ("372 token pairs across 5 render states meet their role minimum, 49 on a frozen waiver floor") | `DECISIONS.md:19849` |

The plan's own closing addendum (`:663-694`) diagnoses exactly this habit — *"prose quoting `scripts/adoption-baselines.json` instead of re-deriving from it"* — and deliberately declines to ship a `check:baseline-citations` guard (41 candidates, ~8 real), leaving the habit as the only control. The habit is not holding.

**Scope note:** ADR-980's "365" is arguably fine to leave. The addendum at `:666-668` explicitly exempts *"rows that record what a value was at its freeze date"*, and ADR-980 is a dated historical record. The §1/§2/§3 figures are the ones cited as current and wrong.

### C-9 · Two FINALIZE-PLAN items presented as open are closed ✅-safe · **S**

- `docs/FINALIZE-PLAN.md:166-170` claims *"Against prod, `has_function_privilege('anon', 'journey_funnel(...)', 'EXECUTE')` returns **true**. Same for `vitals_p75`"* and `:175` lists item 2.2 as open. **Ran that exact query against prod:** both return `anon_exec=false` AND `auth_exec=false`. Closed.
- `docs/FINALIZE-PLAN.md:37` and `:866` say `check:cron-freshness` *"runs in no workflow at all"*. `.github/workflows/maintenance.yml:147` runs `node scripts/cron-freshness.mjs --markdown`, and `.github/workflows/ci.yml:148-150` documents the 2026-08-11 change explicitly — *"which is the destination this comment previously claimed while it was true of nothing."* That pointedness makes the stale FINALIZE row the **second** occurrence.

`FINALIZE-PLAN:18` sets its own rule that already-fixed items get recorded *"so nobody re-audits them."* Move both to that register with the verifying query and workflow path inline. **Do not trust §2's other counts** (2.1 inventory, 2.3 "the other 32 anon-callable definers", 2.4 the `check:grants` ratchet) — they were not re-measured; the live catalog says 29, not 27.

### C-10 · Give ADR-1002's two orphan GB lines an owner ✅-safe · **S**

`docs/DECISIONS.md:21636-21638`: *"a 7MB vendor SSR chunk in 331 functions (2.27 GB) and 823 MB of `public/tracks/*.mp3` in 61 are the next two lines, neither touched here."* No ADR, no FINALIZE-PLAN row, no BUILD-LIST row, no script owns either. Those are **A-2 and A-1**. Add two rows so they are owned. ADR-1003 exists because the build sat over budget for months with a green board.

### C-11 · Retract the node_modules theory in the incident record ✅-safe · **S**

`#2102`'s commit message (`3a4436762`) states *"node_modules at 1073MB against 948MB on the last healthy build, and 408 serverless functions against 403."* The 403→408 half checks out exactly (5 new `page.tsx`). The 125 MB half cannot be true: `git diff --stat 3f8d62b89 4fe125489 -- pnpm-lock.yaml package.json` → `package.json | 2 ++`, **the lockfile is byte-identical across the entire #2098+#2099+#2100 range**; same for `origin/main..claude/studio-reland` (`package.json | 4 ++++`, all `check:*` script lines plus the postbuild hook).

Neither `docs/DEPLOY-SAFETY.md` nor ADR-1003 mentions `node_modules` or the lockfile. So a refuted dependency theory sits in the permanent record as evidence against the Studio work, while the true cause lives only in a commit message. **One paragraph** in DEPLOY-SAFETY or under ADR-1003. Cheap to close, harmless if left.

---

## 6. Dead code and orphans

Each is a binary decision — mount or delete — and each carries a header comment asserting a live consumer that does not exist. That is the exact failure mode `AGENTS.md` warns about.

### D-1 · Seven built-but-never-mounted feature modules ⚠️ · **M**

All seven verified: each symbol's only hit repo-wide is its own definition. All predate the reland.

| Module | Its header claims |
|---|---|
| `lib/crm/scope.ts:65` `assembleContactCard` | — |
| `lib/billing/bundle-checkout.ts:21` `createBundleCheckout` | — |
| `lib/spaces/managed-actions.ts:22` `getManagedSpaces` | `:8` *"someClient -> getManagedSpaces()"* — no such client |
| `app/(main)/events/[slug]/claim-actions.ts:15` `requestClaimLink` (`'use server'`) | — |
| ~~`lib/profile-zaps.ts:16` `getProfileZapTotal`~~ 🔴 **deleted** ([ADR-1006](DECISIONS.md)) | *"surfaced on their public profile as the Spark milestone and the rank-ladder driver"* — it was not. Not unmounted work: it was **removed** in `5e4c722ba` because it sums `crew_completions` only and read 0 for members earning Zaps elsewhere. `profiles.lifetime_zaps` replaced it. Its `profile_zap_total` RPC is now orphaned; the drop is written and ~~**unapplied**~~ ✅ **APPLIED** at `supabase/migrations/20270226000000_drop_profile_zap_total.sql` — verified against production 2026-08-12: the migration holds a ledger row and `to_regprocedure('public.profile_zap_total(uuid)')` returns **null** |
| `app/(main)/spaces/[slug]/crm/crm-snapshot.tsx:27` `SpaceCrmSnapshot` | — |
| ~~`components/profile/profile-cover.tsx:8` `ProfileCover`~~ 🔴 **deleted** ([ADR-1006](DECISIONS.md)) | *"Rendered in the DetailTemplate `hero` slot"* — it was not. Superseded there by `PageHero` in `58dca581d` |

**Two carry product weight and need an explicit call:**
- `requestClaimLink` is the *"Is this your event? Claim it"* flow — a real user-visible capability reaching no page. Needs a CTA on the event detail page, or deletion.
- `createBundleCheckout` is already recorded in `docs/FINALIZE-PLAN.md` as having **no caller AND no webhook seating branch**. Mounting it without the seating branch would **take payment and seat nobody.** Delete it, or build both halves together.

The other five: delete-or-mount. Correct the header comment either way. **Two are now closed** (see the struck rows): `getProfileZapTotal` and `ProfileCover` were never unmounted work. Both had been mounted and then deliberately removed, and both kept header comments claiming they were live, which is what filed them here in the first place. Re-mounting either would have re-opened a fixed bug. (The claim that `lib/crm/scope.ts` matters most as a safety boundary is refuted by its own header — the existing pages already read correctly; it merely names the assembly.)

### D-2 · ADR-459 left six unreachable files behind the contacts redirect ✅-safe · **S**

`app/(main)/admin/marketing/contacts/[id]/page.tsx` is a 23-line redirect headed *"RETIRED (ADR-459)"*. Six siblings, ~23 KB, no importer:

`contact-actions.tsx` (6,162 B) · `timeline-panel.tsx` (8,251 B) · `resonance-section.tsx` (3,234 B) · `invite-button.tsx` (1,723 B) · `actions.ts` · `timeline-actions.ts`

The transitive claim was checked specifically, because two other files import a `'./actions'`: `contacts-table.tsx:10` and `scan-invite-toggle.tsx:6` sit in the **parent** dir and resolve to `contacts/actions.ts`. The only importer of `[id]/actions.ts` is `[id]/invite-button.tsx:6`; the only importer of `[id]/timeline-actions.ts` is `[id]/timeline-panel.tsx:31`. Both action modules are transitively dead. `[id]/actions.ts:11` also re-exports `setContactConsent` from `'../actions'`, making the directory look like it has a live shared seam.

**Delete all six, keep `page.tsx`.** Before deleting `[id]/actions.ts`, note `inviteContactToJoin` has no other caller — if invite-a-contact is still wanted it needs a home on `/admin/crm` first.

### D-3 · Delete `components/admin/modules/circle-challenges.tsx` ✅-safe · **S**

Zero importers. The de-duplication is documented at `components/admin/modules/circle-quest-module.tsx:13-15`: *"The adopt/drop CHALLENGE editor was likewise de-duplicated out: challenges are edited in exactly ONE place, the first-class `circle.engage` module"*, and that live module imports `adoptCircleChallenge`/`dropCircleChallenge` directly (`circle-engage-module.tsx:10-11`).

**Careful:** the similarly-named `components/widgets/circles/circle-challenges.tsx` is a **different, live** server component registered at `lib/widgets/registry.tsx:125,322`. Two same-named files, one dead — delete the right one.

### D-4 · Delete `app/(main)/upgrade/supporter-badge.tsx` + fix the live component's header ✅-safe · **S**

`app/(main)/upgrade/supporter-badge.tsx:13` exports `SupporterBadge` with zero importers (the upgrade page imports `UpgradeToggle` + `PwywPicker` at `page.tsx:16-17`; `app/(main)/people/[handle]/page.tsx:37` imports the **different** display pill from `@/components/supporter-badge`). `toggleSupporterBadge` (`app/(main)/upgrade/actions.ts:116`) is called only from inside that orphan.

Two same-named exports where one is dead makes an `import { SupporterBadge }` look correct either way in review.

**The more useful half:** `components/supporter-badge.tsx:4-12` still describes Supporter as *"the pay-more entitlement tier above Crew (`profiles.membership_tier = 'supporter'`)"* and tells readers to gate on `{tier === 'supporter' && <SupporterBadge />}` — stale under ADR-458/ADR-878 and contradicted by its own live consumer at `people/[handle]/page.tsx:273`. Rewrite it to name `profiles.is_supporter`, matching the already-correct comment at `:270-272`.

`confirmSupporterContribution` (`actions.ts:169-184`) is the live writer of `is_supporter` — keep it. **Unverified:** whether `app/(main)/upgrade/actions.test.ts` still exercises `toggleSupporterBadge`; check before deleting.

### D-5 · Delete the embeddable-elements component map ✅-safe · **S**

`components/elements/registry.tsx:31` exports `ELEMENT_COMPONENTS` with zero importers — every consumer imports the **pure catalog** `@/lib/elements/registry` (`admin/elements/page.tsx:4`, `actions.ts:11`, `elements-editor.tsx:8`, `previews.tsx:18`, `lib/loom/picker-actions.ts:30`). Its documented mounter `<AppElement>` returns 4 hits, **all comments** (`registry.tsx:5,17`, `registry.test.ts:10`, `lib/elements/registry.ts:89`); no definition exists. The drift test reads the file with `readFileSync` (`registry.test.ts:17-18`) rather than importing it, so it cannot detect non-mounting — dead scaffolding under a green CI signal.

**This is already a documented open item**, not a discovery: `docs/EMBEDDABLE-ELEMENTS.md:48-58` flags it 🔴 — *"Rebuild it or delete the references; leaving both is how a reader concludes the framework is wired when it is not."*

**Take the cheap branch the doc already sanctions:** delete `components/elements/registry.tsx`, strip the four `AppElement` comment references, update `EMBEDDABLE-ELEMENTS §2` to describe the pure catalog only, and drop the component-map assertions at `registry.test.ts:60,70,74`. `check:elements` is unaffected — it only forbids a second `ElementDef[]` catalog. Fix `FINALIZE-PLAN.md:928` at the same time (see §2).

*The "rebuild AppElement" branch was priced at L on the theory that it enforces a one-canonical-component invariant. It does not need to: `LoomPicker` has one definition imported by 8 surfaces and `StyleEditor` one imported by 7, **zero forks**. Nothing renders wrongly.*

---

## 7. Configuration and canon hygiene

### E-1 · Add 17 missing env vars to `.env.example` ✅-safe · **S**

`.env.example` is a real 175-line configuration document naming other third-party keys explicitly (`RESEND_API_KEY:27`, `ANTHROPIC_API_KEY:133`, `GOOGLE_MAPS_API_KEY:170`, plus a 🔴 note at `:94` distinguishing two Google keys). It has 47 assigned keys. These 17 return zero hits:

`RECRAFT_API_KEY` · `TWILIO_ACCOUNT_SID` / `AUTH_TOKEN` / `MESSAGING_SERVICE_SID` · `SMS_VERIFICATION_SECRET` · `SMS_PROVISIONING_ENABLED` · `GOOGLE_OAUTH_CLIENT_ID` / `SECRET` · `OAUTH_STATE_SECRET` · `BRAVE_SEARCH_API_KEY` · `AI_GATEWAY_API_KEY` · `AI_DISABLED` · `STRIPE_PRODUCT_CREW` · `CRM_INBOX_OWNER_PROFILE_ID` · `EMAIL_REPLY_TO` · `CONVERSATION_EMAIL_BRIDGE` · `BUSINESS_IMPORT_CAP_USD`

Reads spot-checked as real, not regex artifacts: `app/(main)/admin/sms/page.tsx:89`, `lib/ai/client.ts:66`, `lib/crm/inbox.ts:105`, `lib/billing/checkout.ts:66`, `lib/comms/inbound.ts:452`, `lib/comms/sms.ts:111`. *(6 of 17 personally re-verified; the other 11 are cited with file:line and plausible.)*

**`RECRAFT_API_KEY` is the one that hides a whole feature.** `lib/loom/recraft.ts:13-15` `recraftConfigured()` gates `app/(main)/admin/library/page.tsx:126` and `lib/loom/cover-actions.ts:111,147`; `create-studio.tsx:216` shows a permanently disabled control titled *"Needs the Image Studio (set RECRAFT_API_KEY)"*. The graceful degradation is correct and is exactly why nobody will ever surface this — the offer simply never appears and nobody gets an error.

> ✅ **Both halves of this are now closed (2026-08-13).** `RECRAFT_API_KEY` is documented in `.env.example:169-177`, with a block that says in as many words why an unset key here reads as "we don't have that feature" rather than as a missing key — so it no longer belongs in the 17 above (16 remain). And the key **is set** in Vercel, on Production and Preview since Jul 1, so the feature it gates is live and always was. The paragraph is kept because its reasoning about invisible degradation is sound and still applies to every other silent gate.

**Corrections:** `SENTRY_DSN` **is** documented, at `.env.example:55` as a comment — the list is 17, not 18. And mark the genuinely optional ones as such: `OAUTH_STATE_SECRET` and `EMAIL_REPLY_TO` are overrides with safe hardcoded defaults; `AI_DISABLED` and `SMS_PROVISIONING_ENABLED` are switches.

### E-2 · "Drafts" names three member surfaces; NAMING.md defines none ⚠️ · **S**

`grep -i draft docs/NAMING.md` → exactly two hits, neither the noun: `:611` (remixing *"creates a private DRAFT you own"*) and `:620` (*"draft / published: a Circle lifecycle"*).

Meanwhile: (1)+(2) `app/(main)/drafts/` carries **two row kinds on one page by explicit design** — the page's own comment: *"TWO KINDS, ONE LIST (ADR-1001)… Splitting them across two surfaces both called Drafts would be worse than either alone"*; (3) `app/(main)/events/drafts/` is a **separate** member surface whose back-link is labelled **"My drafts"** at `app/(main)/events/drafts/[id]/page.tsx:37` and `:76`, page title *"Tidy your event draft"*.

`AGENTS.md` makes NAMING.md binding on every member-visible word and every word Vera generates (`lib/ai/voice.ts` injects it). ADR-1001 made a good local decision that never reached the canon and never considered `/events/drafts`. A member with a captured event and a half-finished wizard sees two unrelated "My drafts" surfaces reached from different places.

**Decide:** add the NAMING entry defining Drafts as the surface at `/drafts`, then rule on `/events/drafts` — fold it in as a third row kind, or rename it and its two back-links.

*(`lib/nav/studio.ts:337` "Campaigns, funnels, drafts, and sent in one place" is operator console copy about an email lifecycle state, reading as the ordinary common noun. Three collisions, not four.)*

### E-3 · `check:migrations` has no ledger-head rule ⚠️ · **S–M**

`scripts/check-migrations.mjs`'s own header states it enforces exactly two things — *"1. Every version is UNIQUE"* and *"2. Every filename parses as `<14-digit version>_<name>.sql`"* — with *"Ordering itself is deliberately NOT checked."* **There is no read of the ledger at all.** FINALIZE-PLAN §2.6 (`docs/FINALIZE-PLAN.md:199`) is still open on this.

Commit `7c4eb8a12` records that `apply_migration` stamped `studio_draft` with a wall-clock version `20260812134657`, and that *"production briefly carried the same migration twice, 606 rows against the repo's 605"* — caught only by `scripts/maintenance/ledger-parity.test.ts`, never by `check:migrations`, which by design cannot see a ledger row with no repo file. `FINALIZE-PLAN:9-13` calls this *"the repo's own named failure mode"*, and it has now bitten three times.

**Either** teach the guard to compare against the ledger head, **or** accept that `ledger-parity.test.ts` is the only instrument for this class and say so in `check-migrations.mjs`'s header, so nobody assumes coverage it does not have. The second is honest and takes ten minutes.

### E-4 · Build a function-grant guard · **M** — *backlog*

The durable half of B-2. No script anywhere references `has_function_privilege` or asserts over `grant execute`; `check-grants.mjs` covers tables only. A sibling that replays create-function statements out of `supabase/migrations/` and demands a verdict per function is the only thing that closes the class — 29 anon-executable SECURITY DEFINER functions currently rest on the Supabase advisor and a human reading it.

---

## 8. Needs an owner decision before anyone starts — the editor program

### F-1 · Settle EDITOR-ARCHITECTURE's two 🔴 sequencing questions on paper ⚠️ · **L**

`AGENTS.md` names `docs/EDITOR-ARCHITECTURE.md` as one of four live plans and requires reading it before touching any block, block registry, or the page editor. **Its own implementability audit says starting E0 or E3 blocks immediately.**

`docs/EDITOR-ARCHITECTURE.md:760`, verbatim: *"⚠️ **Items 3, 5 and 6 are E0 scope that E0 does not currently list**, and items 2 and 4 are E3 prerequisites with no owner at all. Those five are the ones that turn a phase from 'in progress' into 'blocked' once someone starts."* `docs/BUILD-LIST.md:84` independently repeats *"§8.1 item 2, still unowned."*

Two of the five spot-checked and both hold:
- **Item 5** — `grep -rn '\.channel('` over app/lib/components returns four live uses (`lib/realtime/use-typing.ts:45`, `components/rooms/room-thread.tsx:93`, `components/chat/use-support-chat.ts:48`, `components/messages/thread.tsx:92`), all public channels, and `grep -rln 'realtime.messages' supabase/migrations/` returns **nothing** — there is no Realtime authorization RLS anywhere.
- **Item 2** — `test/e2e/__screenshots__/visual.spec.ts` holds 76 baselines, none for Spotlight, an in-app profile, or a Space profile (the only "space" entries are `spaces--*` the index and `app-space-console--*`).

The two 🔴 rows live in **§9 "Sequencing collisions"** (not §8.1): *"E1 before E2 is circular"* and *"The contract is missing three things that cannot be retrofitted"* (field/UI metadata, per-type limits, the CommunityRole floor).

**These are decisions, not tasks — cheap on paper, expensive after E1 ships.** Whoever starts E1 without settling them ships the wrong schema. Item 3 (a bundle-byte instrument) must exist before E0's `editor-bytes-on-public-render` ratchet can be declared at all. Item 2 is the cheapest of the five and could have been absorbed by FINALIZE-PLAN Phase 1's recapture — do it while the recapture tooling is warm, once the four surfaces have reachable URLs. *(Items 3, 4 and 6 were not independently re-verified.)*

---

## 9. Split: mechanical vs owner decision

### Safe to fix mechanically — hand to an agent, no judgement required

`CP-2` (ci.yml `studio` + AGENTS.md:114) · `CP-3` (three nav rows) · `CP-6` (ADR-1004 + strike three status lines) · `CP-9` (branch retirement) · `A-1` (tracing exclude) · `A-5` (font literals) · `B-2` (revoke migration) · `B-3` (safeUrl/safeHref) · `B-4` (comment) · **all of C-1…C-11** · `D-2` `D-3` `D-4` `D-5` (deletions, with the two-same-named-file caveats) · `E-1` (env template)

### Needs your decision first — do not let an agent guess

| Item | The decision |
|---|---|
| **CP-1** | What is Vercel's Build Command? Only you can read it. Everything downstream assumes `pnpm build`. |
| **CP-4** | Wire the drafts badge, or delete `countMyCreateProposals` + the ADR-246 exception? |
| **CP-5** | Does ADR-986 retire `StudioLaunchButton`, or keep it? |
| **B-1** | Does `billing_live` ON call `graduateBeta()`, or does graduation get its own janitor-gated control? Launch day happens once. |
| **A-2 / A-3** | Route-handler indirection for the icon collections is a real UX seam in LoomPicker. Accept the fetch? |
| **A-6** | Raise `MAX_INCIDENTAL` with a reason (S), or restructure the per-entity cards and re-prove the private-Space privacy contract (L)? |
| **D-1** | Seven mount-or-delete calls. `requestClaimLink` and `createBundleCheckout` carry product weight — the latter would take payment and seat nobody if half-mounted. |
| **E-2** | Rename `/events/drafts`, or fold it into `/drafts` as a third row kind? |
| **E-3** | Extend `check:migrations` to the ledger, or document that it cannot see this class? |
| **F-1** | Two sequencing rulings before E1 opens. |

---

## 10. Verified clean — do not spend time here

- **`origin/main` has no dangling Studio references.** `git grep -nE 'check-studio|check-creates|check:studio|check:creates' origin/main` → no matches; neither script is in `origin/main:scripts/`; no `postbuild` in its `package.json`; the 602 migration files are contiguous through `20270221000300`. #2102 restored the exact tree of `3f8d62b` rather than hand-reconstructing it — **no half-removed menu rows, no imports at deleted modules.** The re-land is a push-and-gate operation, not an untangling. This is the one thing that could have made this a multi-week job and it did not.
- **The a11y baseline-raising hazard is already blocked in code** (`scripts/a11y-baselines.mjs` exits 1 before `writeFileSync` without `--force`; the workflow does not pass it).
- **The one-canonical-component invariant holds** — `LoomPicker` one definition / 8 surfaces, `StyleEditor` one / 7, zero forks.
- **A-7's ~1.5 GB vendor floor.** Re-measure after A-1…A-6; do not chase before.

## 11. Two things nobody has proven — flagged so they don't get treated as fact

1. **The Vercel Build Command** (CP-1). If it is not `pnpm build`, both size gates have never run and the ENOSPC class is fully live. Unprovable without dashboard access.
2. ~~**`RECRAFT_API_KEY`'s actual state in Vercel.**~~ ✅ **PROVEN, 2026-08-13: it is SET** — Production and Preview, added Jul 1, marked Sensitive (owner, from the dashboard). The flag was right that the repo cannot answer this, and right to refuse to guess. What went wrong afterwards is that the *unknown* was read downstream as a *finding*: `HANDOFF-2026-08-12.md` recorded it as "must be set", and it reached a task list as "RECRAFT_API_KEY unset, cover generation is inert". Nobody added evidence between those steps. **The lesson is about the handoff, not the audit** — an item parked here as unproven must keep that status until someone with dashboard access says otherwise, because a silent-by-design feature offers no other way to tell, and its absence of complaints is not evidence either way.
