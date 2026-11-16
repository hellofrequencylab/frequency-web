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

- **When:** 2026-11-16, 21:11 to 21:31 UTC, production, after #5102 (the Quest link opens its panel before paint, and the /pricing hero is preloaded).
- **Run:** `e2e-manual` run 43957433438 on production. The method is the same as the first reading.

### phone 390, throttled

| Page | TTFB ms | FCP ms | LCP ms | LCP element | CLS | Blocking ms | Script KB (decoded) | Image KB | Total KB | Requests | Console errors |
|---|---|---|---|---|---|---|---|---|---|---|---|
| / | 51 | 2348 | 2348 | img image | 0.001 | 3625 | 594 (1757) | 601 | 1450 | 59 | 0 |
| /pricing | 57 | 2176 | 3324 | div image | 0 | 2974 | 597 (1762) | 454 | 1320 | 63 | 0 |
| /the-community | 49 | 2060 | 4448 | img image | 0.001 | 1621 | 666 (2004) | 619 | 1543 | 67 | 0 |
| /discover | 55 | 1552 | 4264 | div image | 0 | 840 | 664 (2005) | 129 | 1036 | 55 | 0 |
| /for/studios | 42 | 1760 | 1760 | h1 | 0.002 | 567 | 592 (1748) | 214 | 1056 | 53 | 0 |
| /themes | 43 | 1460 | 1900 | h1 | 0 | 361 | 750 (2474) | 1041 | 2105 | 71 | 0 |
| /about | 43 | 1640 | 4592 | img image | 0 | 283 | 662 (2000) | 240 | 1145 | 55 | 0 |
| /spaces | 46 | 1612 | 3896 | div image | 0.001 | 482 | 663 (2005) | 287 | 1204 | 60 | 0 |
| /the-quest | 202 | 1848 | 5200 | img image | 0 | 301 | 560 (1695) | 326 | 1147 | 55 | 0 |
| /create-a-space | 43 | 1816 | 2272 | h1 | 0 | 406 | 742 (2408) | 351 | 1403 | 64 | 0 |

### phone 390

| Page | TTFB ms | FCP ms | LCP ms | LCP element | CLS | Blocking ms | Script KB (decoded) | Image KB | Total KB | Requests | Console errors |
|---|---|---|---|---|---|---|---|---|---|---|---|
| / | 45 | 356 | 364 | img image | 0 | 37 | 594 (1761) | 666 | 1560 | 63 | 0 |
| /pricing | 44 | 572 | 572 | div image | 0 | 19 | 675 (2033) | 453 | 1461 | 67 | 0 |
| /the-community | 44 | 356 | 356 | img image | 0 | 0 | 665 (2005) | 764 | 1687 | 70 | 0 |
| /discover | 44 | 288 | 308 | div image | 0 | 0 | 664 (2005) | 129 | 1036 | 55 | 0 |
| /for/studios | 42 | 284 | 284 | h1 | 0 | 3 | 591 (1748) | 214 | 1128 | 54 | 0 |
| /themes | 44 | 220 | 632 | h1 | 0 | 0 | 753 (2488) | 1041 | 2109 | 70 | 0 |
| /about | 43 | 228 | 236 | img image | 0 | 0 | 661 (2000) | 417 | 1320 | 58 | 0 |
| /spaces | 48 | 276 | 328 | div image | 0 | 0 | 663 (2005) | 361 | 1278 | 62 | 0 |
| /the-quest | 65 | 692 | 692 | h1 | 0 | 0 | 560 (1695) | 521 | 1344 | 59 | 0 |
| /create-a-space | 43 | 592 | 772 | h1 | 0 | 7 | 747 (2422) | 408 | 1466 | 65 | 0 |

### desktop 1280

| Page | TTFB ms | FCP ms | LCP ms | LCP element | CLS | Blocking ms | Script KB (decoded) | Image KB | Total KB | Requests | Console errors |
|---|---|---|---|---|---|---|---|---|---|---|---|
| / | 45 | 504 | 608 | div image | 0.002 | 97 | 595 (1761) | 689 | 1650 | 62 | 0 |
| /pricing | 43 | 380 | 380 | div image | 0 | 84 | 673 (2034) | 355 | 1419 | 66 | 0 |
| /the-community | 42 | 348 | 348 | h1 | 0 | 16 | 665 (2005) | 296 | 1231 | 71 | 0 |
| /discover | 43 | 292 | 364 | div image | 0 | 0 | 663 (2005) | 187 | 1096 | 56 | 0 |
| /for/studios | 45 | 432 | 432 | img image | 0.031 | 47 | 591 (1748) | 199 | 1116 | 54 | 0 |
| /themes | 43 | 260 | 720 | h1 | 0 | 0 | 754 (2488) | 1213 | 2443 | 74 | 0 |
| /about | 43 | 308 | 308 | img image | 0 | 0 | 658 (2001) | 320 | 1278 | 59 | 0 |
| /spaces | 43 | 348 | 432 | div image | 0 | 14 | 663 (2005) | 342 | 1262 | 62 | 0 |
| /the-quest | 63 | 328 | 400 | img image | 0.002 | 1 | 558 (1695) | 366 | 1191 | 59 | 0 |
| /create-a-space | 45 | 428 | 428 | h1 | 0.016 | 4 | 744 (2422) | 217 | 1291 | 64 | 0 |

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
