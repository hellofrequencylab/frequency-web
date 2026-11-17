# Public pages: Core Web Vitals baseline (clean profile, production)

Status of the work this measures lives in [`docs/BUILD-BACKLOG.json`](../BUILD-BACKLOG.json) (SCAN-1218, SCAN-1205, SCAN-1265). This file is a dated reading, not a tracker. Re-measure by dispatching the `e2e-manual` workflow against `https://frequencylocal.com` with `base_url` set to production and replace the tables below.

## How it was taken

- **When:** first taken 2026-11-16, 19:23 to 19:41 UTC, against production `https://frequencylocal.com`; re-measured after #5102 (see Readings).
- **Run:** GitHub Actions `e2e-manual`, run 43938516828, job 133549442468 (`test/e2e/field-measure.spec.ts`, signed out, no stored state).
- **Profile:** a fresh browser context per load, so there is no warm cache, no cookie, and no stored side. Each figure is the median of 3 cold loads.
- **Throttled phone:** 390 px with 1.6 Mbps down, 750 kbps up, 150 ms latency and a 4x CPU slowdown (the same shape as Lighthouse's phone run). The unthrottled rows show the same pages on the runner's own link.
- **Bytes:** transfer size over the wire, with decoded script size in brackets.

## Readings

The current reading. The SCAN-1265 probe reads the `/the-quest` row of the throttled-phone table below, so a re-measure replaces these tables.

- **When:** 2026-11-16, 23:21 to 23:42 UTC, production deploy `bc1e6aa0`, after #5123, #5134 and #5136.
- **Run:** `e2e-manual` run 43978441871 on production. The method is the same as the first reading. 222 passed, 0 failed.

### phone 390, throttled

| Page | TTFB ms | FCP ms | LCP ms | LCP element | CLS | Blocking ms | Script KB (decoded) | Image KB | Total KB | Requests | Console errors |
|---|---|---|---|---|---|---|---|---|---|---|---|
| / | 207 | 2484 | 2484 | img image | 0.001 | 4372 | 592 (1757) | 406 | 1256 | 55 | 0 |
| /pricing | 207 | 2432 | 3752 | div image | 0 | 3877 | 598 (1762) | 454 | 1322 | 63 | 0 |
| /the-community | 207 | 2828 | 3500 | img image | 0.001 | 2730 | 587 (1733) | 621 | 1482 | 69 | 0 |
| /discover | 212 | 2188 | 2856 | div image | 0 | 688 | 663 (2006) | 245 | 1211 | 61 | 0 |
| /for/studios | 199 | 1800 | 1808 | h1 | 0.002 | 756 | 592 (1748) | 213 | 1058 | 60 | 0 |
| /themes | 198 | 1496 | 1980 | h1 | 0 | 561 | 756 (2490) | 1041 | 2111 | 75 | 0 |
| /about | 201 | 1660 | 2044 | img image | 0 | 369 | 663 (2002) | 241 | 1146 | 58 | 0 |
| /spaces | 197 | 1832 | 2296 | div image | 0.001 | 534 | 663 (2006) | 335 | 1254 | 67 | 0 |
| /the-quest | 355 | 1692 | 5016 | img image | 0 | 414 | 560 (1697) | 326 | 1149 | 58 | 0 |
| /create-a-space | 200 | 2068 | 2436 | h1 | 0 | 590 | 747 (2424) | 351 | 1408 | 68 | 0 |

### phone 390

| Page | TTFB ms | FCP ms | LCP ms | LCP element | CLS | Blocking ms | Script KB (decoded) | Image KB | Total KB | Requests | Console errors |
|---|---|---|---|---|---|---|---|---|---|---|---|
| / | 69 | 444 | 444 | img image | 0 | 75 | 595 (1761) | 667 | 1561 | 69 | 0 |
| /pricing | 71 | 372 | 376 | div image | 0 | 41 | 673 (2035) | 453 | 1461 | 71 | 0 |
| /the-community | 68 | 296 | 296 | img image | 0 | 0 | 664 (2006) | 764 | 1824 | 76 | 0 |
| /discover | 68 | 312 | 312 | div image | 0 | 0 | 664 (2006) | 244 | 1211 | 61 | 0 |
| /for/studios | 69 | 304 | 304 | h1 | 0 | 18 | 592 (1748) | 213 | 1058 | 60 | 0 |
| /themes | 71 | 268 | 700 | h1 | 0 | 3 | 755 (2490) | 1041 | 2110 | 74 | 0 |
| /about | 66 | 296 | 296 | img image | 0 | 0 | 661 (2002) | 417 | 1320 | 61 | 0 |
| /spaces | 67 | 312 | 312 | div image | 0 | 0 | 664 (2006) | 409 | 1351 | 69 | 0 |
| /the-quest | 102 | 404 | 404 | h1 | 0 | 0 | 561 (1697) | 521 | 1346 | 62 | 0 |
| /create-a-space | 68 | 544 | 544 | h1 | 0 | 0 | 748 (2424) | 407 | 1468 | 69 | 0 |

### desktop 1280

| Page | TTFB ms | FCP ms | LCP ms | LCP element | CLS | Blocking ms | Script KB (decoded) | Image KB | Total KB | Requests | Console errors |
|---|---|---|---|---|---|---|---|---|---|---|---|
| / | 68 | 400 | 564 | div image | 0.002 | 144 | 592 (1761) | 690 | 1651 | 73 | 0 |
| /pricing | 77 | 560 | 560 | div image | 0 | 124 | 674 (2035) | 355 | 1422 | 78 | 0 |
| /the-community | 69 | 452 | 452 | h1 | 0 | 31 | 662 (2006) | 297 | 1249 | 85 | 0 |
| /discover | 70 | 376 | 376 | div image | 0 | 0 | 663 (2006) | 187 | 1098 | 67 | 0 |
| /for/studios | 69 | 436 | 436 | img image | 0.031 | 76 | 591 (1748) | 200 | 1115 | 66 | 0 |
| /themes | 75 | 260 | 828 | h1 | 0 | 11 | 755 (2490) | 1212 | 2446 | 87 | 0 |
| /about | 69 | 336 | 336 | img image | 0 | 0 | 660 (2002) | 320 | 1278 | 67 | 0 |
| /spaces | 71 | 388 | 444 | div image | 0 | 28 | 661 (2006) | 343 | 1313 | 75 | 0 |
| /the-quest | 98 | 416 | 428 | img image | 0.002 | 16 | 560 (1697) | 365 | 1192 | 68 | 0 |
| /create-a-space | 71 | 716 | 716 | h1 | 0.012 | 9 | 745 (2424) | 216 | 1279 | 73 | 0 |

## Change since the #5102 reading

The #5102 reading was run 43957433438 (21:11 UTC). Between the two: #5123 preloads the /spaces and Discover hero stills, #5134 fetches the Quest landing photo during the parse, and #5136 puts the two lead /the-community collage photos at high priority. Other merges landed on main in the same window, and medians of 3 cold loads move by several hundred milliseconds run to run, so a move of a few hundred milliseconds on a page nothing here touched (/pricing, /) is spread, not a result. /about fell from 4.6 s to 2.0 s with no change aimed at it; it stays unexplained until a second run repeats it.

What this says: /spaces (-1.6 s) and /discover (-1.4 s) are the #5123 preloads and are now under 3 s. /the-community fell 0.9 s to 3.5 s. /the-quest barely moved (5.2 to 5.0 s): the photo request now starts at the parse, but the inline script sits after both half sections of a long page, so on a 1.6 Mbps link the parser reaches it late. The Quest is the page the SCAN-1265 probe reads, and it still fails.

#### Slow phone (390, throttled)

| Page | LCP ms before → after | CLS before → after | Blocking ms before → after |
|---|---|---|---|
| / | 2348 → 2484 | 0.001 → 0.001 | 3625 → 4372 |
| /pricing | 3324 → 3752 | 0 → 0 | 2974 → 3877 |
| /the-community | 4448 → 3500 | 0.001 → 0.001 | 1621 → 2730 |
| /discover | 4264 → 2856 | 0 → 0 | 840 → 688 |
| /for/studios | 1760 → 1808 | 0.002 → 0.002 | 567 → 756 |
| /themes | 1900 → 1980 | 0 → 0 | 361 → 561 |
| /about | 4592 → 2044 | 0 → 0 | 283 → 369 |
| /spaces | 3896 → 2296 | 0.001 → 0.001 | 482 → 534 |
| /the-quest | 5200 → 5016 | 0 → 0 | 301 → 414 |
| /create-a-space | 2272 → 2436 | 0 → 0 | 406 → 590 |

## Change since the first reading

The first reading was taken 2026-11-16, 19:23 to 19:41 UTC (run 43938516828), before #5102. LCP and CLS are medians of 3 cold loads, so single-page moves of a few hundred milliseconds are inside the run-to-run spread.

#### Slow phone (390, throttled)

| Page | LCP ms before → after | CLS before → after | Blocking ms before → after | Script KB after | Total KB after |
|---|---|---|---|---|---|
| / | 2404 → 2348 | 0.001 → 0.001 | 3785 → 3625 | 594 | 1450 |
| /pricing | 5628 → 3324 | 0 → 0 | 1671 → 2974 | 597 | 1320 |
| /the-community | 4456 → 4448 | 0.001 → 0.001 | 1292 → 1621 | 666 | 1543 |
| /discover | 4356 → 4264 | 0 → 0 | 347 → 840 | 664 | 1036 |
| /for/studios | 1728 → 1760 | 0.002 → 0.002 | 474 → 567 | 592 | 1056 |
| /themes | 1620 → 1900 | 0 → 0 | 316 → 361 | 750 | 2105 |
| /about | 4560 → 4592 | 0 → 0 | 198 → 283 | 662 | 1145 |
| /spaces | 3884 → 3896 | 0.001 → 0.001 | 335 → 482 | 663 | 1204 |
| /the-quest | 5280 → 5200 | 0.301 → 0 | 229 → 301 | 560 | 1147 |
| /create-a-space | 2252 → 2272 | 0 → 0 | 305 → 406 | 742 | 1403 |

#### Phone 390

| Page | LCP ms before → after | CLS before → after | Blocking ms before → after | Script KB after | Total KB after |
|---|---|---|---|---|---|
| / | 388 → 364 | 0 → 0 | 14 → 37 | 594 | 1560 |
| /pricing | 424 → 572 | 0 → 0 | 10 → 19 | 675 | 1461 |
| /the-community | 476 → 356 | 0 → 0 | 0 → 0 | 665 | 1687 |
| /discover | 440 → 308 | 0 → 0 | 0 → 0 | 664 | 1036 |
| /for/studios | 564 → 284 | 0 → 0 | 0 → 3 | 591 | 1128 |
| /themes | 640 → 632 | 0 → 0 | 0 → 0 | 753 | 2109 |
| /about | 280 → 236 | 0 → 0 | 0 → 0 | 661 | 1320 |
| /spaces | 380 → 328 | 0 → 0 | 0 → 0 | 663 | 1278 |
| /the-quest | 332 → 692 | 0 → 0 | 0 → 0 | 560 | 1344 |
| /create-a-space | 496 → 772 | 0 → 0 | 0 → 7 | 747 | 1466 |

#### Desktop 1280

| Page | LCP ms before → after | CLS before → after | Blocking ms before → after | Script KB after | Total KB after |
|---|---|---|---|---|---|
| / | 444 → 608 | 0.002 → 0.002 | 69 → 97 | 595 | 1650 |
| /pricing | 652 → 380 | 0 → 0 | 64 → 84 | 673 | 1419 |
| /the-community | 416 → 348 | 0 → 0 | 3 → 16 | 665 | 1231 |
| /discover | 392 → 364 | 0 → 0 | 0 → 0 | 663 | 1096 |
| /for/studios | 452 → 432 | 0.031 → 0.031 | 36 → 47 | 591 | 1116 |
| /themes | 660 → 720 | 0 → 0 | 3 → 0 | 754 | 2443 |
| /about | 268 → 308 | 0 → 0 | 0 → 0 | 658 | 1278 |
| /spaces | 400 → 432 | 0 → 0 | 2 → 14 | 663 | 1262 |
| /the-quest | 404 → 400 | 0.047 → 0.002 | 0 → 1 | 558 | 1191 |
| /create-a-space | 648 → 428 | 0.016 → 0.016 | 1 → 4 | 744 | 1291 |

What changed, and why:

- `/the-quest` CLS went from 0.301 to 0 on a throttled phone and from 0.047 to 0.002 on desktop, which is #5102's pre-paint panel open.
- `/pricing` throttled-phone LCP went from 5.6 s to 3.3 s, which is #5102's hero preload. The same change, measured on matching preview builds, went from 6.1 s to 3.2 s.
- `/spaces` and Discover get the same preload in #5123, which was not yet live for this run.

## Hydration (#418), SCAN-1205

The same run made 20 cold loads per page and viewport with a console listener on each:

| Page | Phone 390 | Desktop 1280 |
|---|---|---|
| /pricing | 0 hydration errors, 0 other console errors | 0, 0 |
| /the-community | 0, 0 | 0, 0 |
| / | 0, 0 | 0, 0 |

That is 0 in 120 cold loads on production. Together with the 2026-11-10 runs (0 in 24) and the 2026-11-16 server HTML diff (byte-stable within a deployment), the two #418s from the 2026-11-09 audit do not reproduce for a clean visitor.

## What the first reading said

1. **Script weight is about 0.56 to 0.75 MB over the wire** (1.7 to 2.5 MB decoded) on a clean signed-out load. The 2.1 to 3.5 MB read on 2026-11-16 in a signed-in browser was decoded size plus the member shell, not what a new visitor downloads.
2. **CLS is good everywhere except `/the-quest` on a throttled phone, at 0.301**, which is over the 0.25 "poor" line. Unthrottled it is 0 at 390 px and 0.047 at 1280 px, so something late-arriving shifts the page on slow links. Filed as SCAN-1265.
3. **Throttled phone LCP is over 4 s on six of ten pages.** The worst are `/pricing` (5.6 s, a background-image `div`), `/the-quest` (5.3 s), `/about` (4.6 s), `/the-community` (4.5 s) and `/discover` (4.4 s). Every one has an image as its LCP element. The pages whose LCP is an `h1` (`/for/studios`, `/themes`, `/create-a-space`) land at 1.6 to 2.3 s. Unthrottled, every page is under 0.9 s.
4. **Main-thread blocking on a throttled phone is highest on `/` (3.8 s, longest task 825 ms)**, then `/pricing` (1.7 s) and `/the-community` (1.3 s). The other seven pages are under 0.5 s with the same script bytes, so the home page's cost is its own work, not the shared shell.
5. **TTFB is 68 to 82 ms** (225 ms median on `/the-quest`). Server time is not the problem.

## What this run did not cover

Signed-in member surfaces were skipped (`PW_STORAGE_STATE` was not set), so nothing here speaks for `/feed`, the Space console or admin. Vercel Speed Insights field data (real visitors) is not included.
