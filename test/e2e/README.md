# E2E smoke + visual harness

Safety net for the design-system retheme: catches broken pages and unintended
visual drift before/after codemods. No server is spawned — everything targets
`PW_BASE_URL` (a Vercel preview or a locally running `pnpm dev`).

## Run

```sh
PW_BASE_URL=https://<preview>.vercel.app pnpm test:e2e          # smoke (skips visual)
PW_BASE_URL=https://<preview>.vercel.app pnpm test:e2e:visual   # visual only (@visual)
PW_BASE_URL=https://<preview>.vercel.app pnpm test:e2e:update   # (re)generate baselines
```

Without `PW_BASE_URL` every spec self-skips, so `--list` and CI collection
always pass. Manual CI runs: `.github/workflows/e2e.yml` (workflow_dispatch).

## Baselines

None are checked in yet. The first `pnpm test:e2e:update` run writes them to
`test/e2e/__screenshots__/` — commit those. After a deliberate visual change,
rerun `test:e2e:update` against the same kind of URL and commit the diff.
