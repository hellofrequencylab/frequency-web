# Repeating events: one card, one page, one indexed home

> **Status lives in [`docs/BUILD-BACKLOG.json`](BUILD-BACKLOG.json)** — run `pnpm backlog`.
> This document is the spec and the rationale. It does **not** record what is done, because prose
> cannot be verified and this repo has lost that bet five times ([ADR-1043](DECISIONS.md)).

> **The answer.** A repeating event is stored as one real database row per date, so a daily event that
> runs for two months is about 61 separate events. Nothing on the HTML side ever knew that, so browse
> lists, search, discover, the sitemap and the recommendation index all showed the same gathering
> dozens of times, and the fixed-size blocks (the Circle "Upcoming events" block, the Channel strip,
> both rail Events panels) were consumed entirely by one series. This plan adds ONE pure, unit-tested
> fold, `lib/events/series.ts`, that is the HTML twin of the `planCalendarFeed` collapse the calendar
> feeds have used since ADR-807. It is applied at the read edge of every browse surface and at no
> calendar surface. The repeating event's own page becomes its series home, carrying a rail of the next
> real dates; every date keeps its own live, RSVP-able page and its own back-link. Two numbers
> (`cardsPerSeries`, `railDates`) plus an SEO number (`indexedOccurrences`) are operator-tunable in one
> `platform_settings` row, with no deploy, and the same row is the kill switch. Hosts get plain-language
> directions and a real preview of the dates they are about to create.

**Status legend:** ✅ done / passing · ⏳ in progress or to build · ⚠️ needs attention · 🔴 blocker.

---

## 1. At a glance

| | |
|---|---|
| **The problem** | Recurrence is materialised (ADR-007). Inside the 60-day horizon a daily series is ~61 `events` rows, weekly ~9, monthly ~3. No HTML surface collapses them, so browse blocks, search, discover, the sitemap and `event_embeddings` all carry one row per date. |
| **The shape of the fix** | One pure fold `collapseSeries(rows, opts)` in `lib/events/series.ts`, keyed on `parent_event_id ?? id`, electing the **earliest row present in the caller's result**. Applied at the read edge of browse only. Rows win over date arithmetic, always. |
| **Blast radius** | 1 new pure module + 4 new server modules, 23 browse read edges, 1 additive migration (2 `SECURITY DEFINER` RPCs recreated), 1 new layout module, 1 admin console section, ~40 changed files. No schema change to `events`. No data migration. |
| **Defaults** | `cardsPerSeries: 1` · `railDates: 5` · `indexedOccurrences: 2`. Zero configuration is correct: the settings row is never seeded and every failure path lands on those three numbers. |
| **Kill switch** | One `UPDATE` on `platform_settings.events_series_display` → `{"cardsPerSeries":60,"railDates":5,"indexedOccurrences":10}`. `MAX_CARDS_PER_SERIES = 60` is set deliberately so this is a **true** off switch (60 is the materialisation horizon's bound). Browse reverts on the next request; crawl within an hour (`revalidate = 3600`). |
| **ADR** | ADR-897 (verified: `docs/DECISIONS.md` tops out at ADR-892). |
| **Migration version** | `20270121000000` (verified free: latest applied is `20270120000000_circles_theme.sql`). |

---

## 2. Today's behaviour and what it costs

### 2.1 The arithmetic

`HORIZON_DAYS = 60` (`lib/event-recurrence.ts:23`) bounds one series inside a browse window:

| Cadence | Rows in window | Rows needed to guarantee 1 distinct series |
|---|---|---|
| Monthly | ~3 | 3 |
| Weekly | ~9 | 9 |
| Daily | ~61 | 61 |

**The trap that makes this worse than "noisy".** The database `LIMIT` is applied **before** any fold can
run. A block that reads 3 rows and then collapses a daily series renders exactly **one** card, which is
visibly worse than today's three duplicates while looking like a fix. Over-fetching is therefore
mandatory, not optional, and it is only a partial fix (see §2.3).

### 2.2 Surface impact, with the limit-starvation math

| Surface | File:line | Reads | A daily series today | Post-fold read | Grade |
|---|---|---|---|---|---|
| `/events` circle union | `app/(main)/events/index-data.ts:402` | 40 | 40 of 40 slots | `seriesFetchLimit(40)` = 240 | 🟢 |
| `/events` public union | `app/(main)/events/index-data.ts:422` | 200 | ~61 of a **global** 200 cap | **500** (`SERIES_WIDE_READ`) | 🟡 |
| `/events` nearby distances | `app/(main)/events/index-data.ts:425` | 200 | beyond 200, `distance_m: null` | **500** | 🟡 |
| `/events` hosted union | `app/(main)/events/index-data.ts:447` | 60 | 60 of 60 | `seriesFetchLimit(60)` = 240 | 🟢 |
| Circle "Upcoming events" | `components/widgets/circles/circle-events.tsx:79` | 6 | 5 of 5 slots, `hasMore` permanently lit | `seriesFetchLimit(5)` = 50 | 🟡 |
| Channel "Upcoming" strip | `components/events/upcoming-widget.tsx:56` | 3 | 3 of 3 | `seriesFetchLimit(3)` = 30 | 🟢 |
| Rail Events panel (circle) | `components/sidebar/rail-panels.tsx:50` | 3 | 3 of 3 | 30 | 🟢 |
| Rail Events panel (community) | `components/sidebar/rail-panels.tsx:65` | 3 | 3 of 3, community-wide | 30 | 🟢 |
| Space "Upcoming sessions" | `components/widgets/entity/entity-offerings.tsx:23` | 6 | 6 of 6 | 60, opt-in | 🟡 |
| Space CTA picker | `components/widgets/entity/entity-cta.tsx:138` | 8 | 8 of 8 | 80, opt-in | 🟡 |
| Space page Events block | `lib/spaces/content-data.ts:769` | 24 | 24 of 24 | 240, opt-in | 🟡 |
| Search page, Events tab | `app/(main)/search/page.tsx:142` | 20 | 20 identical rows, **oldest first from the beginning of time** | two reads, 200 each | 🟡 |
| ⌘K `/api/search` | `app/api/search/route.ts:78` | 6 | 6 identical | two reads, 60 each | 🟡 |
| Spotlight hosted | `lib/spotlight/data.ts:125` | 5 | 5 of 5 | 50 | 🟢 |
| Broadcast "happening soon" | `app/(main)/broadcast/page.tsx:125` | 5 | 5 of 5 | 50 | 🟢 |
| Circle map events | `components/connections/group-map-section.tsx:65` | 10 | 10 of 10 | 100 | 🟢 |
| Profile feed hosted events | `components/feed/profile-feed.tsx:91-97` | 5 | 5 of 5 | 50 | 🟢 |
| For-You candidate scope | `lib/events/matching.ts:123-129` | 60 | 60 near-identical candidates | 240 | 🟡 |
| QR target picker (marketing) | `lib/qr/marketing.ts:32-37` | 50 | 50 identical titles | 240 | 🟢 |
| `/discover/events` + hubs + counts | `lib/discover.ts:87-91` via `public_events` | 50 | ~50 identical cards + 50 JSON-LD `Event` nodes | RPC cap 200 → 500 | 🟡 |
| Organizer page | `app/discover/events/organizer/[handle]/page.tsx:70-84` | RPC hard-codes 100 | one host's daily series eats all 100 rows | `_limit` param, 2 partitions | 🟡 |
| `app/sitemap.ts` | `:213, :323-329` | 200 URL event budget | ~61 URLs + ~61 OG images for one series | series home + 2 | 🔴 today |
| `event_embeddings` | `lib/events/embeddings.ts:80-122` | batch of 100 | ~61 byte-identical 384-d vectors | anchors only | 🔴 today |

### 2.3 What over-fetch does and does not buy

`SERIES_FETCH_MULTIPLIER = 10` is sized on the **weekly** cadence (~9 rows in 60 days), so
`seriesFetchLimit(N)` guarantees N collapsed cards against any mix of weekly, monthly and one-off
events. ⚠️ **It does not guarantee them against a daily series, and it truncates the browse horizon.**
State this plainly rather than discovering it in QA:

- A 3-slot block reading 30 rows sees ~30 days of a daily series and nothing beyond it. Its effective
  browse horizon collapses from 60 days to ~30.
- The Circle block reading 50 rows sees ~50 days. A sibling one-off 55 days out is never fetched.
- Therefore `hasMore` must be `series.length > limit || rows.length >= fetchLimit`, so a block never
  hides its own "See all events" escape hatch on a truncated read.

The real fix is named and deferred: **`SERIES-PD`**, a SQL `DISTINCT ON (coalesce(parent_event_id, id))`
push-down so the `LIMIT` counts series, not rows. Pull it forward for the three 3-slot surfaces (Channel
strip, both rail panels) if the horizon truncation is judged unacceptable. The JS fold stays the
authority either way: `collapseSeries` over an already-distinct list is the identity function.

### 2.4 Pre-existing defects this work must fix, because it makes them reachable

| # | Defect | File | Fixed in step |
|---|---|---|---|
| D1 | The series home goes `noindex` a week after it starts, while its own children stay indexable. The exact inversion of consolidation. | `app/(main)/events/[slug]/page.tsx:192,200` | 36 |
| D2 | The sitemap advertises private, `circle_only`, unlisted and draft events whose pages answer `noindex, nofollow`. `public_events` is `SECURITY DEFINER` and filters only `is_cancelled` and `starts_at`. | `supabase/migrations/20260612020000_public_events_price.sql` | 38 (crawl path only) |
| D3 | The delete warning says "only this occurrence is deleted". For an **anchor** that is false: `ON DELETE CASCADE` removes every date and every RSVP. | `app/(main)/events/[slug]/settings/console.tsx:38` | 45 |
| D4 | The series home's OG image and JSON-LD publish the anchor's own past date. | `opengraph-image.tsx:63-70`, `page.tsx:1540-1547` | 39 |
| D5 | `dateRangeWindow` builds the facet window from **server-local** date parts and compares to wall-clock-as-UTC values, so "Today" and "This weekend" drift by a day after UTC midnight. | `app/(main)/events/index-data.ts:147-175` | 14 |
| D6 | Eight browse reads use `.gte('starts_at', new Date().toISOString())`, which drops tonight's 7pm gathering from ~5pm Pacific. | listed in §4.2 | 15-22 |

---

## 3. The design

### 3.1 The two traps, as first-class constraints

**Trap 1: the anchor ages out.** `app/(main)/events/index-data.ts:363` builds
`listableFrom = ${dayInZone(nowDate, HOME_TZ)}T00:00:00.000Z` and every browse read applies
`.gte('starts_at', listableFrom)`. So a long-running series' **anchor row is gone from the result** the
moment its original date passes. Only children remain.

> **The rule.** Group on `seriesKey = parent_event_id ?? id`. Elect the **earliest row present in the
> caller's result**, never "the anchor". A `parent_event_id IS NULL` predicate is the same bug in
> disguise and deletes every long-running series from the index outright.

The trap has a crawl-side twin: `listSitemapEventEntries` must resolve anchorless series keys in a
second bounded read, under the same public gate, or a long-running series contributes no series-home URL.

**Trap 2: two sources of truth for "the next date".** `lib/events/recurrence.ts` `nextOccurrence()`
computes a date from the cadence. It can name a date no row exists for (the occurrence was cancelled,
the cadence changed after materialisation, `recurrence_until` was shortened and nothing prunes stale
children, or the date is past `HORIZON_DAYS` and has not been minted). It also carries no slug, so it
can never be a link.

> **The rule.** Where rows exist, rows win. Every date shown to a member comes from a row the caller
> fetched. `nextOccurrence()` is deleted from the event detail page. The **one** legitimate use of
> arithmetic is `previewOccurrenceDates()` in the host create form, where no rows exist yet, and it is
> labelled as a preview.

### 3.2 Why the fold is pure and gate-free

An anchor and its children legitimately **diverge** on `visibility`, `status`, `scope_id`, `space_id`,
`price_cents`, `capacity`, `title` and `theme.marketListed`: only `updateEvent` propagates edits
(`app/(main)/events/actions.ts:581` → `lib/event-recurrence.ts:204-241`), and only to rows with
`starts_at >= now()`. Every other writer is single-row.

> **The rule.** The caller's query decides who may see a row. The fold only groups what it was handed.
> It never queries, never fetches siblings, never re-derives a gate from an elected representative, and
> never reads a clock it was not given. The one place a sibling read happens is
> `lib/events/series-dates.ts`, which re-applies the full gate in app code.

### 3.3 What collapses and what does not

| Collapses (browse) | Never collapses |
|---|---|
| `/events` index (all three unions), map pins, JSON-LD `ItemList` | Calendar and agenda grids (`app/(main)/events/calendar/page.tsx`, the per-Space calendar tab) |
| Circle block, Channel strip, both rail panels | `.ics` feeds (`planCalendarFeed` already collapses; folding again double-collapses) |
| Search page + `/api/search` (partitioned) | The series page's own date rail |
| Space readers (opt-in), Spotlight, Broadcast, circle map, profile feed | The viewer's own "Going" lane |
| `/discover` events, hubs, organizer page, city and topic counts | Every operator console: admin events, Space settings calendar, circle-manage picker, CRM, `/admin/qr` |
| For-You candidate scope | Reminder crons, the materialiser, gates and existence checks |
| Sitemap, `/llms.txt` count, embeddings | `resonance/` (different table, no `parent_event_id`) |

---

## 4. Section 1: the core module

Owner of the public API. Where §1 and §2 disagreed, **§1 wins and §2 was rewritten**, because the module
owns its own symbol names. Where §1's `electBy` option and §2's fold placement contradicted each other,
`electBy` is **deleted** (§4.4).

### 4.1 `lib/events/series.ts` (new, pure, zero imports)

Zero `import` statements, matching `lib/events/recurrence.ts`, so a client component may import it and
so `lib/time/zone.ts`'s `tz-lookup` dataset never reaches a client bundle. The consequence is that the
module cannot build the "today in HOME_TZ" floor itself; the caller passes it in.

**Exports, complete and authoritative:**

```ts
export const DEFAULT_CARDS_PER_SERIES = 1
export const DEFAULT_RAIL_DATES = 5
export const DEFAULT_MAX_DATES = 12
export const DEFAULT_INDEXED_OCCURRENCES = 2

/** The cadences that make a row a series anchor (ADR-007). EXPORTED so there is exactly one
 *  predicate: lib/events/series-seo.ts and app/events/[slug]/event.ics/route.ts both use it.
 *  recurrence_type is `text NOT NULL DEFAULT 'none'`, so a one-off's value is the TRUTHY string
 *  'none', never null. Anything testing `!row.recurrence_type` is wrong. */
export const CADENCES: ReadonlySet<string>
export function isSeriesCadence(value: string | null | undefined): boolean
export function isSeriesAnchor(row: SeriesRow): boolean

/** The three columns every folding read must add to its SELECT, verbatim, in this order. */
export const SERIES_COLUMNS = 'recurrence_type, recurrence_until, parent_event_id'
export interface SeriesFields {
  recurrence_type?: string | null
  recurrence_until?: string | null
  parent_event_id?: string | null
}
export interface SeriesRow extends SeriesFields {
  id: string
  starts_at: string | null
  slug?: string | null
  is_cancelled?: boolean | null
}

/** ONE declaration of this type in the repo. lib/events/series-dates.ts imports it and narrows
 *  `slug` at its own boundary (its read already filters on r.slug). */
export interface SeriesDate { id: string; slug: string | null; startsAt: string }

export interface SeriesGroup<T> {
  key: string                 // parent_event_id ?? id
  representatives: T[]        // 1..perSeries, earliest first
  dates: SeriesDate[]         // eligible dates, earliest first, capped at maxDates
  dateCount: number           // TRUE eligible count, uncapped
  hiddenCount: number         // dateCount - representatives.length
  recurring: boolean
  anchorId: string | null     // provably === key for a series
  anchorPresent: boolean      // NOT a permission answer
}
export interface CollapseOptions {
  perSeries?: number          // default DEFAULT_CARDS_PER_SERIES, clamped to a floor of 1
  upcomingFrom?: string       // seriesUpcomingFloor(dayInZone(now, HOME_TZ))
  dropCancelled?: boolean     // default true; an undefined is_cancelled always passes
  maxDates?: number           // default DEFAULT_MAX_DATES
}
export interface CollapseResult<T> {
  rows: T[]                             // input order, non-representatives removed
  groups: SeriesGroup<T>[]
  byRowId: Map<string, SeriesGroup<T>>  // read on the SERVER; pass primitives across RSC
}

export function seriesKey(row: SeriesRow): string          // row.parent_event_id ?? row.id
export function seriesUpcomingFloor(todayInZone: string): string
export function collapseSeries<T extends SeriesRow>(rows: T[], opts?: CollapseOptions): CollapseResult<T>

/** The rows-only convenience wrapper every simple call site uses. */
export function collapseSeriesRows<T extends SeriesRow>(rows: T[], opts?: CollapseOptions): T[] {
  return collapseSeries(rows, opts).rows
}

/** Search's partition, owned here so there is one copy. Folds the upcoming half and the past half
 *  SEPARATELY and concatenates: a still-running series is represented by its NEXT date, a finished
 *  one by its LAST. Folding the mixed list would elect a date that already happened. The caller
 *  passes the past half already sorted newest-first (see §5.5). */
export function collapseSeriesAroundFloor<T extends SeriesRow>(
  upcoming: T[], past: T[], limit: number, opts?: CollapseOptions,
): T[]

export function seriesDates<T extends SeriesRow>(
  rows: T[], opts?: { upcomingFrom?: string; limit?: number; dropCancelled?: boolean },
): SeriesDate[]

export const SERIES_FETCH_MULTIPLIER = 10
/** Hard ceiling on a DISPLAY-sized over-fetch. */
export const SERIES_FETCH_CEILING = 240
export function seriesFetchLimit(displayLimit: number): number
  // Math.min(SERIES_FETCH_CEILING, Math.max(want, want * SERIES_FETCH_MULTIPLIER))

/** For surfaces whose LIMIT is a GLOBAL cap on the community's whole upcoming set rather than a
 *  display count: the /events public union, the nearby distance read, and the public_events RPC cap.
 *  SERIES_FETCH_CEILING does not apply to those, because one daily series can spend 61 of the budget
 *  before the fold runs and the rows dropped are dropped by the DATABASE, not by the fold. */
export const SERIES_WIDE_READ = 500
```

### 4.2 The fold's behaviour, case by case

| Situation | What the fold does |
|---|---|
| Anchor is inside the window | It is simply the earliest eligible row, so it is elected. No special case. |
| Anchor has aged out | The earliest surviving **child** is elected. The series stays in the index. |
| Orphan children, no anchor anywhere | One bucket on the shared `parent_event_id`, one card. Never dropped. |
| A middle occurrence is cancelled | Ineligible: absent from `dates`, absent from `dateCount`, never elected. |
| The representative is cancelled | Election skips to the next eligible date. There is no "cancelled card". |
| Every occurrence is cancelled | The group is dropped. The only path on which a series disappears, and only because the caller opted into `dropCancelled`. |
| A date facet is active | Nothing special. The caller filters to the window **first**, so "earliest eligible" is by construction the earliest occurrence inside the window. This is requirement C, satisfied by order of operations. |
| `perSeries = 0`, `-3`, `NaN` | Clamped to 1. Zero would silently delete every repeating event from browse. |
| A row has a null or unparseable `starts_at` | Passes through untouched at its input position, joins no group. `starts_at` became nullable in `20261191000000_events_draft_nullable_start.sql`. |
| 🔴 **A row has a falsy `id`** | Same treatment: **pass through, join no group.** Without this, a SELECT that forgot `id` makes `seenIds.has(undefined)` true after the first row and the fold returns exactly ONE row for the whole list. This is a real bug that shipped in the draft spec for `lib/qr/marketing.ts`. |
| The last occurrence of a finished series | A group of one: `recurring: true`, `dateCount: 1`, `hiddenCount: 0`. |

### 4.3 The one time rule

`events.starts_at` stores the host's wall clock kept as UTC parts. There is **one** definition of
"upcoming" in this plan and it lives in this module:

```ts
const upcomingFrom = seriesUpcomingFloor(dayInZone(now, HOME_TZ)) // "2027-03-01T00:00:00.000Z"
```

🔴 **Never** `new Date(row.starts_at) >= new Date()`. At 5:01pm Pacific it is already tomorrow in UTC,
so that test drops tonight's 7pm gathering from every listing.
🔴 **Never** a lexicographic timestamp compare: Postgres emits both `...Z` and `...+00:00` for the same
instant. Every comparison goes through `Date.parse`.

**Reconciliation (this plan's ruling).** The draft sections shipped three incompatible definitions:
browse and the sitemap used the wall-clock floor, `§3`'s rail used `isEventPast` (a true instant, so a
7pm date vanished from the rail at 8pm while browse still showed it), and eight untouched reads used the
naive compare. **All three now use `seriesUpcomingFloor`.** `loadSeriesView` computes `dates`,
`totalUpcoming` and `next` against that floor, so the rail, the browse card and the sitemap ordinal can
never disagree about which occurrence is number one. `isEventPast` keeps its existing job (deciding
whether the row being *viewed* has ended) and is not used for series membership.

On `/events`, do not rebuild the string: pass the existing `listableFrom` local
(`index-data.ts:363`) straight through, so the query floor and the fold floor are literally the same
value.

### 4.4 Ruling: `electBy` is deleted

The draft §1 invented `electBy: 'input'` so that under a popularity, relevance or distance sort a series
would be represented by its best-ranked occurrence. §2 then placed the fold **between** the facet filter
and the sort, where `filteredEvents` is in three-way union-concatenation order, making the option both
unreachable and meaningless. No call site ever passed it.

> **Ruling: delete `electBy` and its test case.** Say the tradeoff out loud rather than shipping a dead
> option: **under `?sort=popularity`, `relevance` or `distance`, a series is represented by its earliest
> in-window date and ranks on that date's numbers,** not on its best-attended occurrence. That is a real
> and acceptable cost. The alternative (sort first, fold with `electBy: 'input'`, keep that order) adds
> a second ordering branch to the busiest page for a marginal gain. Named as a follow-up:
> **`SERIES-RANK`**.

### 4.5 Test matrix, `lib/events/series.test.ts`

House style, confirmed against `lib/events/ics.test.ts` and `lib/events/circle-upcoming.test.ts`: node
env, no globals so every symbol is imported, module-level `FLOOR`, a `row(over)` factory, id-array
assertions, fixed future dates, and a prose header naming the bug the file prevents.

| # | Case | Expected |
|---|---|---|
| 1 | Empty input | `rows: []`, `groups: []`, `byRowId.size === 0` |
| 2 | One-offs pass through | ids equal input ids in order; each group `recurring: false`, `hiddenCount: 0` |
| 3 | Rows missing the recurrence columns | Behaves as case 2. No throw |
| 4 | Weekly series, anchor + 8 children | `rows: ['a']`, `dateCount: 9`, `hiddenCount: 8`, `anchorPresent: true` |
| 5 | `perSeries: 2` | `rows: ['a','c1']`, `hiddenCount: 7`, both map to the same group |
| 6 | `perSeries` coercion `0, -3, NaN, undefined, 2.7` | `1,1,1,1,2` |
| 7 | Anchor in window | Representative is the anchor |
| 8 | **Anchor aged out** (children only) | `rows: ['c1']`, `anchorId: 'a'`, `anchorPresent: false`, series NOT dropped |
| 9 | Orphans sharing `parent_event_id: 'ghost'` | 1 group, `key: 'ghost'`, nothing dropped |
| 10 | Mixed series + one-offs | Global input order preserved minus folded rows |
| 11 | Cancelled middle occurrence | `dateCount` excludes it; it appears in no `dates` entry |
| 12 | Cancelled representative | Next date elected |
| 13 | Every occurrence cancelled | Group dropped |
| 14 | `dropCancelled: false` | Nothing dropped |
| 15 | `recurrence_until` a month past the last row | `dateCount` counts ROWS only, never extrapolates |
| 16 | Daily series, 61 rows | `rows.length === 1`, `dateCount: 61`, `hiddenCount: 60`, `dates.length === 12` |
| 17 | Two series interleaved | 2 groups in first-appearance order |
| 18 | Date facet (caller pre-filtered to the weekend) | The Saturday row elected, `hiddenCount` window-scoped |
| 19 | Wall-clock floor keeps tonight's 19:00 event | Row survives |
| 20 | Naive-compare counter-test | Documents that `new Date()` would have dropped it |
| 21 | DST boundary (2027-03-14 weekly at 19:00) | All `startsAt` keep `T19:00`; no offset resolved |
| 22 | Monthly short-month clamp Jan 31 / Feb 28 / Mar 31 | One group, order preserved |
| 23 | Last occurrence of a finished series | `recurring: true`, `dateCount: 1`, `hiddenCount: 0` |
| 24 | Duplicate row ids | Counted once |
| 25 | Null / unparseable `starts_at` | Both pass through at input positions, join no group |
| 26 | 🔴 **Rows cast in with `id: undefined`** | Pass through untouched. Must NOT collapse to one row |
| 27 | `byRowId` scope | `has('a')` true, `has('c1')` false |
| 28 | `anchorId === key` for a series, `null` for a one-off | |
| 29 | Cancelled anchor, live children | `recurring: true`, `anchorPresent: false`, child elected |
| 30 | `+00:00` vs `Z` spelling | Sorted by instant, not by string |
| 31 | `seriesDates` | 5 entries, earliest first, deduped, cancelled excluded, each carrying `slug` |
| 32 | `seriesFetchLimit(3, 6, 24, 40, 0)` | `30, 60, 240, 240, 10` |
| 33 | `seriesFetchLimit(200)` | `240` |
| 34 | `collapseSeriesAroundFloor` upcoming/past split | Upcoming half first (next date), then past half (last date) |
| 35 | `isSeriesCadence` | `'daily'/'weekly'/'monthly'` true; `'none'`, `''`, `null`, `'fortnightly'` false |
| 36 | Purity | Same input twice, deep-equal results, input array and rows unmutated |

Plus **S1.5**, a source-shape drift guard (house archetype C, `lib/events/options.test.ts:44-67`):
`lib/events/series.ts` contains no `import` line, no `Date.now(`, and does not import `nextOccurrence`.
Include the vacuity assertion the house style requires.

### 4.6 Non-goals (🔴 the fold must never)

| Never | Because |
|---|---|
| Touch a database, a Supabase client, `fetch`, or `server-only` | It must stay importable from a client component |
| Fetch or infer sibling rows | Bypasses the caller's gates and turns a pure helper into an RLS hole |
| Decide visibility, status, `removed_at`, demo or market listing | Those are the caller's query predicates |
| Read `Date.now()` or call `new Date()` with no argument | Makes the fold untestable and time-of-day flaky |
| Re-sort or re-rank the surviving rows | It returns `rows.filter(...)`, so every sort survives byte for byte |
| Drop an orphan child, or a row it cannot date | Silent deletion is the worse failure |
| Expand a cadence or call `nextOccurrence()` | Rows win |
| Emit user-facing copy or aggregate price / capacity / RSVP counts | Those legally differ per occurrence |

---

## 5. Section 2: surface wiring

### 5.1 The eight rules

1. **Columns and fold ship in the same commit.** `collapseSeriesRows` over rows without
   `parent_event_id` returns the input unchanged, with no error and no log. A commit that lands only
   columns is inert and safe; a commit that lands only the fold is a lie.
2. **Every folding read must select `id` and `starts_at`.** The fold keys on both and degrades badly
   without them (see case 26).
3. **Over-fetch, fold, then slice.** Never slice first, and that includes `[0]` and `hasMore`.
4. **`hasMore` and any count beside a collapsed list counts series, not rows**, and lights when
   `series.length > limit || rows.length >= fetchLimit`.
5. **On `/events` the fold runs after the facet filter and before the sort.** Everywhere else it runs
   immediately after the read.
6. **A surface the viewer owns does not collapse:** the "Going" lane, host manage lists, settings
   calendars.
7. **Never re-read a gate column off the elected representative and apply it to the group.**
8. **Never fetch siblings inside a fold.**

### 5.2 The reads that gain columns

Append `, recurrence_type, recurrence_until, parent_event_id` (`SERIES_COLUMNS`) verbatim, in that
order, matching `EVENT_SELECT` at `app/(main)/events/index-data.ts:373`.

| # | File:line | New SELECT |
|---|---|---|
| B7 | `components/widgets/circles/circle-events.tsx:66` | existing + `SERIES_COLUMNS` |
| B8 | `components/events/upcoming-widget.tsx:42` | existing + `SERIES_COLUMNS` |
| B9/B10 | `components/sidebar/rail-panels.tsx:43` and `:59` | existing + `SERIES_COLUMNS` (**both**) |
| B11 | `app/(main)/search/page.tsx:133-134` | existing + `SERIES_COLUMNS` before the `host:profiles` join |
| B12 | `app/api/search/route.ts:72` | existing + `SERIES_COLUMNS` |
| B13-15 | `lib/events/store.ts:50-51` (`COLS`) | existing + `SERIES_COLUMNS`; `SpaceEvent extends SeriesFields` |
| B16 | `lib/spotlight/data.ts:119` | existing + `SERIES_COLUMNS` |
| B17 | `lib/quest/next-gathering.ts:56` | existing + `SERIES_COLUMNS` (columns only, no fold) |
| B18 | `app/(main)/broadcast/page.tsx:124` | existing + `SERIES_COLUMNS` |
| B19 | `components/feed/feed-list.tsx:287` **and** `:296` | existing + `SERIES_COLUMNS` (**both** branches, or the demo viewer gets a chip-less card) |
| B20 | `components/connections/group-map-section.tsx:57` | existing + `SERIES_COLUMNS` |
| B21 | `lib/events/matching.ts:107` **and** `:123` | `+ parent_event_id` only (no cadence label rendered) |
| B22 | 🔴 `lib/qr/marketing.ts:32` | `'id, slug, title, starts_at, parent_event_id'`. **Verified**: the current select is `'slug, title, starts_at'` and has **no `id`**. Without it the fold returns one row per host |
| B23 | `components/feed/profile-feed.tsx:91-97` | existing + `SERIES_COLUMNS` (missed by the draft survey) |
| P5 | `app/discover/events/_data.ts:63-64` (`SAFE_COLUMNS`) | existing + `SERIES_COLUMNS` |
| P1-P7 | `public_events` / `public_organizer_events` | new migration, §5.7 |

Row types extend the shared interface rather than restating fields:
`type EventRow = SeriesFields & { id: string; ... }`.

### 5.3 `/events` index (the biggest edit)

`app/(main)/events/index-data.ts`. **Risk: 🟡 medium.** Five changes in one commit.

**1. Limits.**

| Line | Today | New |
|---|---|---|
| `:402` circle union | `.limit(40)` | `.limit(seriesFetchLimit(40))` → 240 |
| `:422` public union | `.limit(200)` | `.limit(SERIES_WIDE_READ)` → 500 |
| `:425` `nearbyEvents` | `limit: 200` | `limit: SERIES_WIDE_READ` → 500. ⚠️ Not raising this leaves every event beyond the nearest 200 with `distance_m: null`, silently failing the `near` facet |
| `:447` hosted union | `.limit(60)` | `.limit(seriesFetchLimit(60))` → 240 |

**2. Fix `dateRangeWindow` (D5).** `:147-175` builds the window from server-local date parts and
compares it to wall-clock-as-UTC values. Build it from `dayInZone(now, HOME_TZ)` parts, the same rule
`listableFrom` already uses, and compare parsed instants. Add a `lib/events/index-data.test.ts` case
pinned at 17:01 Pacific. Requirement C is only as accurate as this window, and acceptance row C1
("its date line names Saturday") fails intermittently without it.

**3. The config, read once.**

```ts
const { cardsPerSeries } = await getSeriesDisplayConfig()
```

**4. The fold, between `filteredEvents` (`:608`) and the sort (`:638`).** Keep the **full** result: the
card needs `hiddenCount` and `collapseSeriesRows` throws it away.

```ts
// Collapse repeating series (ADR-897). AFTER the facet filter and BEFORE the sort, deliberately.
// The Date facet already narrowed the rows to the chosen window, so the earliest row still standing
// here IS the occurrence inside that window: "This weekend" elects Saturday's date, and no window has
// to be threaded into the fold. The same ordering makes the elected row the one whose RSVP count and
// capacity the card prints, so "Has open spots" can never promise seats belonging to a different date.
const collapsed = collapseSeries(filteredEvents, { upcomingFrom: listableFrom, perSeries: cardsPerSeries })
const seriesEvents = collapsed.rows
// Primitives only across the RSC boundary: never hand a Map to a client card.
const moreDates: Record<string, number> = {}
for (const [id, g] of collapsed.byRowId) moreDates[id] = g.hiddenCount
```

Then `:638` becomes `const sortedEvents = [...seriesEvents].sort(`, and `moreDates` joins the returned
`EventsIndexData`.

**5. The Going lane keeps every date and keeps the viewer's sort.** `:660` is
`const goingEvents = sortedEvents.filter((e) => myRsvps.has(e.id))`, so it inherits the chosen sort
today. Rebuild it off the **pre-fold** list without losing that:

```ts
// NOT collapsed, and built off the PRE-fold list on purpose: this is the member's own list of dates
// they said yes to. If they RSVP'd to the third Tuesday and the fold elected the first, collapsing
// here would drop the date they are actually going to. The comparator is the page's own, so the
// viewer's chosen sort (distance / popularity / relevance) still applies.
const goingEvents = [...filteredEvents].filter((e) => myRsvps.has(e.id)).sort(eventComparator)
```

⚠️ Extract the existing `:638` comparator into a named `eventComparator` so the two lists cannot drift.
🔴 Do **not** use `a.starts_at.localeCompare(b.starts_at)` (the draft did): Postgres emits both `...Z`
and `...+00:00`. Use `Date.parse(a.starts_at) - Date.parse(b.starts_at)` if a date sort is ever wanted.

**6. `moreDates` reaches the card.** `components/marketplace/events-surface.tsx:186-196` and
`components/events/events-for-you.tsx` both render `<EventCard>` and both gain
`moreDates={data.moreDates[event.id] ?? 0}`. Without this the "+N more dates" chip is dead code and the
operator console's helper text is a false statement.

> **Ruling on chip scope.** The chip renders wherever `EventCard` renders a collapsed list, which today
> is exactly those two files. The Circle block, the Channel strip and the rail panels render plain link
> rows, not `EventCard`, and gain no chip in v1. Copy C19 is worded to match. Map pin popups are a named
> follow-up (`SERIES-PIN`, one line at `index-data.ts:669-691`).

### 5.4 Circle block, Channel strip, rail panels

| Surface | Edit |
|---|---|
| `lib/events/circle-upcoming.ts` `selectUpcomingForCircle` | `CircleEventRow extends SeriesFields`; take `upcomingFrom` and `perSeries` as **arguments** (the module stays pure); replace the `at < cutoff` compare with `Date.parse(row.starts_at) < Date.parse(upcomingFrom)`; fold before the slice; `hasMore: series.length > limit \|\| rows.length >= fetchLimit` |
| `components/widgets/circles/circle-events.tsx` | `SERIES_COLUMNS`; `:76` `.gte('starts_at', floor)` with the wall-clock floor; `:79` `.limit(seriesFetchLimit(CIRCLE_UPCOMING_LIMIT))` (the `+ 1` idiom retires) |
| `components/events/upcoming-widget.tsx` | `SERIES_COLUMNS`; `:56` floor + `.limit(seriesFetchLimit(3))`; `collapseSeriesRows(raw, { perSeries }).slice(0, 3)` |
| `components/sidebar/rail-panels.tsx` | Both branches: `SERIES_COLUMNS`, floor at `:47` and `:63`, `.limit(seriesFetchLimit(3))`, fold + slice. ⚠️ The fallback branch is **unscoped**, so one daily series anywhere in the community currently fills every member's rail |

Tests: extend `lib/events/circle-upcoming.test.ts` with (a) a daily series of six rows plus two
standalone events yields three cards, (b) `hasMore` false when the collapsed count is under the limit
even though the row count exceeded it, (c) a 19:00 row on the floor's own day survives.

### 5.5 Search: two reads, two folds

**Risk: 🟡 medium.** This is the only new semantics in the section.

🔴 The draft's single-read partition **cannot work**. Verified: `app/(main)/search/page.tsx:130-142` and
`app/api/search/route.ts:70-78` have **no date predicate** and both `.order('starts_at', { ascending:
true })`. So the fetched window is the OLDEST N matching rows from the beginning of time. For a
long-running daily series the 200 rows are 200 **past** occurrences, the "upcoming" half is empty, and
the past half is ascending so "earliest present" elects the series' very first date ever.

**The fix: run two reads and fold each half.**

```ts
const floor = seriesUpcomingFloor(dayInZone(new Date(), HOME_TZ))
const [up, back] = await Promise.all([
  base.gte('starts_at', floor).order('starts_at', { ascending: true }).limit(seriesFetchLimit(20)),
  base.lt('starts_at', floor).order('starts_at', { ascending: false }).limit(seriesFetchLimit(20)),
])
// A still-running series is represented by its NEXT date; a finished one by its LAST. The past half
// arrives newest-first so the fold's "earliest present" election picks the most recent finished date.
const events = collapseSeriesAroundFloor(up.data ?? [], back.data ?? [], 20, { perSeries: cardsPerSeries })
```

`app/api/search/route.ts` is identical with `seriesFetchLimit(6)` and a limit of 6. Both files are
guarded on the string `collapseSeriesAroundFloor(`, and the past-descending ordering is pinned in the
wiring guard because reversing those two lines silently changes which date the page shows.

### 5.6 The shared Space reader (opt-in, never default)

`lib/events/store.ts` `listEventsForSpace` also serves
`app/(main)/spaces/[slug]/settings/calendar/page.tsx:54,58` and
`app/(main)/spaces/[slug]/manage/rail-getters.ts:522,815`, which are operator consoles that must keep
every occurrence. The flag is opt-in:

```ts
export async function listEventsForSpace(
  spaceId?: string | null,
  opts: { limit?: number; upcomingOnly?: boolean; collapseSeries?: boolean; perSeries?: number; upcomingFrom?: string } = {},
): Promise<SpaceEvent[]>
```

`upcomingOnly` switches `:411` from `new Date().toISOString()` to `opts.upcomingFrom ?? floor`.
The three browse callers pass `collapseSeries: true` plus `perSeries` from the config:
`entity-offerings.tsx:23` (limit 6), `entity-cta.tsx:138` (limit 8),
`lib/spaces/content-data.ts:769` (limit 24).

The wiring guard asserts the default is **off** (`opts.collapseSeries ?` appears, and there is no
`collapseSeries = true` default) because that is the operator-console regression the opt-in exists to
prevent.

### 5.7 The RPC migration

🔴 **The draft's "`create or replace`, additive only, three columns on the end of `RETURNS TABLE`" is
rejected by Postgres with `ERROR 42P13: cannot change return type of existing function`.** The very
migration the spec told the implementer to copy documents this in its own comment
(`supabase/migrations/20261203000000_calendar_feed_recurrence.sql:28-31`: *"DROP first: the OUT columns
change, and CREATE OR REPLACE cannot change a function's return type (42P13), caught applying the band
to prod, 2026-07-26"*). `20260612020000_public_events_price.sql:9` repeats it.

Two further citations in the draft are wrong and are corrected here:
- The live `public_events` body is in **`20260612020000_public_events_price.sql`**, not the 2024 file.
- `public_organizer_events` is in **`20260613120000_event_calendar_follows.sql:140`**, not
  `20240211000000_public_discover_reads.sql`.

New file `supabase/migrations/20270121000000_public_events_recurrence.sql`:

```sql
-- ADR-897. Both RPCs gain recurrence_type / recurrence_until / parent_event_id so the browse fold can
-- run on their rows. DROP first: the OUT columns change and CREATE OR REPLACE cannot change a
-- function's return type (42P13). Grants are dropped with the function and MUST be re-issued below.
-- Every WHERE clause, JOIN, ORDER and the price three-state are copied VERBATIM from the source
-- migrations: these are SECURITY DEFINER leak-contract surfaces (ADR-807), where a WHERE edit is a
-- security change, not a display change.

drop function if exists public.public_events(integer);
create function public.public_events(_limit integer default 50)
returns table ( /* body verbatim from 20260612020000_public_events_price.sql, plus the 3 columns */ )
  -- LIMIT GREATEST(1, LEAST(_limit, 200)) becomes LEAST(_limit, 500): a LIMIT change, not a
  -- visibility change, so seriesFetchLimit / SERIES_WIDE_READ is not silently clamped back.
;
grant execute on function public.public_events(integer) to anon, authenticated;

drop function if exists public.public_organizer_events(text);
create function public.public_organizer_events(_handle text, _limit integer default 100)
returns table ( /* body verbatim from 20260613120000_event_calendar_follows.sql:140, plus the 3 columns */ )
  -- The old body hard-coded `limit 100` across upcoming AND the 180-day past tail. One host running a
  -- daily series consumed the entire budget and their other events never reached the page. LEAST(_limit, 500).
;
grant execute on function public.public_organizer_events(text, integer) to anon, authenticated;
```

⚠️ `public_events`' missing `visibility` / `status` filter is **not** fixed here. It is a real, separate
defect; the crawl path is fixed in §7 by reading through `lib/events/series-seo.ts` instead, and the six
discover callers are a named follow-up. Widening a `SECURITY DEFINER` `WHERE` clause inside a display PR
is a security change in disguise.

**Docs.** This migration changes a documented API, so update `docs/DATABASE.md`'s `public_events` and
`public_organizer_events` entries with the three new columns, the new `_limit` parameter and the raised
cap, cross-referencing ADR-897. The draft claimed "DATABASE.md: nothing"; that was wrong.

### 5.8 Discover, hubs, organizer

| Surface | Edit |
|---|---|
| `lib/discover.ts` `getPublicEvents(limit, opts)` | `PublicEvent extends SeriesFields`; collapses **by default** (all six callers are browse, count or crawl); reads `_limit: SERIES_WIDE_READ`, folds, slices to `limit`; `perSeries` threaded from the async caller |
| `app/discover/events/_data.ts` `getUpcomingSafeEvents` | `SAFE_COLUMNS` + `SeriesFields`; fold **before** `toEnriched` (which drops the fields), which collapses the hub lists, the sibling-category counts and the hub sitemap entries in one place |
| `app/discover/events/organizer/[handle]/page.tsx` | Request `seriesFetchLimit(50)` per partition through the new `_limit`; sort `past` **newest-first before** folding: `past.sort((a,b) => Date.parse(b.starts_at) - Date.parse(a.starts_at))`; fold `upcoming` and `past` separately. Pin the ordering in the guard |

Re-run `app/discover/cities/density-gate.test.ts`: the density threshold is now measured on series,
which is the honest measure but a behaviour change for any city whose count was carried by one
repeating event.

### 5.9 Missed surfaces the draft did not map

| Surface | Verdict |
|---|---|
| `components/feed/profile-feed.tsx:91-97` (a member's hosted events, `.limit(5)`) | ✅ **Collapses.** `SERIES_COLUMNS`, `seriesFetchLimit(5)`, fold, slice 5. Add to both guard lists |
| `lib/spaces/discovery.ts:267-285` `upcomingEventCountsFor` | ⚠️ **Count backlog.** Needs `parent_event_id` and a **distinct-seriesKey** count, not a row count. A row fold cannot fix a head count |
| `app/(main)/admin/qr/page.tsx:111` (`.limit(100)` destination picker) | 🔴 **Operator, must NOT fold.** Same 50-identical-titles problem as `lib/qr/marketing.ts`, but an operator picking a check-in destination needs the specific date. A grouped picker is a follow-up, mirroring the circle-manage picker |

### 5.10 The drift guard, `lib/events/series-wiring.test.ts`

The failure this prevents is **silent**: the fold over rows with no `parent_event_id` returns the input
unchanged, with no error and no log. Nothing else in CI catches it (`check:canon` reads only `content/`,
`check:seo` ignores interpolated sections, and a behavioural test with a mocked client would answer with
whatever columns the test itself supplied).

Assertions, all on **stable single-line tokens** (the draft's whitespace-exact multi-line literal would
break on any reformat, which is not the bug the test exists to prevent):

| Block | Assertion |
|---|---|
| Columns | every path in `COLUMN_SURFACES` contains `SERIES_COLUMNS` (imported from `./series`) |
| Fold | every path in `FOLDING_SURFACES` contains `collapseSeriesRows(`, `collapseSeries(` or `collapseSeriesAroundFloor(` |
| Config | every folding loader contains `getSeriesDisplayConfig(` and `perSeries` (or, for the pure modules, its async caller does) |
| Chip | `components/marketplace/events-surface.tsx` and `components/events/events-for-you.tsx` contain `moreDates` |
| `/events` order | `src.indexOf('const filteredEvents') < src.indexOf('collapseSeries(') < src.indexOf('const sortedEvents')` |
| Going lane | `expect(src).toContain('const goingEvents = [...filteredEvents]')` |
| Search order | `app/(main)/search/page.tsx` and `app/api/search/route.ts` contain `ascending: false` beside the past read |
| Organizer order | the page contains `Date.parse(b.starts_at) - Date.parse(a.starts_at)` |
| Space reader default | `lib/events/store.ts` contains `opts.collapseSeries ?` and NOT `collapseSeries = true` |
| 🔴 NEVER | `app/(main)/events/calendar/page.tsx`, `app/(main)/spaces/[slug]/(profile)/calendar/page.tsx`, `app/(main)/spaces/[slug]/settings/calendar/page.tsx`, `lib/events/ics.ts`, `lib/spaces/collaborator-calendar.ts`, `app/(main)/admin/events/load-events.ts`, `app/(main)/circles/[slug]/manage/events-section.tsx`, `app/(main)/admin/qr/page.tsx`. None call the browse fold (comments stripped first) |
| RPC agreement | all three column names appear in both the `returns table` block and the select list of `20270121000000_public_events_recurrence.sql`, plus a "the parse found something" assertion |
| Vacuity | `COLUMN_SURFACES.length > 10`, `FOLDING_SURFACES.length > 12`, every `readFileSync` longer than 500 chars |

🔴 The draft's NEVER list guarded `lib/events/calendar-grid.ts`, which contains **no** `from('events')`
read at all, so that assertion could never fail, while the four real calendar readers were unguarded.
Corrected above.

⚠️ **Guard sequencing.** The vacuity assertions (`length > 10`) cannot pass on an empty list, so the
guard lands in two parts: the NEVER block and the RPC block first (step 3), the column/fold/config lists
and their vacuity assertions with the **last** wiring commit (step 24).

### 5.11 Pagination

Nothing in the repo paginates events. The rules, to be written into `docs/EVENTS-CALENDAR.md` §4:

| If a surface ever pages | What breaks | The rule |
|---|---|---|
| Fold per page, after slicing | Page 2 repeats a series page 1 showed | **The page size counts series, never rows.** Fold the whole window, then slice by page |
| Offset cursor | Row offsets and series offsets diverge as the horizon rolls | Never offset-page a folded list |
| Keyset cursor on the raw row | The cursor points at a row the fold hid | The cursor is the **elected representative's** `(starts_at, id)` |
| `hasMore` from `rows.length > limit` | Permanently true for any circle with one daily series | `hasMore` compares the collapsed count |

---

## 6. Section 3: the series page, the card, the occurrence page

### 6.1 Ruling: the series page is the anchor's own `/events/[slug]`

| Factor | Anchor slug (chosen) | Sub-route `/events/[slug]/dates` (rejected) |
|---|---|---|
| Anonymous crawlability | ✅ `isAnonPublicEvent` is true for exactly one segment (`app/(main)/layout.tsx:104-109`) | 🔴 `if (rest) return false` → a signed-out crawler gets a 307 to `/` |
| Canonical | ✅ already self-canonical; `/discover/events/<slug>` already points here | ⚠️ forks it |
| Sitemap / OG image / `.ics` | ✅ all three already exist on this URL; the anchor `.ics` already exports the whole series as one VEVENT + RRULE + EXDATEs from real child rows | ⚠️ three duplicates |
| Rail registry | ✅ `/events/<slug>` is pinned `'global'` with a do-not-change comment (`lib/layout/page-chrome.ts:199-204`) | 🔴 needs a new `page-chrome.ts` line |
| RSVP semantics | ⚠️ the anchor holds real RSVPs keyed on `event.id`; series mode stops offering them | ✅ clean, but the anchor page stays broken anyway |

No `tabs` row in v1. `DetailTemplate.tabs` stays free.

### 6.2 Series mode: one derived state

```ts
// computed right after `isPast` (page.tsx:788)
const seriesMode =
  event.parent_event_id == null &&
  isSeriesCadence(event.recurrence_type) &&
  isPast &&
  series?.next != null            // ROW-BACKED, never nextOccurrence()
```

| Concern | Normal | Series mode |
|---|---|---|
| Subtitle when-line (`page.tsx:1703-1706`) | `whenLine` | `Next date: {nextWhenLine}` |
| 🔁 recurrence line (`:1731-1745`) | cadence via `recurrenceLabel()` | unchanged |
| Arithmetic `Next:` line (`:1749-1759`) | **deleted** | **deleted** |
| `joinActions` (`:1131-1429`) | as today | `<SeriesNextJoin>` pointing at the next dated row |
| `showBottomBar` (`:1435-1437`) | as today | `false` (its label and action key on the anchor row) |
| `schedule.nextOccurrenceIso` | `null` | the next **row's** ISO |

⚠️ `event-when-where.tsx:114` gates the add-to-calendar buttons on `nextOccurrenceIso`. After this change
that value is set only in series mode, a strict subset of today's condition, so `showCalendar` can only
become more conservative. 🔴 Never populate it for a past **child** row.

🔴 Never offer a series-level RSVP. There is no series-level `event_rsvps`, capacity or ticket tier, and
the write would land on the anchor row, which is a past date.

### 6.3 `lib/events/series-dates.ts` (new, `server-only`)

```ts
export const SERIES_READ_CAP = 100  // HORIZON_DAYS = 60 bounds a daily series at ~61 rows + anchor
export async function loadSeriesView(args: {
  eventId: string; parentEventId: string | null; recurrenceType: RecurrenceType
  scopeType: string; scopeId: string; timeZone: string
  allowedVisibilities: readonly string[]
  railDates: number
  upcomingFrom: string        // seriesUpcomingFloor(dayInZone(now, HOME_TZ))
}): Promise<SeriesView | null>
export async function nextPublicOccurrence(anchorId: string, now?: Date): Promise<{ slug: string; startsAt: string } | null>
```

`SeriesView` carries `seriesKey`, `anchor` (`{slug,title} | null`), `recurrenceType`, `recurrenceUntil`,
`dates: SeriesDate[]` (imported from `lib/events/series.ts`, narrowed here), `totalUpcoming`, `next`,
`lastPast`, `icsHref`.

**Implementation rules, all load-bearing:**

1. `seriesKey = parentEventId ?? eventId`. Return `null` immediately when
   `parentEventId == null && !isSeriesCadence(recurrenceType)`. A one-off does **no** reads.
2. One admin read, hard-capped at `SERIES_READ_CAP`, selecting `id, slug, title, starts_at, visibility,
   status, is_cancelled, removed_at, scope_type, scope_id, recurrence_type, recurrence_until,
   parent_event_id`, `.or('id.eq.<key>,parent_event_id.eq.<key>')`, ordered ascending.
3. **Gate in app code, never by trusting the elected row.** Keep a row only when
   `status === 'published'` and `is_cancelled === false` and `removed_at == null` and
   `allowedVisibilities.includes(row.visibility ?? 'circle_only')` and, for a `circle_only` row,
   `row.scope_type === args.scopeType && row.scope_id === args.scopeId`.
4. 🔴 **`allowedVisibilities` requires a new read; the draft's claim that the page already computes it
   is wrong.** Verified: `app/(main)/events/[slug]/page.tsx:475-491` runs the `memberships` query only
   inside `if (!canManage) { ... if (vis === 'circle_only' && circleId) { ... } }`. For a `public` or
   `unlisted` event, which is the common case for a crawlable series, the membership read never happens,
   so a hoisted boolean would be `false` and a signed-in member of the hosting circle would see none of
   the series' `circle_only` dates. **Fix:** compute `circleMemberOfThisEvent` unconditionally when
   `circleId != null` and the viewer is signed in (one extra indexed read, folded into the existing
   `Promise.all` at `:496`), and leave the gate's own early `notFound()` behaviour untouched.
   ```ts
   const allowedVisibilities = canManage
     ? ['public', 'unlisted', 'circle_only', 'private']
     : circleMemberOfThisEvent ? ['public', 'unlisted', 'circle_only'] : ['public', 'unlisted']
   ```
5. **Upcoming** is `Date.parse(row.starts_at) >= Date.parse(args.upcomingFrom)`, the same floor browse
   and the sitemap use. 🔴 Not `isEventPast` (the draft's rule): that resolves a true instant, so at 8pm
   a 7pm date vanishes from the rail while browse still shows it and `seriesSeoFacts` still counts it as
   occurrence one.
6. Exclude `row.id === args.eventId` from `dates` (the rail says "More dates").
7. `totalUpcoming` counts after gating and exclusion, **before** slicing. It counts rows this viewer can
   see, which is the only honest number.
8. `anchor` is non-null only when the anchor row itself survived rule 3. A public child of a private or
   draft anchor gets **no** back-link and **no** series href.
9. Sort with `Date.parse`, never a raw string compare.
10. `nextPublicOccurrence` is the narrow twin for `generateMetadata` and the OG image, where there is no
    viewer: it hard-codes `visibility='public'`, `status='published'`, `is_cancelled=false`,
    `removed_at is null`, `.limit(1)`. §7 derives `seriesLive` from it rather than issuing a second
    count query.

Also new: **`lib/events/wall-time.ts`** (pure, no imports) holding `wallFormat` moved verbatim from
`event-when-where.tsx:24-33`, plus `SERIES_DATE_OPTS`, `SERIES_LONG_DATE_OPTS`, `SERIES_TIME_OPTS`. This
kills the third copy of the wall-clock formatter.

### 6.4 The date rail

**Registration (four data edits, zero page edits):**

| # | File | Edit |
|---|---|---|
| 1 | `lib/widgets/modules.ts` `LAYOUT_MODULES` (after `event-when-where` at `:237`) | `{ id: 'event-series-dates', label: 'More dates', description: "The next dates in this event's series, each linking to its own page. Hidden when there are no other dates." }` |
| 2 | `lib/widgets/modules.ts` `EVENT_DETAIL_MODULE_IDS` (`:621-647`) | add `'event-series-dates'` after `'event-when-where'` |
| 3 | `lib/widgets/registry.tsx` `COMPONENTS` (`:326-349`) | `'event-series-dates': EventSeriesDates,` + import |
| 4 | `lib/page-settings/default-layouts.ts` `'/events/*'` `side.order` (`:53`) | insert between `'event-when-where'` and `'event-schedule'` |

⚠️ **Step 4 covers the CODED default only.** `lib/page-settings/layout.ts:140-144` (`moduleAssignments`)
appends any module id absent from a **saved** slot's `order` to `defaultSlotId(config.template)`, which
for `main-side` is MAIN. So on any community that has ever used the on-page Layout editor for
`/events/*`, the rail lands at the bottom of the MAIN column and renders as a 320px `SidebarCard` in a
full-width column.

> **Ruling.** Ship the coded default plus a verification step, and say the MAIN fallback out loud so a
> future operator layout save is understood as the cause if the rail moves. Build step 30 runs
> `select route, config from page_settings where route like '/events%'` and inserts
> `'event-series-dates'` after `'event-when-where'` in any saved `side.order` found. A MAIN-safe
> rendering (`SectionHeader` + list instead of `SidebarCard`) is a named follow-up, `SERIES-MAIN`.

**The component:** `components/widgets/events/event-series-dates.tsx`, a **Server Component, zero props,
`async`**, the exact shape of `event-when-where.tsx`. `SidebarCard title="More dates" count={totalUpcoming}
Icon={CalendarDays}` wrapping a real `<ul>`/`<li>` of `next/link` rows, each
`aria-label={longDate + ' at ' + time}` because the visible text is abbreviated. Footer:
`Showing the next 5.` when truncated, plus a link to the anchor `.ics`.

| Considered | Verdict |
|---|---|
| `SidebarCard` + plain `<ul>` of links | ✅ **chosen.** `entity-card.tsx:6-8` says a card means a distinct object; lists use SectionHeader + whitespace |
| `EntityCard` per date | ⛔ It is the browse card. N of them for N dates is exactly the duplication this work kills |
| `StatCard` | ⛔ A KPI tile. Dates are not metrics |
| `EmptyState` | ⛔ Full-width dashed panel; nested in a 320px card it double-frames |
| `AddToCalendar` | ⛔ Requires a `googleUrl`, and there is no Google Calendar URL for a whole series |
| A new `DetailTemplate` header prop | ⛔ PAGE-FRAMEWORK §8.3 rule 3 + "compose, don't author" |

| State | Render |
|---|---|
| ✅ Normal (`dates.length > 0`) | the list, `count = totalUpcoming` |
| ✅ Truncated | list + `Showing the next 5.` |
| ✅ Finished series (anchor, recurring, no dates) | `This series has finished.` + `The last date was Sat, Aug 30.` when a past row exists |
| ✅ Orphan child with nothing left, or a one-off | `return null` (self-hide, matching every other event module) |
| ⚠️ No readable anchor | list still renders; the calendar link is suppressed |
| ⚠️ Public occurrence of a mixed-visibility series | Only dates this viewer may open are listed, and `totalUpcoming` counts the same set. Documented, not a bug |

### 6.5 The card (`components/events/event-card.tsx`)

**One optional prop, folded into the existing chip. Never a second recurrence line.**

```ts
const repeatBase =
  isSeriesCadence(event.recurrence_type) ? recurrenceLabel(event.recurrence_type as RecurrenceType)
  : event.parent_event_id ? 'Part of a series'
  : null
const repeatLabel =
  repeatBase && moreDates && moreDates > 0
    ? `${repeatBase} · ${moreDates} more ${moreDates === 1 ? 'date' : 'dates'}`
    : repeatBase
```

| Question | Answer |
|---|---|
| Copy | `Repeats weekly · 8 more dates` · `Part of a series · 8 more dates` (the common case per trap 1) · `Repeats weekly · 1 more date` |
| Placement | The existing repeat chip in the `EntityCard` `meta` row. No new slot |
| Destination | Nothing of its own. The chip is text inside `EntityCard`'s single anchor, which goes to the elected occurrence's page. That page carries the rail (if it is the anchor) or the back-link (if it is a child). ⛔ A nested `<a>` is forbidden |
| `moreDates` 0 or undefined | `repeatLabel === repeatBase`: byte-identical to today |
| `repeatBase === null` | No chip at all. A count with no cadence is meaningless |

⚠️ **The count is window-scoped, not global.** It is the number of other rows of the same `seriesKey`
that survived the **same filter this card did**. Under "This weekend", `1 more date` is the truth. A
global total would promise dates the filter excluded, and on a viewer-gated surface it would count rows
the viewer cannot open.

### 6.6 The occurrence back-link and the Event Details card

```tsx
const seriesBack =
  event.parent_event_id && series?.anchor
    ? { href: `/events/${series.anchor.slug}`, label: `Part of ${series.anchor.title}` }
    : undefined
```

Rendered by `DetailTemplate.back`, the slot the event page does not use today. It is the single back
affordance; do not also add one to `actions`. ⚠️ `detail-template.tsx:116-122` has no `truncate`, so add
`max-w-full` to the Link, `shrink-0 aria-hidden` to the chevron, and wrap the label in
`<span className="truncate">`. All current `back` labels are short, so nothing else moves.

**`event-when-where.tsx`, the `Series` FactRow.** 🔴 The draft would have regressed the anchor's own
card: if `seriesHref` were set whenever a readable series exists, an anchor page would stop saying
`Repeats weekly` and start saying `Part of <its own title>`, linking to itself.

> **Ruling.** `schedule.seriesHref` / `seriesTitle` are populated **only** when
> `event.parent_event_id != null` **and** the anchor survived the gate, exactly the same condition as
> `seriesBack`. **Anchors keep `repeats`.** Test case: the anchor page renders `Repeats weekly` and no
> self-link.

The `Next` FactRow becomes a link when `nextOccurrenceHref` is set. 🔴 This deletes the last copy of the
dead-end string `Part of a recurring series` (`page.tsx:1737` and `event-when-where.tsx:100`), and the
`RECURRENCE_LABEL` map (`page.tsx:96-100`) in favour of `recurrenceLabel()`.

### 6.7 Accessibility

| Concern | Spec |
|---|---|
| Rail semantics | `SidebarCard` renders an `<h3>`, so the rail is reachable by heading navigation. A real `<ul>`/`<li>` so a screen reader announces "list, 5 items". No `role` overrides, no `<nav>` landmark |
| Date announcement | Visible text is abbreviated (`Thu, Jul 30`), so every `<Link>` carries `aria-label="Thursday, July 30, 2026 at 7:00 PM"` |
| Focus | One tab stop per row in ascending date order, then the calendar link. `focus-visible:ring-2 focus-visible:ring-primary/50` plus a fill, because a hover fill alone is not a focus indicator. No `tabIndex` anywhere |
| Icons | `CalendarDays`, `Repeat` and `ChevronLeft` all `aria-hidden`; the text carries the meaning |
| Motion | Only `transition-colors`, each with `motion-reduce:transition-none` |
| Tap targets | Rail rows `px-4 py-3` on `text-sm` (~44px). Mobile: the SIDE slot stacks below MAIN, no media queries in the component, nothing scrolls horizontally |
| Tokens | Semantic tokens only. ⛔ No hex, no `text-[Npx]` (`scripts/check-tokens.mjs:5-22` fails the build) |
| Headings | No new `<h1>` (`scripts/check-headers.mjs`) |

---

## 7. Section 4: controls, and Section 5: SEO, docs, rollout

### 7.1 The one settings row

Three numbers, one JSON row in the existing `platform_settings` table under the key
`events_series_display`, read through `lib/events/series-config.ts` built on the proven
`lib/ai/vera/autonomy-config.ts` pattern.

```json
{"cardsPerSeries":1,"railDates":5,"indexedOccurrences":2}
```

| Candidate store | Verdict |
|---|---|
| **`platform_settings`** | ✅ **Chosen.** Already migrated (`20260616170000_platform_settings.sql:10`), service-role only, request-cached reader with a fallback |
| `platform_flags` | 🔴 Boolean only, by its own source note |
| `element_settings` | 🔴 `ElementSetting.kind` supports only `'toggle'` and `'choice'` |
| A new table | 🔴 A migration, an RLS policy and a second settings pattern to buy three integers |
| A hardcoded constant | 🔴 The requirement is tunable without a code change |

✅ **No migration.** ⚠️ **No seed row.** A seeded row becomes a second source of truth for the default,
and the day someone changes `DEFAULT_CARDS_PER_SERIES` the seeded row silently wins in production and
nowhere else. `vera_autonomy` and `beta_ends_at` are unseeded for the same reason.

### 7.2 `lib/events/series-config.ts`

```ts
export const SERIES_DISPLAY_KEY = 'events_series_display'
export const MIN_CARDS_PER_SERIES = 1
/** 60 is the materialisation horizon's bound: setting it shows every date again, which is what makes
 *  the operator setting a TRUE kill switch rather than a mitigation. */
export const MAX_CARDS_PER_SERIES = 60
export const MIN_RAIL_DATES = 1
export const MAX_RAIL_DATES = 20
export const MIN_INDEXED_OCCURRENCES = 0   // 0 is legal: "the series page only" is a coherent posture
export const MAX_INDEXED_OCCURRENCES = 10

export interface SeriesDisplayConfig { cardsPerSeries: number; railDates: number; indexedOccurrences: number }
export const DEFAULT_SERIES_DISPLAY: SeriesDisplayConfig  // imported from lib/events/series.ts, never re-declared
export function coerceSeriesDisplay(raw: unknown): SeriesDisplayConfig   // never throws
export const getSeriesDisplayConfig: () => Promise<SeriesDisplayConfig>  // React cache(), defaults on any error
export async function saveSeriesDisplayConfig(patch, changedBy?): Promise<SeriesDisplayConfig>
```

> **Ruling on the max.** The draft shipped `MAX_CARDS_PER_SERIES = 5` and a runbook stating "it is not a
> switch... turning the feature off entirely is a code change and a deploy", while the rollout section
> asserted a one-`UPDATE` kill switch and *assumed* a max of 60 that nothing set. **60 ships.** The
> rollback table, the console helper (C19) and the coercion test all say 60.

| Stored value | `cardsPerSeries` | `railDates` | `indexedOccurrences` |
|---|---|---|---|
| row absent (the normal state) | 1 | 5 | 2 |
| `''`, `not json at all`, `null`, `"5"`, `[1,2]` | 1 | 5 | 2 |
| `{"cardsPerSeries":2}` | 2 | 5 | 2 |
| `{"cardsPerSeries":0,"railDates":0,"indexedOccurrences":0}` | 1 ⚠️ clamped **up** | 1 | **0** (legal) |
| `{"cardsPerSeries":-4}` | 1 | 5 | 2 |
| `{"cardsPerSeries":99,"railDates":100000,"indexedOccurrences":50}` | **60** | 20 | 10 |
| `{"cardsPerSeries":2.7,"railDates":5.9}` | 2 | 5 | 2 |
| `{"cardsPerSeries":"3","railDates":"8"}` | 3 | 8 | 2 |
| `{"cardsPerSeries":"lots"}` / `null` | 1 | 5 | 2 |
| DB unreachable | 1 | 5 | 2 |

**The failure direction, stated once:** a broken read shows fewer duplicates, never zero events. The
worst outcome of total settings failure is the product's own recommended behaviour.

Notes an implementer must not "improve" away:

| Detail | Why |
|---|---|
| `import 'server-only'` | The create form is a client component. This turns an accidental client import into a build error instead of a leaked service-role path. `vitest.config.ts:16-26` stubs `server-only` |
| Defaults **imported** from `lib/events/series.ts` | Copying the literals creates the exact two-source drift the repo keeps failing on |
| `saveSeriesDisplayConfig` returns the **stored** value | An operator who types `99` sees `60` and learns the range instead of believing the 99 |
| No audit ledger | `platform_flag_events` is boolean-only. Matches `vera_autonomy`. Note the gap in ADR-897; do not build a parallel ledger |

### 7.3 Consumer wiring (this is where the draft failed, so it is spelled out)

🔴 In the draft, **nothing read `cardsPerSeries` or `railDates`**: §4 assigned the wiring to §2 and §3,
§2 called the fold with no options at all, and §3 used a local `SERIES_RAIL_DATES_FALLBACK = 5`. The
console would have written a row nobody read, and the kill switch would have been inoperative.

| Consumer | Reads | Owner | Guard assertion |
|---|---|---|---|
| `getEventsIndexData` | `cardsPerSeries` once at the top | step 14 | `index-data.ts` contains `getSeriesDisplayConfig(` and `perSeries` |
| Circle block loader (the caller of `selectUpcomingForCircle`) | `cardsPerSeries`, passed **as an argument** so the pure module stays pure | step 15 | `circle-events.tsx` contains `getSeriesDisplayConfig(` |
| `UpcomingEventsWidget`, both `EventsPanel` branches | `cardsPerSeries` | steps 13, 16 | both files |
| `listEventsForSpace` callers | `cardsPerSeries` → `perSeries` | step 17 | the three call sites |
| Both search readers | `cardsPerSeries` | step 18 | both files |
| `getPublicEvents` callers | `cardsPerSeries` threaded from the async caller | step 22 | `lib/discover.ts` |
| Series page `loadSeriesView` | `railDates`, resolved inside the existing `Promise.all` | step 28 | `app/(main)/events/[slug]/page.tsx` contains `getSeriesDisplayConfig(` and **not** `SERIES_RAIL_DATES_FALLBACK` |
| Create + edit forms | `railDates` → `seriesPreviewCount` | step 42 | both server pages |
| `generateMetadata` (both event pages) + `app/sitemap.ts` | `indexedOccurrences` | steps 36-38 | `series-seo.test.ts` |

Four rules for every consumer:

1. 🔴 Never call `getSeriesDisplayConfig()` from a client component. It is `server-only`.
2. 🔴 Never call it from inside `lib/events/series.ts`. The fold is pure and import-free by design.
3. ⚠️ Read it **once per surface**, at the top of the loader, never per row.
4. ⚠️ A statically rendered page picks the new number up on its next render, not instantly. The save
   action's `revalidatePath('/', 'layout')` purges it; the runbook says so.

### 7.4 The operator console

**MENU-CONTRACT verdict: nothing enters the menu.** `/admin/events` is already a Studio leaf
(`lib/nav/studio.ts:192`) and `ADMIN_GROUPS` derives from `STUDIO_LEAVES`. Adding a fourth
`<AdminSection>` to a page that already has three is a content edit inside a registered destination.
🔴 Never name a constant `SERIES_MODULES`: `scripts/check-menu.mjs:29-38` fails the build on a
`const X_MODULES = [` outside the three allowlisted catalogs.

A dedicated `/admin/events-series` page was rejected and the rejection is recorded in the ADR: it would
need a new `STUDIO_LEAVES` row plus a full `ADMIN_MODULES` row, and three integers do not earn a
destination an operator has to find.

Three files: `series-actions.ts` (server action, `requireAdmin('janitor')` then
`revalidatePath('/', 'layout')`), `series-display-section.tsx` (client form, three number inputs), and
three edits to `app/(main)/admin/events/page.tsx` (import, `await getSeriesDisplayConfig()`, mount behind
the existing `canManage` at `:27`).

⚠️ `revalidatePath('/', 'layout')` is a full-site purge. It is correct here (the knob genuinely reaches
every surface) and matches `setNextStepsEnabled` (`app/(main)/admin/onboarding-controls/actions.ts:17`).
Verified signature:
`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md:22,:39,:169`.
Do not add it to any hotter path.

⚠️ `/admin/events` admits community host and community staff, but these numbers are **platform-wide**,
so the section renders behind `isJanitor` **and** the action re-gates on `requireAdmin('janitor')`. The
chrome decides what renders; the action is the law.

### 7.5 SEO: `lib/events/series-seo.ts` (new, `server-only`)

Everything crawler-facing reads from here, under **one gate written once**:
`visibility='public' AND status='published' AND is_cancelled=false AND removed_at IS NULL AND upcoming`.
That is deliberately stricter than `public_events`, which fixes D2 on the crawl path without touching a
`SECURITY DEFINER` `WHERE` clause.

```ts
export const SITEMAP_EVENT_ROW_CAP = 2000
export const seriesSeoFacts: (slug: string, row?: PrefetchedRow) => Promise<SeriesSeoFacts>
export function seriesRobots(facts, indexedOccurrences): { index: false; follow: true } | undefined  // PURE
export function suppressPastNoindex(facts): boolean                                                  // PURE
export async function listSitemapEventEntries(opts: { occurrences: number; limit?: number }): Promise<SitemapEventEntry[]>
export async function countUpcomingPublicSeries(): Promise<number | null>
```

**Two corrections to the draft, both verified:**

1. 🔴 **The one-off branch never fires.** `supabase/migrations/20240208000000_event_recurrence.sql:22`
   declares `recurrence_type text NOT NULL DEFAULT 'none'`, so a one-off's value is the **truthy string
   `'none'`**, not null. `!anchor.recurrence_type` is always false and every ordinary one-off would be
   emitted with `isSeriesHome: true` and `priority: 0.7`. **Fix:** branch on
   `!isSeriesCadence(anchor.recurrence_type)`, using the predicate exported from `lib/events/series.ts`,
   in both `listSitemapEventEntries` and `seriesSeoFacts`.
2. ⚠️ **Per-request query budget on the hottest public page.** `generateMetadata` would have called
   `seriesSeoFacts(slug)` (1 row read + up to 2 `count: exact` reads) **plus** `getSeriesDisplayConfig()`
   on every event page including one-offs, on **both** `/events/[slug]` and `/discover/events/[slug]`,
   while §3 independently added `loadSeriesView` and the OG route added `nextPublicOccurrence`. **Fix:**
   (a) `seriesSeoFacts` accepts the row `generateMetadata` already fetched and **short-circuits a one-off
   before any read**; (b) `seriesLive` is derived from `nextPublicOccurrence(seriesKey)`, deleting the
   second count query; (c) a TTFB comparison against `main` for a one-off and for occurrence 3 is a
   named acceptance row, with a budget of no more than one additional round trip for a one-off.

**Robots rules.**

| Page | Directive |
|---|---|
| One-off | unchanged |
| Series home (the anchor) | 🔴 **Never** noindexed by the series rule, and `suppressPastNoindex` cancels the page's existing "this event has ended" noindex while any date is still ahead. This is D1, the inversion the whole effort exists to fix |
| Occurrence ordinal ≤ `indexedOccurrences` | unchanged, indexable, self-canonical |
| Occurrence beyond it | `robots: { index: false, follow: true }`. The page stays live, RSVP-able and self-canonical, and keeps passing links (including the visible `Part of {title}` back-link) to the series home |

🔴 **The occurrence must NOT canonicalise to the series page.** `rel=canonical` tells Google the URL is a
duplicate that should not rank, which would delete the "the next dates are indexed" half of this design
and weaken pages with their own real roster. Self-canonical + `noindex, follow` is the pairing the page
already uses for past events. Pinned by a test.

**API verification.** Next 16.2.10.
`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md`: `robots` as an
object at line 551; "metadata with nested fields such as `openGraph` and `robots` defined in an earlier
segment are overwritten by the last segment to define them" at line 1324, so a page's `robots` fully
replaces the `(main)` layout's. ✅ No new API. No `app/robots.ts` change: it is path-prefix only and
cannot express "the third occurrence onward", and a `Disallow` there would stop a crawler reading the
`noindex` it needs to see.

**Sitemap effect** with `indexedOccurrences = 2`:

| Series | URLs before | URLs after |
|---|---|---|
| daily | ~61 (+61 images) | 3 (+3) |
| weekly | ~9 | 3 |
| monthly | ~2-3 | 2-3 |
| one-off | 1 | 1 |

⚠️ `pnpm check:seo` neither rejects nor protects this: `scripts/check-seo.mjs:140-149` parses only
literal `` `${SITE_URL}/...` `` strings and its character class stops at the first `$`, so every
interpolated event entry is invisible to it. That is exactly why the vitest source-shape guard exists.

**Structured data.** ✅ Ships now: the series home's JSON-LD `startDate` and the OG image both come from
`seriesView.next` (a real row), not the anchor's own past date (D4). `ends_at` drops to `null` because
the occurrence's end is not carried on `SeriesDate` and a mismatched end is worse than an absent one;
`eventSchema` already omits `endDate` when null. ⏳ **Holds:** `eventSchedule` / `Schedule`. Whether
Google honours it, and whether `exceptDate` is read, could not be verified (`developers.google.com` and
`schema.org` both return 403 through the agent proxy). It ships only after a human runs the Rich Results
Test, as a **sibling** builder `withEventSchedule(node, series)` in `lib/jsonld.ts`, never a branch
inside `eventSchema` (which `lib/jsonld.test.ts` pins key by key). `subEvent` / `EventSeries` is rejected
outright: it inlines N full `Event` nodes into one document, re-creating the duplication inside a single
payload.

Free with §2: both `ItemList` builders (`eventsListingSchema`, `eventListSchema`) take whatever row list
the surface already has, so the JSON-LD collapses with **zero** signature change once the read edge
folds. Pinned by a test rather than trusted.

**`/llms.txt`.** One line changes meaning, no line changes wording: replace the fourth `headCount(...)`
with `countUpcomingPublicSeries()`. The rendered string
(`- Upcoming Events: N public gatherings you can show up to.`) is unchanged and now true.

### 7.6 Embeddings: the order is the whole safety story

| Step | Change | If it ships alone |
|---|---|---|
| **E1** | `lib/events/matching.ts` looks vectors up by `seriesKey` and fans them back out | ✅ Safe alone. Behaviour identical today, correct after E2 |
| **E2** | `backfillEventEmbeddings` embeds anchors only (`.is('parent_event_id', null)`) and gains `status='published'` | 🔴 Without E1: **every occurrence's interest score silently drops to zero.** No error, no log |
| **E3** | `scripts/adr-893-prune-occurrence-embeddings.sql` | 🔴 Without E1: same failure, immediately, for every existing series |

Every occurrence has byte-identical embedding source text (`buildEventText` is title + description +
category + energy_tag, with **no date**), so the index carries one vector per series on the anchor id.
E1 **must** ship, deploy and be verified (Q13) before E2. The prune is a `scripts/*.sql`, not a
migration, matching `scripts/adr-884-backfill-recurrence-drift.sql`.

🔴 **One real gap E2 creates:** an anchor whose own `starts_at` has passed is excluded by
`.gte('starts_at', now)`, so a long-running series stops being re-embedded. It keeps the vector it has
(nothing deletes it), so scoring is unaffected; it goes stale only if the host renames the event.
Accepted for v1, recorded in the ADR consequences, fix named as a follow-up. Do **not** widen the gate
silently.

### 7.7 Documentation routing (per `docs/DOCS-PROTOCOL.md`)

| Audience | Home | What |
|---|---|---|
| Engineers | git | **ADR-897** in `docs/DECISIONS.md`; `EVENTS-CALENDAR.md` §3 (EC4) + §4; `EVENTS-SYSTEM.md` §2 Reuse-vs-Build row + Implementation log; **`DATABASE.md`** `public_events` / `public_organizer_events` entries (the draft wrongly said "nothing"); `NAMING.md` |
| Members | `content/help/` + `CHANGELOG.md` | `content/help/groups/events.md` bullet + one `## [Unreleased]` line. ⚠️ `check:canon` scans this path: no em dashes, no GFM tables |
| Operators / hosts | Notion training DB | **One new page.** Searched `collection://96c71490-1114-4c73-9547-88b5140126ed`: there is no Events subject page today. Title `Events: repeating events (series and dates)`, Source of truth `docs/EVENTS-CALENDAR.md §3 + §4, docs/DECISIONS.md ADR-897`. No code, no changelog, no schema |
| `DEVELOPMENT-MAP.md` | git | Only if Events EC4 is tracked as a build item. Check first |

**🔴 The NAMING row is a blocking gate.** `docs/NAMING.md` contains **zero** occurrences of "series" or
"occurrence", and its header forbids guessing an uncovered term. ADR-892 exists because two vocabularies
shipped at once. The draft shipped four words for the same object in one PR ("series", "recurring
gatherings", "a repeating gathering", "Repeating events"), with only two of the four gated on the ruling.

> **Ruling: the member noun is `series`, and every string in this plan uses it.** The help bullet and the
> changelog bullet are rewritten to match. No string in §6.5, §6.4, §8 or §7.4 merges before the owner
> rules the row. Proposed row, for insertion after the "Events: Cohosts vs Collaborators" block
> (`NAMING.md:282-335`):
>
> - **series** (lowercase common noun) = a repeating event and all the dates it lands on. Member copy
>   says "series". Never "recurring series" (redundant), never capitalised "Series" (not a proper noun,
>   and it would collide with the Quest nouns), never "recurrence" in member copy.
> - **date** = one instance a member can RSVP to. Member copy says "date".
> - **occurrence** and **anchor** are the INTERNAL nouns: schema (`parent_event_id`), code, ADRs, docs.
>   An operator surface may say "occurrence"; a member surface never does.
> - Collision guard: "date" here never means a romantic date; "series" never means a Journey, a Program
>   Chapter or a Quest season.

---

## 8. The build sequence

One numbered checklist across every section, in dependency order, each step sized to one commit. Work
top to bottom. **Risk:** 🟢 low · 🟡 medium · 🔴 high.

### Phase 1: inert foundations (nothing calls the fold)

| # | Step | Risk | Verify |
|---|---|---|---|
| 1 | `lib/events/series.ts`: the complete API in §4.1, including `SERIES_COLUMNS`, `SeriesFields`, `SeriesDate`, `CADENCES`/`isSeriesCadence`, `collapseSeriesRows`, `collapseSeriesAroundFloor`, `SERIES_FETCH_CEILING = 240`, `SERIES_WIDE_READ = 500`, `DEFAULT_INDEXED_OCCURRENCES = 2` | 🟢 | `grep -c '^import' lib/events/series.ts` returns 0; `pnpm build` |
| 2 | `lib/events/series.test.ts`: all 36 cases from §4.5, plus the S1.5 source-shape guard | 🟢 | `pnpm test lib/events/series` |
| 3 | `lib/events/series-wiring.test.ts` **part one**: the NEVER block (§5.10) and the RPC agreement block only. No column/fold lists yet, so no vacuity assertion can fail | 🟢 | `pnpm test series-wiring` |
| 4 | `lib/events/wall-time.ts` (`wallFormat` moved verbatim + the three option sets); `event-when-where.tsx` imports it and deletes its local copy | 🟢 | `pnpm test && pnpm build` |
| 5 | `lib/events/recurrence.ts`: add `partOfSeriesLabel`, `moreDatesLabel`, `previewOccurrenceDates` (reusing the private `occurrenceAt` so the month clamp is not copied a third time) + 5 test cases | 🟢 | `pnpm test lib/events/recurrence` |
| 6 | `app/events/[slug]/event.ics/route.ts:71`: replace the local `const isRecurringAnchor` with `isSeriesAnchor` from `lib/events/series.ts`, so the predicate has one home. Add the file to the guard | 🟢 | `pnpm test && pnpm build` |
| 7 | `lib/events/series-config.ts` (§7.2), three numbers, defaults **imported** from step 1 | 🟢 | `pnpm build` |
| 8 | `lib/events/series-config.test.ts`: the coercion table from §7.2 (including `cardsPerSeries: 99 → 60` and `indexedOccurrences: 0 → 0`), plus `DEFAULT_SERIES_DISPLAY` pinned at 1 / 5 / 2 | 🟢 | `pnpm test series-config` |
| 9 | `app/(main)/admin/events/series-actions.ts`: `requireAdmin('janitor')`, `saveSeriesDisplayConfig`, `revalidatePath('/', 'layout')` | 🟡 | `pnpm test series-config` (the authz source-shape guard) |
| 10 | `series-display-section.tsx` + mount it in `app/(main)/admin/events/page.tsx` behind `canManage` | 🟢 | `pnpm check:tokens && pnpm check:headers && pnpm check:menu` |
| 11 | `components/events/event-card.tsx`: `moreDates?: number`, the reconciled chip (§6.5), `aria-hidden` on `<Repeat>`. Optional prop, so no call site breaks | 🟢 | `pnpm test components/events/event-card` |
| 12 | 🔴 **GATE:** raise the `docs/NAMING.md` series/date row (§7.7) for the owner ruling. No member-facing string from this plan merges before it is ruled | 🟢 | owner sign-off recorded in the PR |

### Phase 2: browse wiring (one surface per commit; each lands its columns, its limit and its fold together)

| # | Step | Risk | Verify |
|---|---|---|---|
| 13 | **PROOF: the Channel strip** (`components/events/upcoming-widget.tsx`): `SERIES_COLUMNS`, wall-clock floor, `seriesFetchLimit(3)`, `getSeriesDisplayConfig()`, fold, slice. Verify by hand before writing another line | 🟢 | `pnpm test components/events/upcoming-widget`; §9.2 row B8 |
| 14 | `/events` index (§5.3): four limits, the `dateRangeWindow` fix (D5) + its 17:01-Pacific test, the config read, the full-result fold, the rebuilt Going lane with the extracted `eventComparator`, `moreDates` on `EventsIndexData` | 🟡 | `pnpm test lib/events/index-data`; §9.2 rows B1-B6, C1, C2 |
| 15 | `events-surface.tsx` + `events-for-you.tsx` pass `moreDates` to `<EventCard>` | 🟢 | `pnpm test series-wiring`; §9.2 chip row |
| 16 | Circle block: `lib/events/circle-upcoming.ts` (floor + `perSeries` as arguments, fold before slice, new `hasMore`) + `circle-events.tsx` | 🟢 | `pnpm test lib/events/circle-upcoming` |
| 17 | Rail panels, both branches (`components/sidebar/rail-panels.tsx`) | 🟢 | `pnpm test series-wiring` |
| 18 | Space reader `listEventsForSpace` opt-in + its three browse callers | 🟡 | `pnpm test lib/events/store`; §9.2 row N3 (the regression test) |
| 19 | Search: two reads, `collapseSeriesAroundFloor`, both files (§5.5) | 🟡 | `pnpm test series-wiring`; §9.2 rows B11, B12 |
| 20 | Spotlight, Broadcast, circle map, profile feed, QR picker (`lib/qr/marketing.ts` **with `id` added**) | 🟢 | `pnpm test series-wiring`; §9.2 rows B16, B18, B20, B22, B23 |
| 21 | Column-only surfaces: `lib/quest/next-gathering.ts`, `components/feed/feed-list.tsx` (**both** branches). Inert until the chip renders there | 🟢 | `pnpm build` |
| 22 | `lib/events/matching.ts`: `parent_event_id` on both selects + the default-scope fold. 🔴 **Must precede step 40** | 🟡 | `pnpm test matching` |
| 23 | Migration `20270121000000_public_events_recurrence.sql` (§5.7, drop + create + re-grant, both RPCs) + `docs/DATABASE.md` | 🟡 | `pnpm check:migrations`; apply to a branch DB and confirm no 42P13 |
| 24 | `getPublicEvents` collapses by default; hubs (`app/discover/events/_data.ts`); organizer page (two partitions, past sorted newest-first). **Then complete `series-wiring.test.ts`**: the column, fold, config and chip lists plus their vacuity assertions | 🟡 | `pnpm test series-wiring && pnpm test app/discover/cities/density-gate` |

### Phase 3: the series page

| # | Step | Risk | Verify |
|---|---|---|---|
| 25 | `lib/events/series-dates.ts` (§6.3) + `lib/events/series-dates.test.ts` (gate + slice factored into a pure `selectSeriesDates(rows, opts)`). Server-only, no page wiring yet | 🟡 | `pnpm test lib/events/series-dates && pnpm build` |
| 26 | Extend `lib/events/active-event.ts`: `series: SeriesView \| null`; `seriesHref` / `seriesTitle` / `nextOccurrenceHref` on `EventScheduleData`; re-document `nextOccurrenceIso` as row-backed and series-mode-only. Stamp nulls at the single `setEventContext` call site | 🟢 | `pnpm build` |
| 27 | `detail-template.tsx:116-122`: `max-w-full`, `shrink-0 aria-hidden` on the chevron, `<span className="truncate">` on the label | 🟢 | `pnpm build` |
| 28 | Wire the loader into `app/(main)/events/[slug]/page.tsx`: compute `circleMemberOfThisEvent` **unconditionally** when `circleId != null` and the viewer is signed in (§6.3 rule 4), build `allowedVisibilities`, `const { railDates } = await getSeriesDisplayConfig()`, call `loadSeriesView` inside the existing `Promise.all` at `:496`, compute `seriesMode`, stamp the context. Delete `RECURRENCE_LABEL` (`:96-100`) and the `nextRecurrence` computation (`:794-807`) | 🟡 | `pnpm test app/(main)/events/[slug]/page` (source-shape: no `RECURRENCE_LABEL`, no `nextOccurrence(`, no `SERIES_RAIL_DATES_FALLBACK`) |
| 29 | The back-link + subtitle rework (§6.2, §6.6): `seriesBack` on `DetailTemplate`, `recurrenceLabel` / `partOfSeriesLabel` on the 🔁 line, child branch suppressed when the back-link rendered, when-line retargeted under `seriesMode`, arithmetic `Next:` block deleted | 🟡 | by hand on: live anchor, past anchor of a live series, past anchor of a finished series, child occurrence |
| 30 | `components/widgets/events/event-series-dates.tsx` + the four registration data edits (§6.4). **Then run** `select route, config from page_settings where route like '/events%'` and insert `'event-series-dates'` after `'event-when-where'` in any saved `side.order` | 🟢 | `pnpm test lib/widgets/modules && pnpm check:menu`; new `default-layouts` assertion |
| 31 | 🔴 Series-mode Join pointer: `components/events/series-next-join.tsx`, branch `joinActions`, `showBottomBar = false`. **Highest-risk step**: it changes what a member can do on a page that today offers RSVP and check-in | 🔴 | by hand, all four page states from step 29 |
| 32 | `event-when-where.tsx`: the `Series` FactRow links **only for a child with a readable anchor** (§6.6 ruling); the `Next` FactRow links when `nextOccurrenceHref` is set; `Part of a recurring series` deleted | 🟢 | `pnpm test components/events/event-card`; new anchor-page assertion |
| 33 | `components/widgets/events/event-series-dates.test.ts` source-shape guard: contains `SidebarCard`, `getEventContext(`, `aria-label`; does **not** contain `EntityCard`, `nextOccurrence(`, `use client`, or a `#` hex literal | 🟢 | `pnpm test event-series-dates` |

### Phase 4: crawl and answer engines

| # | Step | Risk | Verify |
|---|---|---|---|
| 34 | `lib/events/series-seo.ts` (§7.5) + `lib/events/series-seo.test.ts` pure half. Uses `isSeriesCadence`, takes an optional prefetched row, derives `seriesLive` from `nextPublicOccurrence` | 🟢 | `pnpm test series-seo` |
| 35 | 🔴 **E1**: `matching.ts` seriesKey fan-out + `matching.test.ts`. **Must precede step 40.** Requires step 22 | 🟡 | `pnpm test matching`; §9.3 Q13 |
| 36 | Robots on `app/(main)/events/[slug]/page.tsx`: both corrections (D1 + the occurrence rule), passing the already-fetched row into `seriesSeoFacts` | 🟡 | `pnpm test series-seo`; §9.3 Q4-Q7 |
| 37 | Robots on `app/discover/events/[slug]/page.tsx` (a canonical is a hint; only the directive keeps the twin out of the index) | 🟢 | §9.3 Q8 |
| 38 | `app/sitemap.ts` moves onto `listSitemapEventEntries` + `getSeriesDisplayConfig`; drop the `getPublicEvents` import; `priority` conditional on `isSeriesHome` | 🟡 | `pnpm test series-seo && pnpm lint`; §9.3 Q1-Q3 |
| 39 | Series-home `startDate` correction: JSON-LD from `seriesView.next`, OG image from `nextPublicOccurrence` (D4) | 🟡 | `pnpm test jsonld`; §9.3 Q4 |
| 40 | 🔴 **E2**: `lib/events/embeddings.ts` anchors only + `status='published'`. **Only after step 35 is deployed and Q13 passes** | 🟡 | §9.3 Q13 again, 24h later |
| 41 | `/llms.txt` counts series | 🟢 | §9.3 Q9 |

### Phase 5: host directions and destructive-copy corrections

| # | Step | Risk | Verify |
|---|---|---|---|
| 42 | `components/events/series-dates-preview.tsx` (client) using `wallClockToIso` / `dateToWallClockIso` from `@/lib/events/datetime`; create-form copy C1-C3 + the end-date line; mount the preview; both server pages pass `seriesPreviewCount={railDates}` | 🟡 | `pnpm test lib/events/recurrence`; by hand: pick Weekly, see five dates |
| 43 | Edit-mode notices: State A gated on the **stored** `initial.recurrenceType`, State B (`parent_event_id` on the edit page select + the anchor lookup + `Open the series` link) | 🟡 | by hand: edit a one-off and switch it to Weekly, confirm no propagation notice |
| 44 | `components/admin/modules/event-settings-module.tsx`: helper copy C9 + label convergence onto the create form's wording (`One-time`, `Every day`, `Weekly`, `Monthly`, `Ends on`). 🔴 The `value` strings are the enum and must not change | 🟡 | `pnpm build`; by hand in the rail |
| 45 | 🔴 **Delete warning correction (D3)** in `app/(main)/events/[slug]/settings/console.tsx:38` + cancel copy C10/C11 with the `seriesRole` prop. **Must land before step 30 makes the anchor easier to reach** | 🟡 | by hand on an anchor and on one date |

### Phase 6: docs

| # | Step | Risk | Verify |
|---|---|---|---|
| 46 | `docs/DECISIONS.md` ADR-897 (Status / Context / Decision / Consequences, house format) | 🟢 | review |
| 47 | `docs/EVENTS-CALENDAR.md` §3 EC4 bullet + §4 three key decisions; `docs/EVENTS-SYSTEM.md` §2 row + Implementation log entry | 🟢 | `pnpm help:drift` |
| 48 | `docs/NAMING.md` row (as ruled at step 12); `content/help/groups/events.md` bullet; `CHANGELOG.md` `## [Unreleased]` line | 🟢 | `pnpm check:canon` |
| 49 | Notion page `Events: repeating events (series and dates)`, Type `Roles & Admin`, Source of truth pointing at `docs/EVENTS-CALENDAR.md` | 🟢 | page created with all three required properties |
| 50 | ⏳ After a human runs the Rich Results Test (§9.3 Q14): `withEventSchedule` in `lib/jsonld.ts`. Sibling function only | 🟡 | `pnpm test jsonld`; Rich Results Test before and after |
| 51 | ⏳ After step 40 has run one full cron day: `scripts/adr-893-prune-occurrence-embeddings.sql`, step 1 (the select) first, read the output, then step 2 | 🟡 | `cron.embed_events` counts fall sharply; Q13 still passes |

**The full gate, run before merge:**

```
pnpm lint && pnpm test && pnpm build && pnpm check:canon && pnpm check:menu && pnpm check:tokens \
  && pnpm check:seo && pnpm check:vocab && pnpm check:migrations && pnpm check:authz && pnpm check:rls \
  && pnpm check:headers
```

---

## 9. Operator runbook and host directions

Written for someone who will not read code. This ships as the Notion training page (step 49).

### 9.1 What these settings do

A repeating event is stored as one row per date. A daily event that runs for two months is about 61
separate events in the database, each with its own page and its own RSVP list. Without a setting, all 61
would show while people browse and nothing else would fit.

| Setting | What it does | Default | Range |
|---|---|---|---|
| Cards per series in browse | How many of a series' dates get a card while people browse | 1 | 1 to 60 |
| Dates listed on a series page | How long the list of upcoming dates is on the event's own page, and how many dates a host sees in the create form preview | 5 | 1 to 20 |
| Dates kept in search | How many dates of a series search engines keep. The series page is always kept | 2 | 0 to 10 |

Calendars, agendas and the downloadable calendar file always show every date and are not affected by any
of these numbers.

### 9.2 Change the numbers

1. Sign in as a janitor. Only janitors see the controls.
2. Go to `/admin/events`.
3. Find the **Display settings** section, then the **Repeating events** group.
4. Set the numbers.
5. Press **Save**. "Saved" appears next to the button.
6. If you typed a number outside the range, it is stored as the nearest allowed number, and the field
   shows what was actually stored after the page refreshes. That is expected.

### 9.3 Verify the change took effect

1. Wait about 10 seconds, then open `/events` in a new tab and reload.
2. Find a repeating event. With the default of 1, you see one card for it, showing the soonest date and
   a note of how many more dates there are.
3. Set **Cards per series in browse** to 2 and save, then reload `/events`. The same series now shows two
   cards, the two soonest dates.
4. Set it back to 1 and save.
5. If the count did not change: some pages are cached and refresh on their own schedule rather than
   instantly. Search results and the sitemap can take up to an hour. Wait a minute and reload once more.
6. Confirm what is stored. In the Supabase SQL editor:
   `select * from platform_settings where key = 'events_series_display';`
   One row with a value like `{"cardsPerSeries":1,"railDates":5,"indexedOccurrences":2}`. **No row at all
   is normal** and means the defaults are in force.

### 9.4 Find a series and all of its dates

1. Open the event page. A repeating event's page lists its upcoming dates, each linking to that date's
   own page.
2. To see every date including past ones, find the anchor first:
   `select id, slug, title, starts_at, recurrence_type, recurrence_until from events where slug = '<the-slug>';`
3. Then list its dates:
   `select id, slug, starts_at, is_cancelled from events where parent_event_id = '<the id from step 2>' order by starts_at;`
4. The row from step 2 is the **anchor**, the original date the host created. Every row from step 3 is
   one date generated from it. A date's web address is the anchor's address with the date on the end,
   for example `/events/monday-sit-2026-08-03`.
5. If step 3 returns nothing for an event that should repeat, the dates have not been generated yet.

### 9.5 Force the dates job to run

Dates are generated by a job that runs once a day at 02:00 UTC (`vercel.json`, path
`/api/cron/event-occurrences`). It keeps the next 60 days filled in. It is safe to run again at any
time: it only adds dates that are missing and never duplicates one.

1. Preferred: in the Vercel dashboard, open **Cron Jobs**, find `/api/cron/event-occurrences`, use
   **Run**. Vercel supplies the authorization itself.
2. From a terminal, using `CRON_SECRET`:
   `curl -i -H "Authorization: Bearer $CRON_SECRET" https://<the site>/api/cron/event-occurrences`
3. A good run answers `200` with a body like `{"ok":true,"anchorCount":12,"occurrencesCreated":34}`.
   `occurrencesCreated: 0` means everything was already filled in, which is also a good result.
4. A `401` means the secret is wrong or missing. Do not disable the check; get the right secret.

### 9.6 Roll back

| What you want to undo | Steps |
|---|---|
| A number you just changed | Go back to `/admin/events`, type the previous number, press **Save** |
| Back to the shipped defaults | Set 1, 5 and 2, press **Save**. Same as no configuration at all |
| A value in a bad state | `delete from platform_settings where key = 'events_series_display';` The product falls straight back to 1, 5 and 2. No restart, no deploy |
| **Turn the collapse off entirely** | Set **Cards per series in browse** to **60**. Every date shows as its own card again, exactly as before this work. Browse changes on the next request; search takes up to an hour |

⚠️ Two things this runbook deliberately does not offer, because the product does not do them yet: there
is no way to cancel every remaining date of a series in one action, and there is no per-event override of
these numbers. Both are named as follow-ups in ADR-897.

### 9.7 Host directions: what a host is told, and where

Today a host who picks "Weekly" learns one thing: *"The next 60 days of dates show right away. A daily
job rolls the window forward."* That sentence describes the cron. It says nothing about what a member
will see, nothing about what an edit does to the dates already made, and nothing about what cancelling
cancels. All three are traps, and the third currently has copy that states the opposite of what the code
does.

| # | Where | String |
|---|---|---|
| C1 | Create form | `Every date gets its own page and its own RSVP list.` |
| C2 | Create form | `While people browse, your series shows as one card with the next date on it, so it does not crowd out other events.` |
| C3 | Create form | `Dates for the next 60 days are made right away. More are added each day as time passes.` |
| C3b | Under "Ends on" | `Dates run up to, but not including, the end date.` |
| C4 | Preview heading | `The first dates` |
| C5 | Preview footer, open-ended | `It keeps going from there. Set an end date above to stop it.` |
| C6 | Preview footer, bounded | `That is every date in this series.` |
| C7 | Edit form, existing anchor only | `Saving updates this event and every date still to come. Dates that already happened keep what they had.` |
| C8 | Edit form, one date | `This is one date in {title}. Saving changes this date only.` + link `Open the series` |
| C9 | Settings module helper | `Every date gets its own page and its own RSVP list. While people browse, the series shows as one card with the next date on it. Saving updates this event and every date still to come.` |
| C10 | Cancel modal, anchor | `This marks this date of {title} as cancelled. The dates already on the calendar stay live, and no new dates are added. To cancel a date that is still to come, open that date and cancel it there. You can't undo this from here.` |
| C11 | Cancel modal, one date | `This marks this date of {title} as cancelled. The rest of the series stays live. You can't undo this from here.` |
| C12 | Delete warning, anchor | `Permanently removes this event and every other date in the series. RSVPs and check-ins for all of them are cleared. Once deleted it cannot be recovered.` |
| C13 | Delete warning, one date | `Permanently removes this date. Its RSVPs and check-ins are cleared. The other dates in the series stay. Once deleted it cannot be recovered.` |
| C14 | Admin section title | `Display settings` |
| C15 | Admin section description | `Platform-wide. How repeating events show up everywhere members browse.` |
| C16 | Admin group title | `Repeating events` |
| C17 | Admin group description | `A repeating event is stored as one row per date. These three numbers decide how much room one series takes up when members browse, how many upcoming dates its page lists, and how many dates search engines keep.` |
| C18 | Field label | `Cards per series in browse` |
| C19 | Field helper | `1 to 60. One card is the default. On the events page the card shows the next date and how many more there are. Set 60 to show every date again.` |
| C20 | Field label | `Dates listed on a series page` |
| C21 | Field helper | `1 to 20. Each date links to its own page, where people RSVP. Hosts see this many dates in the preview when they set up a repeating event.` |
| C22 | Field label | `Dates kept in search` |
| C23 | Field helper | `How many dates of a series search engines keep. The series page is always kept. Set 0 to keep only the series page.` |
| C24 | Admin footer note | `A number outside the range saves as the nearest one allowed. Calendars, agendas and the .ics feed always show every date, whatever these are set to.` |

**Member-facing strings** (from the rail, the card and the series page): `More dates` ·
`Showing the next 5.` · `Add every date to your calendar` · `This series has finished.` ·
`The last date was Sat, Aug 30.` · `Part of Thursday Sound Bath` · `Part of a series` ·
`Repeats weekly · 8 more dates` · `Repeats weekly · 1 more date` · `Next date` · `Go to Thu, Jul 30` ·
`Each date has its own page. RSVP on the date you want.` ·
`Next date: Thursday, July 30, 2026 at 7:00 PM PDT`.

**Help centre bullet** (`content/help/groups/events.md`, no em dashes, no GFM tables):

```
- Many Circles run repeating gatherings (a weekly sit, a monthly walk). While you browse, a repeating
  event shows as **one card** with its next date, so it does not crowd out everything else. Open it and
  you get the series' upcoming dates, and each date has its own page and its own RSVP.
```

**CHANGELOG bullet** (`## [Unreleased]` → `### Added`):

```
- Repeating events now show as one card while you browse, with their next date and a list of the dates
  still to come. Every date still has its own page and its own RSVP.
```

**CONTENT-VOICE §10 self-check on the whole set.** Reader is the Latent Leader (host) for C1-C13 and the
operator for C14-C24. Every claim is checkable in the product ("its own page", "next 60 days", "1 to
60"), so the skeptic test passes. No feelings are narrated, no vibe verbs, concrete numbers appear where
a number exists, ✅ zero em dashes, zero exclamation points, sentence case throughout, no health claims.
Proper nouns do no work here and none are invented. 🔴 Gated on the NAMING ruling (step 12).

---

## 10. Test matrix

| Layer | Proves | File | Command |
|---|---|---|---|
| Pure fold (A, B) | `seriesKey`, election, the floor, the date list, `seriesFetchLimit`, the falsy-id guard. 36 cases | `lib/events/series.test.ts` | `pnpm test lib/events/series` |
| Series read seam | `loadSeriesView` gating, private anchor, `circle_only` scope mismatch, draft/cancelled/removed exclusion, viewed row excluded, `totalUpcoming` before slice, the 19:00-today case, `+00:00` vs `Z`, `railDates: 0` | `lib/events/series-dates.test.ts` | `pnpm test lib/events/series-dates` |
| Surface wiring (C, D, E) | Every browse read selects the columns, calls the fold and reads the config; the chip is passed; calendar and operator surfaces do not fold; the `/events` order; the search and organizer past-ordering; the Space reader default | `lib/events/series-wiring.test.ts` | `pnpm test series-wiring` |
| Controls (A) | The coercion table, including `99 → 60` and `indexedOccurrences: 0`; the authz source-shape guard on the action; the detail page reads `railDates` and has no fallback const | `lib/events/series-config.test.ts` | `pnpm test series-config` |
| SEO, pure (A) | `seriesRobots` and `suppressPastNoindex` across the full truth table | `lib/events/series-seo.test.ts` | `pnpm test series-seo` |
| SEO, source shape (C) | The sitemap calls `listSitemapEventEntries` and no longer calls `getPublicEvents`; both event pages call `seriesRobots`; the occurrence stays self-canonical; `llms.txt` counts series; the stricter gate is present | `lib/events/series-seo.test.ts` | `pnpm test series-seo` |
| One-number rule (E) | A **repo-wide walk** of `app/` and `lib/` asserting no file other than `lib/events/series.ts` and `lib/events/series-config.ts` declares a `*INDEXED_OCCURRENCES*` constant, with a vacuity assertion on the walked file count. (The draft's `match(/indexedOccurrences:/g).length > 1` asserted the opposite of its own name and would pass on almost any file) | `lib/events/series-seo.test.ts` | `pnpm test series-seo` |
| JSON-LD (A) | `eventsListingSchema` emits one `ListItem` per series when fed a collapsed list; `eventSchema`'s keys are untouched | `lib/jsonld.test.ts` | `pnpm test jsonld` |
| Embeddings (A) | The seriesKey fan-out maps one anchor vector onto every occurrence; an orphan child with no anchor vector scores 0 rather than throwing | `lib/events/matching.test.ts` | `pnpm test matching` |
| Card (C) | The file contains `moreDates` and `recurrenceLabel(`, not `Part of a recurring series`; the anchor page renders `Repeats weekly` and no self-link | `components/events/event-card.test.ts` | `pnpm test event-card` |
| Rail (C) | Contains `SidebarCard`, `getEventContext(`, `aria-label`; not `EntityCard`, `nextOccurrence(`, `use client`, or a hex literal | `components/widgets/events/event-series-dates.test.ts` | `pnpm test event-series-dates` |
| Layout (D) | `'/events/*'.slots.side.order` contains `'event-series-dates'` | `lib/page-settings/default-layouts.test.ts` | `pnpm test default-layouts` |
| Recurrence preview (A, B) | Monthly clamp Jan 31 → Feb 28 → Mar 31; `recurrence_until` exclusivity; count clamped at 1 and 20; `'none'` returns empty; a `datetime-local` value **with** seconds parses | `lib/events/recurrence.test.ts` | `pnpm test lib/events/recurrence` |

### 10.1 Manual QA, browse

**Fixture.** As a Host, create one event titled `Morning sit`, set Repeats to `Every day`, leave the end
date blank, publish it, and run `GET /api/cron/event-occurrences` so ~60 rows exist. Do it on a Circle
you belong to, in a Space you own, with visibility `Anyone`. Then create two ordinary one-off events on
the next two days, **and one 45 days out**, so the horizon-truncation case (§2.3) is testable.

| # | URL | Before | After |
|---|---|---|---|
| B1-B4 | `/events` | ~60 `Morning sit` cards; "Upcoming" reads ~62 | One card in date order among the one-offs; the stat reads 4 |
| chip | same | no chip | `Part of a series · 59 more dates` on the `Morning sit` card |
| C1 | `/events?date=weekend` | 60 cards, or none | One card whose date line names **Saturday**, not today. ⚠️ Run this before and after 5pm Pacific: it fails before step 14 |
| C2 | `/events?spots=1` | Every occurrence judged on its own capacity | One card, judged on the date it shows |
| C3 | `/events?sort=popularity` | 60 cards | One card, ranked on its earliest in-window date (the accepted `SERIES-RANK` tradeoff) |
| B5 | `/events` "For you" lane | All four slots `Morning sit` | Four different events |
| B6 | `/events` map toggle | 60 markers on one point | One marker |
| Going | `/events` Going lane | n/a | RSVP to the third occurrence, reload: **that exact date** still appears, and only that date, in the sort you chose |
| B7 | `/circles/<circle>` | Five `Morning sit` rows, "See all events" permanently lit | `Morning sit` once, then the one-offs. ⚠️ The 45-day one-off may not appear: the read is truncated at 50 rows. That is §2.3, and "See all events" must still be lit |
| B8 | `/channels/<channel>` | Three `Morning sit` | `Morning sit` plus two other events |
| B9-B10 | any page with the right rail | Three `Morning sit` | Three different events |
| B11 | `/search?q=morning&tab=events` | Twenty rows, oldest first from the beginning of time | One upcoming row, then past series once each |
| B12 | ⌘K, `morning` | Six rows | One |
| B13-B15 | `/spaces/<space>` | Six-card "Upcoming sessions", eight-item CTA picker | One `Morning sit` plus real siblings |
| B16, B18, B20, B22, B23 | Spotlight, `/broadcast`, circle map, QR picker, a profile feed | 5 / 5 / 10 / 50 / 5 identical rows | One each |
| P1 | `/discover/events` (signed out) | ~50 cards, 50 `Event` nodes in the JSON-LD | One card, one `Event` node |
| P2, P4, P5 | `/discover`, `/discover/cities/<city>`, a city × category hub | inflated | counts a human would recognise |
| P6 | `/discover/events/organizer/<handle>` | 60 upcoming rows, other events pushed out | One upcoming row **plus the host's other events**; the past list shows the most recent finished date once |
| 🔴 N1 | `/events/calendar` | every date | **Still every date** |
| 🔴 N3 | `/spaces/<space>/settings/calendar` | every date | **Still every date.** The regression test for the opt-in default |
| 🔴 N5 | `/events/<slug>/event.ics` | one VEVENT + RRULE | **Unchanged** |
| 🔴 N8 | `/admin/events` | every occurrence | **Still every occurrence** |
| perf | `/events` and `/events/<one-off-slug>` | baseline on `main` | TTFB within a couple of hundred ms; **no more than one additional round trip for a one-off event page** |

### 10.2 Manual QA, crawl and controls

| # | Do this | Expect |
|---|---|---|
| Q1 | `curl -s localhost:3000/sitemap.xml \| grep -c 'morning-sit'` | `3` (series home + 2), not ~61 |
| Q2 | Same, grep `opengraph-image` | 3 image entries |
| Q3 | Create a **private** upcoming event, re-fetch | Its slug is **absent**. Before, it was present and its page answered noindex |
| Q4 | View source of `/events/morning-sit` signed out | No `robots` meta, canonical `/events/morning-sit`, JSON-LD `startDate` is the **next live date** |
| Q5 | Edit the anchor's `starts_at` back a week in SQL, reload | Still no `noindex`. Before, it went `noindex, follow` (D1) |
| Q6 / Q7 | View source of occurrence 2, then occurrence 3 | 2: indexable, self-canonical. 3: `noindex, follow`, self-canonical, with a real `<a>` reading `Part of Morning sit` |
| Q8 | `/discover/events/morning-sit-<d3>` | Same `noindex, follow` |
| Q9 | `/llms.txt` | "Upcoming Events" counts the series once |
| Q10 | Set **Dates kept in search** to `0`, hard-reload | Sitemap has 1 morning-sit URL; occurrence 1 answers `noindex, follow` |
| Q10b | Set **Cards per series in browse** to `2`, reload `/events` | **Two** cards for the fixture series. If it stays at one, the config is not wired (the draft's headline failure) |
| Q11 | Set **Dates kept in search** to `5`, reload | Sitemap has 6; occurrence 3 is indexable again. **No deploy happened** |
| Q12 | `update platform_settings set value = 'garbage' where key = 'events_series_display';` | Everything falls back to 1 / 5 / 2. Nothing 500s |
| Q13 | Signed in, `/events` "For you" with an embedded viewer | The lane still scores `Morning sit`. If it vanished, E2 shipped before E1 |
| Q14 | Google Rich Results Test on the deployed series URL | ⏳ **Phase 6 gate for step 50.** Valid `Event`. Run again after `withEventSchedule` |
| Q15 | Search Console → Pages, one week after Phase 4 | "Submitted URL marked noindex" trending **down** |

---

## 11. Risk register

| # | Risk | Likelihood | Impact | Mitigation | Step |
|---|---|---|---|---|---|
| R1 | E2 ships before E1: every occurrence's interest score silently goes to zero, no error, no log | 🟡 | 🔴 | Ordering enforced in the checklist (35 → deploy → Q13 → 40); `matching.test.ts` pins the fan-out; the ADR states the order | 35, 40 |
| R2 | The sitemap advertises more occurrences than the pages leave indexable | 🟡 | 🟡 | One config field feeds both readers; the repo-wide "exactly one home" walk | 34, 38 |
| R3 | A browse read folds rows whose SELECT lacks `parent_event_id` or `id`: no error, no fold, looks wired | 🔴 | 🟡 | The drift guard; columns + fold in the same commit; the falsy-id pass-through (case 26) | 24 |
| R4 | Someone canonicalises occurrences to the series page | 🟡 | 🔴 | A test asserts `canonical: '/events/${slug}'`; rejected explicitly in ADR-897 | 36 |
| R5 | `eventSchedule` is not honoured or triggers a Rich Results warning | 🟡 | 🟡 | Step 50 is gated on Q14 and is a sibling pure function; `eventSchema` untouched | 50 |
| R6 | The series home publishes a past `startDate` | 🔴 today | 🟡 | `startDate` from the next live occurrence row | 39 |
| R7 | The series home is noindexed a week after it starts (D1) | 🔴 today | 🔴 | `suppressPastNoindex`. This is the inversion the effort exists to fix | 36 |
| R8 | Small blocks show exactly one card because the `LIMIT` lands before the fold | 🔴 without over-fetch | 🔴 | `seriesFetchLimit()` at every read; verified by hand at B7, B8, B9 | 13, 16, 17 |
| R9 | The browse horizon silently truncates to ~30 days on a 3-slot block | 🔴 | 🟡 | Stated in §2.3; `hasMore` never hides the escape hatch; the 45-day fixture row; `SERIES-PD` named | 16, §2.3 |
| R10 | Collapsing "to the anchor" deletes long-running series from the index | 🟡 | 🔴 | `seriesKey` + earliest-present election, and the same rule in the sitemap's anchorless branch | 1, 34 |
| R11 | Fetching siblings inside the fold bypasses the caller's visibility gate | 🟡 | 🔴 | The fold has zero imports and cannot query; sibling reads live only in `series-dates.ts`, which re-applies the gate | 1, 25 |
| R12 | A collapsed card or the series page offers a series-level RSVP | 🟡 | 🔴 | No series-level rsvp, capacity or ticket type exists; series mode points at the next occurrence page | 31 |
| R13 | Junk in `platform_settings` blanks browse or the index | 🟡 | 🔴 | `coerceSeriesDisplay` clamps and never throws; `cardsPerSeries` clamps **up** from 0 | 8 |
| R14 | An operator changes a number and sees nothing change | 🔴 | 🟢 | `revalidatePath('/', 'layout')`; the runbook states the crawl side takes up to an hour | 9, §9.3 |
| R15 | `/admin/events` admits host and staff, but these knobs are platform-wide | 🟡 | 🟡 | Section behind `isJanitor`, action re-gated on `requireAdmin('janitor')` | 9, 10 |
| R16 | The migration is written as `create or replace` and fails with 42P13 in prod | 🔴 | 🟡 | Drop + create + re-grant, spelled out; the precedent's own comment is quoted | 23 |
| R17 | The rail lands at the bottom of the MAIN column on a community with a saved `/events/*` layout | 🟡 | 🟡 | The `page_settings` verification query in step 30; the fallback stated in §6.4; `SERIES-MAIN` named | 30 |
| R18 | A member of the hosting circle sees none of a series' members-only dates on a public occurrence | 🟡 | 🟡 | `circleMemberOfThisEvent` computed unconditionally (§6.3 rule 4), not hoisted from a branch that never runs | 28 |
| R19 | `public_events`' missing visibility gate stays broken on the six discover callers | 🔴 | 🟡 | ⚠️ **Out of scope.** The crawl path is fixed by reading through `series-seo.ts`. Follow-up named; do not widen a `SECURITY DEFINER` `WHERE` inside a display change | follow-up |
| R20 | Roughly nine operator dashboards keep counting occurrence rows and overstate by ~60x | 🔴 | 🟢 | A row fold cannot fix a head count. Named in the ADR consequences and in §5.9 | follow-up |
| R21 | A long-running series stops being re-embedded once its anchor ages out | 🔴 | 🟢 | The existing vector survives, so scoring is unaffected; only a post-rename refresh is lost | 40 |
| R22 | Someone moves the series page to `/events/<slug>/dates` | 🟢 | 🔴 | `isAnonPublicEvent` 307s any sub-route to `/` for a signed-out crawler; `lib/nav/public-detail-routes.test.ts` fails; ADR decision 5 forbids it | ADR-897 |
| R23 | New member-facing copy uses "series" before the canon row is ruled | 🟡 | 🟡 | Step 12 is a blocking gate on every string in §9.7. ADR-892 exists because two vocabularies shipped at once | 12 |
| R24 | An em dash or off-canon noun in a new in-app string | 🟡 | 🟡 | 🔴 **No CI gate reads in-app strings** (`check:canon` covers `content/**/*.md` only). The §10 review of §9.7 is the whole defence | review |
| R25 | Migration version `20270121000000` collides with a parallel branch | 🟢 | 🟡 | `check:migrations` fails loudly. Bump by `+000100` | 23 |
| R26 | Deleting an anchor cascades to every date and every RSVP while the confirm copy says the opposite (D3) | 🟡 | 🔴 | Step 45 corrects it and **must land before step 30** makes the anchor easier to reach | 45 |
| R27 | Cancelling the anchor leaves up to 60 live, RSVP-able dates, which hosts do not expect | 🔴 | 🟡 | C10 tells the host exactly what cancelling does. A series-wide cancel action does not exist and is a named follow-up | 45 |
| R28 | The event detail page gains several reads on the hottest public route | 🟡 | 🟡 | One-off short-circuit before any read; `seriesLive` derived from `nextPublicOccurrence`; a TTFB acceptance row with a stated budget | 34, 36 |

### 11.1 Named follow-ups

| Tag | What | Why deferred |
|---|---|---|
| `SERIES-PD` | SQL `DISTINCT ON (coalesce(parent_event_id, id))` push-down so the `LIMIT` counts series | Needs a functional index and turns each surface into an RPC or view, each a new leak-contract surface. The JS fold stays the authority either way |
| `SERIES-RANK` | Represent a series by its best-ranked occurrence under popularity / relevance / distance | Adds a second ordering branch to the busiest page for a marginal gain (§4.4) |
| `SERIES-COUNT` | A series-aware count helper for the ~9 inflated operator dashboards and `lib/spaces/discovery.ts` | A row fold cannot fix a head count; `parent_event_id IS NULL` as a quick fix is the bug this plan exists to avoid |
| `SERIES-PIN` | "and N more dates" in the map pin popup | One line at `index-data.ts:669-691`, after the chip proves out |
| `SERIES-MAIN` | A MAIN-safe rendering of the date rail (`SectionHeader` + list) | Only matters for communities with a saved `/events/*` layout (§6.4) |
| `SERIES-PICKER` | A grouped destination picker for `/admin/qr` and the circle-manage attachable list | Operator surfaces need the specific date, so the browse fold is wrong for them |
| `SERIES-CANCEL` | "Cancel every date still to come" | No such action exists today; the copy points at the honest workaround (set an end date) |
| `SERIES-EMBED` | Re-embed an anchor that has aged out of `starts_at >= now()` | Needs an `OR "has an upcoming child"`; do not widen the gate silently |

---

## 12. Open questions requiring a human decision

| # | Question | Recommendation |
|---|---|---|
| 1 | 🔴 **Rule the `docs/NAMING.md` series/date row** (§7.7). Every member-facing string is blocked on it | Ratify as drafted: member noun `series`, instance noun `date`, `occurrence`/`anchor` internal only |
| 2 | ⏳ **Does `eventSchedule` ship?** Google's guidance could not be verified (`developers.google.com` and `schema.org` both 403 through the agent proxy) | Ship step 39 now; hold step 50 until a human runs the Rich Results Test on a deployed series URL |
| 3 | Are the three numbers **platform-wide**, not per Space or per Circle? Per-scope would need a numeric kind added to `ElementSetting` and a master/override model | Platform-wide. No evidence of demand |
| 4 | **No per-event host override.** A host cannot make their series show 3 cards | Accept. It needs a column, a migration and a second source for the same number |
| 5 | Is `Go to Thu, Jul 30` the right series-mode button label? `RSVP for Thu, Jul 30` reads better but lies on a tickets-mode occurrence | Keep `Go to`. The helper line under it carries the real instruction |
| 6 | Are **cancelled dates** shown struck through on the rail, or excluded? | Excluded in v1, matching every browse surface. Showing them is a one-line filter change plus a copy string plus a §10 pass |
| 7 | Does `recurrence_until` stay **exclusive** at the day boundary (a `2026-08-13` end excludes an 18:00 event on Aug 13)? | Keep the behaviour; the preview now makes it visible and copy C3b explains it. Changing it is a separate, riskier change |
| 8 | Do the six `/discover` callers of `public_events` get the missing visibility gate in a follow-up PR? | Yes, separately. Widening a `SECURITY DEFINER` `WHERE` clause is a security change and does not belong in a display PR |
| 9 | Is the ~30-day horizon truncation on 3-slot blocks (§2.3) acceptable for v1, or does `SERIES-PD` come forward? | Acceptable for v1. `hasMore` never hides the escape hatch, and the QA fixture makes the limit visible |

---

## 13. Adjudicated

Every critique finding was applied. Two were applied in a modified form; both are recorded here with the
reasoning, and nothing was silently ignored.

| Finding | Verdict | Note |
|---|---|---|
| §1 / §2 API mismatch (`collapseSeriesRows`, `SERIES_COLUMNS`, `SeriesFields`, two constant names, two ceilings) | ✅ Applied | §1 owns the module; the wrapper, the columns constant and the field interface are added there; `SERIES_FETCH_MULTIPLIER` / `SERIES_FETCH_CEILING` keep their names; the ceiling is **240** (the RPC cap raise and the union sizing were both computed against it); test cases 32 and 33 updated |
| Guard file cannot compile on the commit that introduces it | ✅ Applied | Guard splits into part one (step 3, NEVER + RPC only) and part two (step 24, the lists plus their vacuity assertions) |
| `moreDates` never passed; structurally unreachable through `collapseSeriesRows` | ✅ Applied | `/events` keeps the full `CollapseResult`, projects a plain `Record<string, number>` onto `EventsIndexData`, and both `EventCard` call sites pass it. Chip scope explicitly ruled to `EventCard` surfaces; C19 rewritten to say so |
| `cardsPerSeries` / `railDates` read by nobody (circular ownership) | ✅ Applied | §7.3 assigns every consumer by name with its owning step and its guard assertion; pure modules take the number as an argument |
| `MAX_CARDS_PER_SERIES = 5` vs the claimed kill switch | ✅ Applied | 60 ships. C19, the rollback table and the coercion test all updated; the "not a switch" runbook line is deleted |
| `create or replace` fails with 42P13; two wrong file citations | ✅ Applied | Drop + create + re-grant for both RPCs, citations corrected, `docs/DATABASE.md` step added |
| QR picker SELECT has no `id` | ✅ Applied | `id` added; the fold hardened so a falsy `id` passes through (test case 26); rule 2 in §5.1 states the requirement globally |
| Sitemap one-off branch never fires (`recurrence_type` defaults to the string `'none'`) | ✅ Applied | `isSeriesCadence` exported from `lib/events/series.ts` and used in both places |
| Saved `/events/*` layouts put the rail in MAIN | ✅ Applied | Option (c) plus verification: the `page_settings` query is step 30, the fallback is stated in §6.4, and `SERIES-MAIN` is named |
| `allowedVisibilities` is not computed by the existing gate | ✅ Applied | Verified against `page.tsx:475-491`; the membership read is now unconditional when `circleId != null` and the viewer is signed in |
| Three incompatible definitions of "upcoming" | ✅ Applied | One floor, `seriesUpcomingFloor`, used by browse, the rail and the sitemap. The eight naive reads are fixed in the commits that already touch those lines (steps 13, 16-20) |
| Search partition fetches the oldest rows from the beginning of time | ✅ Applied | Two reads (upcoming asc, past desc), `collapseSeriesAroundFloor` owned by §1, ordering pinned in the guard |
| `/events` public union over-fetch is a no-op; `nearbyEvents` not raised | ✅ Applied | `SERIES_WIDE_READ = 500` on the union, the nearby read and the RPC cap; graded 🟡; `SERIES-PD` named as the only real fix |
| `public_organizer_events` hard-codes `limit 100` | ✅ Applied | `_limit` parameter with `LEAST(_limit, 500)`, two partitions requesting `seriesFetchLimit(50)`; P6 re-graded 🟡 and added to the QA table |
| Guard asserts `collapseSeriesRows(` for the search files, which use a different helper | ✅ Applied | `collapseSeriesAroundFloor` is a named §1 export; the guard accepts any of the three fold entry points |
| `electBy: 'input'` is unreachable and contradicts §2's fold placement | ⚠️ **Applied in modified form** | Two reviewers proposed different fixes: delete the option (reviewer 1's stated preference, "pick it and say so") or add a sort-first branch (reviewer 2). **Deleted**, with the tradeoff written out in §4.4 and `SERIES-RANK` named. The branch adds a second ordering path to the busiest page for a marginal gain, and deletion also removes the contradiction reviewer 2 identified |
| `Series` FactRow self-links on the anchor page | ✅ Applied | `seriesHref` only for a child with a readable anchor; anchor test case added |
| `SeriesDatesPreview` hand-rolls a fourth wall-clock parse and breaks on seconds | ✅ Applied | Uses `wallClockToIso` / `dateToWallClockIso` from `lib/events/datetime` (verified: `LOCAL_DATETIME` already accepts optional seconds) |
| `anchorSlugFor` in the §1.5 example does not exist and cannot be written | ✅ Applied | The example is `moreDates` only; the card has one destination |
| `selectUpcomingForCircle` reintroduces the banned compare | ✅ Applied | The floor is passed in as an argument; both the query and the JS filter use it; a test case is added |
| Edit-form State A fires on a one-off being converted | ✅ Applied | Gated on the **stored** `initial.recurrenceType` |
| `isRecurringAnchor` is not an export of `lib/events/ics.ts` | ✅ Applied | Verified by grep; the comment is corrected and step 6 gives the `.ics` route the shared predicate |
| Three event-list reads missing from the master table | ✅ Applied | `profile-feed.tsx` collapses (step 20), `lib/spaces/discovery.ts` goes to the count backlog with the distinct-seriesKey note, `app/(main)/admin/qr/page.tsx` is classified as operator / must-not-fold with `SERIES-PICKER` named |
| NEVER guard guards a file that reads no events | ✅ Applied | Replaced with the four real calendar readers plus the Going lane, the Space-reader default and `/admin/qr` |
| Over-fetch truncates the browse horizon; `hasMore` can hide the escape hatch | ✅ Applied | §2.3 states the horizon consequence; `hasMore` gains the `rows.length >= fetchLimit` disjunct; the 45-day fixture row is added to QA; `SERIES-PD` is named for the three 3-slot surfaces. The bounded second keyset read was **not** specified as required work, because `SERIES-PD` is the cleaner fix for the same three surfaces |
| No owner for the event-detail query budget | ✅ Applied | One-off short-circuit before any read, `seriesLive` derived from `nextPublicOccurrence`, TTFB acceptance row with a stated budget |
| Four vocabularies for the same object; two ungated | ✅ Applied | "series" ruled as the member noun; the help and changelog bullets rewritten; step 12 is a blocking gate on the whole copy bank |
| `docs/DATABASE.md` disclaimed while a signature change ships | ✅ Applied | Added to step 23 with an ADR cross-reference |
| `SeriesDate` declared twice | ✅ Applied | Declared once in `lib/events/series.ts`; `series-dates.ts` imports and narrows |
| Whitespace-exact guard assertions | ✅ Applied | All assertions are stable single-line tokens; ordering uses `indexOf` comparisons |
| Going lane loses the viewer's sort and uses `localeCompare` | ✅ Applied | Built from `filteredEvents` with the page's own extracted `eventComparator`; `Date.parse` if a date sort is ever wanted |
| Saved-layout verification and the MAIN note | ✅ Applied | See the saved-layout row above |
| `recurrence_until` exclusivity is newly visible with no copy | ✅ Applied | Copy C3b added under the end-date field; behaviour unchanged; pinned in `lib/events/recurrence.test.ts` |
| `SeriesDatesPreview` seconds handling | ✅ Applied | Same fix as the wall-clock parse row |
| §5.1.1 label/helper vocabulary split, and the misnamed one-home test | ✅ Applied | Label `Dates kept in search` (C22) and helper C23 use one word; the assertion is replaced with a repo-wide walk plus a vacuity check on the walked file count |
| `dateRangeWindow` owned by nobody | ✅ Applied | Fixed in step 14 with a 17:01-Pacific test case; QA row C1 notes the before/after time sensitivity |
