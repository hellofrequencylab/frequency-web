# CSP `script-src` eval reports: trace (SCAN-1214)

Status lives in [`docs/BUILD-BACKLOG.json`](../BUILD-BACKLOG.json) (row SCAN-1214). This file records the evidence.

## What was reported

SCAN-1032 saw `csp.violation script-src eval` on `/people/<handle>` and `/create-a-space`. The policy is
report-only on this directive, and production carries no `'unsafe-eval'` (`next.config.ts`; only dev adds it).
A `blocked: "eval"` report means some script on the page called `eval()` or `new Function()`.

## Evidence gathered 2026-11-16 (Vercel runtime logs, `csp.violation`, last 23 hours, production)

- The reports are not specific to the two pages. `blocked: eval` also fired on `/themes`, `/themes/<skin>` (ten
  different skins), `/spaces/house-of-fates` and `/people/<handle>`.
- They arrive in tight bursts from many regions at once: 10:49:49 to 10:51:05 UTC (a dozen `/themes*` and
  `/create-a-space?mode=...` pages, 4 to 20 seconds apart, five different Vercel regions), 04:20 UTC (four hits on
  `/themes` within 40 seconds) and 00:14 / 00:21 UTC. That is the shape of a scripted browser walking a route list
  (the route-family audit, `scripts/audit/route-family-audit.mjs`, and the owner's signed-in Chrome audit with the
  page-script tool), not of organic visitors.
- A second, unrelated report type appears in the same window: `connect-src` blocked on
  `https://frequencylocal.com/spaces/house-of-fates/manage/leadership/open?...&_rsc=...` from the Space manage
  panel. A self-origin URL blocked by `connect-src` is a redirect that leaves the origin; it is filed as its own row.

## What the code says

A search of first-party source (`app/`, `components/`, `lib/`) for `eval(`, `new Function` and `unsafe-eval` finds
nothing outside tests, probes and `next.config.ts`. The self-hosted MapLibre worker
(`public/maplibre/maplibre-gl-worker.mjs`) contains neither. Google Maps' loader is documented in `next.config.ts` as
calling neither. The consent-gated analytics tags (GTM / gtag) are the only third-party scripts that are known to
evaluate strings, and only for GTM Custom JavaScript variables, which this site does not publish.

## Finding

No first-party trigger exists. The reports line up with page-world script injection by the audit tooling (a
browser-automation `javascript_tool` evaluates code in the page, and browser extensions do the same), which the CSP
reports even though it is not site code. Nothing needs replacing in the repo.

## What would change this finding

Re-read the log (`get_runtime_logs`, query `csp.violation`) on a day with no audit run. Organic eval reports from
many unrelated visitors would point at a third-party tag; the document URL set then tells which. SCAN-1243 (dropping
`'unsafe-inline'`) does not depend on eval, which production already forbids.
