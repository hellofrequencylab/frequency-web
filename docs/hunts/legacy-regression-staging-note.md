# Legacy-path regression note for the Hunts switches (FH-011T)

Status lives in [`docs/BUILD-BACKLOG.json`](../BUILD-BACKLOG.json): `pnpm ledger:view FH-011T`. This note pins one run on one commit. It is evidence for that commit only and goes stale with the next change under `lib/hunts/`, `lib/loyalty/`, `lib/rewards/` or `lib/commerce/`.

**Result: with every Hunt switch off, the legacy check-in, reward and commerce paths gave their pre-Hunts answers and touched no `hunt_` table or function. Turning every switch on and then off again gave identical legacy results.** 8 of 8 tests passed locally and in CI on the same commit.

## What was run

| | |
|---|---|
| Commit | `e2016697d3c000d0d9d39bf3aea9b8618d26aefe` on `main` (2026-11-16 14:16 UTC, #5023) |
| Date of run | 2026-11-16 |
| Runtime | Node v22.23.4, vitest 5.0.5, Linux x64 |
| Environment | No `HUNTS_*` variable set (checked: `env \| grep -c HUNTS_` printed `0`) |

There is no staging deployment in this project (owner rule: no staging). The row's title says "staging note"; what exists is this exact-commit local run, plus the public CI run of the full suite on the same commit:

- [CI run 43883956660 on `e2016697`](https://github.com/hellofrequencylab/frequency-web/actions/runs/43883956660), job [`test`](https://github.com/hellofrequencylab/frequency-web/actions/runs/43883956660/job/133362502729): success. Its log lists `lib/hunts/legacy-regression.test.ts (5 tests)` and `lib/hunts/legacy-paths.test.ts (3 tests)` as passed, inside 2750 passing test files.
- [All checks for the commit](https://github.com/hellofrequencylab/frequency-web/commit/e2016697d3c000d0d9d39bf3aea9b8618d26aefe/checks).

Command, from the repository root:

```
env -u HUNTS_ENABLED -u HUNTS_CLAIMS_ENABLED -u HUNTS_REWARDS_ENABLED \
    -u HUNTS_AUTHORING_ENABLED -u HUNTS_WORKER_ENABLED -u HUNTS_COMMERCE_ENABLED \
  pnpm exec vitest run lib/hunts/legacy-regression.test.ts lib/hunts/legacy-paths.test.ts --reporter=verbose
```

Output:

```
✓ legacy-paths > keeps the Regulars stamp and its one check-in award on a same-day retry
✓ legacy-paths > keeps the Connector grant and skips a duplicate award
✓ legacy-paths > keeps the legacy Market ticket listing and its event link and price
✓ legacy-regression > covers the full switch list and has them all off
✓ legacy-regression > runs check-in, reward and commerce exactly as before and never touches a hunt_ table or rpc
✓ legacy-regression > keeps Hunt claim, order and refund entry points inert with zero boundary calls
✓ legacy-regression > observability: an off switch reports skipped, runs nothing and logs no failure
✓ legacy-regression > rollback: switching commerce off after on returns to the legacy ticket path

Test Files  2 passed (2)
     Tests  8 passed (8)
```

Both files also blank all six switches themselves before each test (`vi.stubEnv(key, '')`), so the outer environment cannot leak in. A second run with all six set to `1` in the outer shell gave the same 8 of 8, which confirms that and proves nothing more.

## Observability reading

| Signal | Where it comes from | What this run showed |
|---|---|---|
| Commerce guard reports `skipped` | `guarded()` in [`lib/hunts/commerce-hooks.ts`](../../lib/hunts/commerce-hooks.ts) returns `'skipped'` before doing any work when `HUNTS_COMMERCE_ENABLED` (or its parent `HUNTS_ENABLED`) is off | `guarded('order-projection', …)` returned `'skipped'`. The work function and the failure recorder were each called zero times. With the switches on, the same call returned `'ok'`, so `skipped` is a distinct answer |
| No `[hunts-*]` error | The only such prefix in the source is `[hunts-commerce]`, written with `console.error` in three places: an unrecorded hook failure (`commerce-hooks.ts`), an order hook failure (`lib/hunts/order-hooks.ts`), and a pass gate that could not read (`lib/hunts/pass-gate.ts`) | Zero `console.error` calls starting `[hunts-` across the whole legacy pass |
| No Hunt boundary touched | The test's admin client records every table and function name | Tables read: `reward_grants`, `reward_grants`, `events`, `event_ticket_types`. Functions called: `loyalty_record_visit`. None starts with `hunt_`. `openClaim` and `claimAsPlayer` answered `disabled`, `loadScanPlacement` answered `null`, and the order and refund hooks made zero calls |

Limits of this reading, stated plainly:

- It is a test-process reading. No production or preview log was read for this note.
- `skipped` is a return value. The callers in `lib/hunts/commerce-webhook.ts` and `lib/hunts/order-hooks.ts` do not log it, so in a deployment an off switch is silent by design: the signal there is the absence of `[hunts-commerce]` lines and of `hunt_` writes, not a "skipped" line.

## Rollback result

The rollback test runs every legacy path with the switches off, sets all six to `1`, calls the ticket checkout gate (which then reads `hunt_pass_bindings`, proving the on state really reaches Hunt code), blanks all six again, and reruns every legacy path.

- The rolled-back results were deeply equal to the first legacy results (Regulars stamp, Connector grant, Market ticket listing, checkout gate `null`).
- After rollback, zero `hunt_` tables or functions were touched and `openClaim` answered `disabled` again.

What this does not cover: a rollback on a deployment (an environment variable change plus a redeploy), and data written while a switch was on. Both belong to each switch's activation gate in [`docs/RUNBOOKS.md`](../RUNBOOKS.md).
