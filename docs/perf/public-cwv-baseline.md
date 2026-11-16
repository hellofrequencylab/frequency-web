# Public pages: Core Web Vitals baseline (clean profile, production)

Status of the work this measures lives in [`docs/BUILD-BACKLOG.json`](../BUILD-BACKLOG.json) (SCAN-1218, SCAN-1205, SCAN-1265). This file is a dated reading, not a tracker. Re-measure by dispatching the `e2e-manual` workflow against `https://frequencylocal.com` with `base_url` set to production and replace the tables below.

## How it was taken

- **When:** 2026-11-16, 19:23 to 19:41 UTC, against production `https://frequencylocal.com`.
- **Run:** GitHub Actions `e2e-manual`, run 43938516828, job 133549442468 (`test/e2e/field-measure.spec.ts`, signed out, no stored state).
- **Profile:** a fresh browser context per load, so there is no warm cache, no cookie, and no stored side. Each figure is the median of 3 cold loads.
- **Throttled phone:** 390 px with 1.6 Mbps down, 750 kbps up, 150 ms latency and a 4x CPU slowdown (the same shape as Lighthouse's phone run). The unthrottled rows show the same pages on the runner's own link.
- **Bytes:** transfer size over the wire, with decoded script size in brackets.

## Readings

### phone 390, throttled

| Page | TTFB ms | FCP ms | LCP ms | LCP element | CLS | Blocking ms | Script KB (decoded) | Image KB | Total KB | Requests | Console errors |
|---|---|---|---|---|---|---|---|---|---|---|---|
| / | 82 | 2404 | 2404 | img image | 0.001 | 3785 | 595 (1756) | 665 | 1520 | 62 | 0 |
| /pricing | 74 | 1836 | 5628 | div image | 0 | 1671 | 598 (1757) | 336 | 1203 | 62 | 0 |
| /the-community | 76 | 2040 | 4456 | img image | 0.001 | 1292 | 589 (1728) | 621 | 1466 | 64 | 0 |
| /discover | 73 | 1580 | 4356 | div image | 0 | 347 | 665 (2000) | 130 | 1038 | 55 | 0 |
| /for/studios | 68 | 1728 | 1728 | h1 | 0.002 | 474 | 593 (1743) | 213 | 1057 | 53 | 0 |
| /themes | 71 | 1592 | 1620 | h1 | 0 | 316 | 752 (2471) | 1042 | 2106 | 71 | 0 |
| /about | 68 | 1608 | 4560 | img image | 0 | 198 | 663 (1995) | 241 | 1145 | 55 | 0 |
| /spaces | 68 | 1580 | 3884 | div image | 0.001 | 335 | 665 (2000) | 286 | 1206 | 60 | 0 |
| /the-quest | 225 | 1656 | 5280 | img image | 0.301 | 229 | 561 (1692) | 375 | 1199 | 56 | 0 |
| /create-a-space | 68 | 1824 | 2252 | h1 | 0 | 305 | 743 (2405) | 351 | 1404 | 64 | 0 |

### phone 390

| Page | TTFB ms | FCP ms | LCP ms | LCP element | CLS | Blocking ms | Script KB (decoded) | Image KB | Total KB | Requests | Console errors |
|---|---|---|---|---|---|---|---|---|---|---|---|
| / | 68 | 380 | 388 | img image | 0 | 14 | 594 (1756) | 666 | 1560 | 63 | 0 |
| /pricing | 70 | 368 | 424 | div image | 0 | 10 | 674 (2028) | 337 | 1282 | 65 | 0 |
| /the-community | 70 | 476 | 476 | img image | 0 | 0 | 666 (2000) | 764 | 1824 | 72 | 0 |
| /discover | 68 | 412 | 440 | div image | 0 | 0 | 665 (2000) | 130 | 1037 | 55 | 0 |
| /for/studios | 68 | 564 | 564 | h1 | 0 | 0 | 594 (1743) | 213 | 1129 | 54 | 0 |
| /themes | 93 | 444 | 640 | h1 | 0 | 0 | 750 (2471) | 1041 | 2106 | 71 | 0 |
| /about | 70 | 240 | 280 | img image | 0 | 0 | 663 (1995) | 417 | 1321 | 58 | 0 |
| /spaces | 68 | 320 | 380 | div image | 0 | 0 | 664 (2000) | 362 | 1280 | 62 | 0 |
| /the-quest | 101 | 332 | 332 | h1 | 0 | 0 | 560 (1692) | 566 | 1389 | 60 | 0 |
| /create-a-space | 70 | 496 | 496 | h1 | 0 | 0 | 743 (2405) | 408 | 1462 | 65 | 0 |

### desktop 1280

| Page | TTFB ms | FCP ms | LCP ms | LCP element | CLS | Blocking ms | Script KB (decoded) | Image KB | Total KB | Requests | Console errors |
|---|---|---|---|---|---|---|---|---|---|---|---|
| / | 70 | 344 | 444 | div image | 0.002 | 69 | 595 (1756) | 691 | 1652 | 62 | 0 |
| /pricing | 70 | 552 | 652 | div image | 0 | 64 | 674 (2028) | 356 | 1303 | 66 | 0 |
| /the-community | 69 | 416 | 416 | h1 | 0 | 3 | 665 (2000) | 297 | 1232 | 71 | 0 |
| /discover | 71 | 364 | 392 | div image | 0 | 0 | 664 (2000) | 187 | 1098 | 56 | 0 |
| /for/studios | 71 | 452 | 452 | img image | 0.031 | 36 | 593 (1743) | 198 | 1118 | 54 | 0 |
| /themes | 69 | 396 | 660 | h1 | 0 | 3 | 752 (2471) | 1213 | 2441 | 74 | 0 |
| /about | 71 | 268 | 268 | img image | 0 | 0 | 661 (1995) | 318 | 1278 | 59 | 0 |
| /spaces | 70 | 304 | 400 | div image | 0 | 2 | 664 (2000) | 343 | 1264 | 62 | 0 |
| /the-quest | 103 | 384 | 404 | img image | 0.047 | 0 | 560 (1692) | 366 | 1191 | 59 | 0 |
| /create-a-space | 71 | 604 | 648 | img image | 0.016 | 1 | 743 (2405) | 217 | 1273 | 63 | 0 |

## Hydration (#418), SCAN-1205

The same run made 20 cold loads per page and viewport with a console listener on each:

| Page | Phone 390 | Desktop 1280 |
|---|---|---|
| /pricing | 0 hydration errors, 0 other console errors | 0, 0 |
| /the-community | 0, 0 | 0, 0 |
| / | 0, 0 | 0, 0 |

That is 0 in 120 cold loads on production. Together with the 2026-11-10 runs (0 in 24) and the 2026-11-16 server HTML diff (byte-stable within a deployment), the two #418s from the 2026-11-09 audit do not reproduce for a clean visitor.

## What the numbers say

1. **Script weight is about 0.56 to 0.75 MB over the wire** (1.7 to 2.5 MB decoded) on a clean signed-out load. The 2.1 to 3.5 MB read on 2026-11-16 in a signed-in browser was decoded size plus the member shell, not what a new visitor downloads.
2. **CLS is good everywhere except `/the-quest` on a throttled phone, at 0.301**, which is over the 0.25 "poor" line. Unthrottled it is 0 at 390 px and 0.047 at 1280 px, so something late-arriving shifts the page on slow links. Filed as SCAN-1265.
3. **Throttled phone LCP is over 4 s on six of ten pages.** The worst are `/pricing` (5.6 s, a background-image `div`), `/the-quest` (5.3 s), `/about` (4.6 s), `/the-community` (4.5 s) and `/discover` (4.4 s). Every one has an image as its LCP element. The pages whose LCP is an `h1` (`/for/studios`, `/themes`, `/create-a-space`) land at 1.6 to 2.3 s. Unthrottled, every page is under 0.9 s.
4. **Main-thread blocking on a throttled phone is highest on `/` (3.8 s, longest task 825 ms)**, then `/pricing` (1.7 s) and `/the-community` (1.3 s). The other seven pages are under 0.5 s with the same script bytes, so the home page's cost is its own work, not the shared shell.
5. **TTFB is 68 to 82 ms** (225 ms median on `/the-quest`). Server time is not the problem.

## What this run did not cover

Signed-in member surfaces were skipped (`PW_STORAGE_STATE` was not set), so nothing here speaks for `/feed`, the Space console or admin. Vercel Speed Insights field data (real visitors) is not included.
