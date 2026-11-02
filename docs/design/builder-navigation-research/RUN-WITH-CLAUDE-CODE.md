# Running the builder build in frequency-web

This folder mirrors repo paths. It is not committed itself; this file stays here.

## 1. File the plan (one PR)

```sh
git checkout -b builder/file-plan
cp -R handoff/frequency-web/docs/* docs/
pnpm ledger:next BLD                # confirm BLD is free; if not, rename the row files and ids
pnpm ledger:next                    # take the next ADR number
mv docs/ledger/adr/ADR-NNNN.md docs/ledger/adr/ADR-<n>.md   # and fix the heading number inside
# Optional: put rows on a wave
for f in docs/ledger/rows/BLD-*.json; do pnpm ledger:add "$f" --wave W8; done
pnpm check:backlog && pnpm check:one-list && pnpm check:adr && pnpm check:id-collisions && pnpm check:docs-links
```

`EDITOR-NEXT.md` has no planning word in its name, and declares that status lives in `docs/BUILD-BACKLOG.json`, so `check:one-list` stays green. Every row starts as `manual`, so `check:backlog` cannot read an unwritten probe as a verdict.

## 2. Run one pass (one PR each)

Prompt for Claude Code:

> Run pass BLD-xxx from docs/EDITOR-NEXT.md (machine copy: docs/editor-next.json).
> 1. Confirm every pass in its "After" list is done (`pnpm ledger:view <ID>`). If not, stop.
> 2. Write `scripts/probes/builder/BLD-xxx.mjs` from its "Done when" list. Run it and confirm it FAILS on main.
> 3. Build only inside the pass scope. Stay under 40 files.
> 4. Validate: run every gate the pass names, in order, plus G-LEDGER. Stop at the first red one.
> 5. Repair: classify the failure using the repair table, fix inside the scope, re-run from the failed gate. Up to 3 cycles. Data-class failures revert at once.
> 6. Record: switch the row's verify to `{ "kind": "cmd", "cmd": "node scripts/probes/builder/BLD-xxx.mjs" }` and close it with `pnpm ledger:close BLD-xxx --verify-file <probe.json> --note "<what changed, gates run, baseline changes>"`.
> 7. If three cycles fail: revert the branch, set the row to blocked with the failing gate and last diff in detail, and stop.

## 3. Order

BLD-000 (rulings) → B0 (001 to 004) → B1 (101 to 108) → B2 (201 to 205) → B3 (301 to 304) → BZ (901, 902). B4 (401 to 403) is filed as blocked until E0 lands.

## 4. After each phase

Send screenshots of the built editor back to the design project. Drift against the proposal or the design system becomes repair work in the next pass.
