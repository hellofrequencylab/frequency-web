# /how: the Frequency overview brief

Status and open owner actions live in docs/BUILD-BACKLOG.json (row LIVE-2323), not here.

A link-only page that explains how Frequency works and where the money comes from. It is written
for coaches, advisors and partners, and is shared by direct link only.

- **URL:** `https://frequencylocal.com/how`
- **Not indexed:** page-level `robots` metadata (noindex, nofollow, noarchive, nosnippet,
  noimageindex). It is deliberately **not** disallowed in `robots.txt`, because a blocked page's
  noindex is never read.
- **Not in the nav or sitemap:** it lives in the `app/(brief)` route group, outside `(marketing)`,
  with no SiteShell header, menu or footer. It is not listed in `lib/frequency/site-nav.ts` or
  `app/sitemap.ts`.

## Sharing it

Give each reader their own link, so you can see who read what:

```
https://frequencylocal.com/how?r=jane-coach
```

`r` is any short code you choose (letters, digits, `-` and `_`, up to 40 characters). It is kept
for that reader's visit and attached to every event they send. `utm_*` parameters are recorded
too.

## Files

| Path | What it is |
|---|---|
| `app/(brief)/layout.tsx` | Route group layout: self-hosted Unbounded, Hanken Grotesk and Fraunces italic |
| `app/(brief)/how/page.tsx` | Metadata (noindex) and a static render |
| `app/(brief)/how/how-brief.tsx` | Client component: mounts the brief, runs the calculators, rail and tracking |
| `app/(brief)/how/brief-html.ts` | **Generated** page markup. Do not hand-edit |
| `app/(brief)/how/brief.css` | **Generated** styles (design-system tokens plus the brief's own) |
| `app/(brief)/how/brief-motion.ts` | Side index rail, and the "Groups fade" loop that winds down when the reader stops scrolling |
| `lib/how/brief-tracker.ts` | Client tracker for every private page: batches events to the beacon |
| `lib/how/private-readers.ts` | Folds the events into readers and clicks for the admin view |
| `app/api/how/beacon/route.ts` | Anonymous event intake: consent and GPC checks, rate limit, writes via `track()` |
| `lib/how/brief-calc.ts` | Calculator maths, shared by the page and its tests |
| `lib/how/brief-events.ts` | Event names and batch validation |
| `public/how-assets/` | Logo, photos and program logos |

The markup and CSS are generated from the design canvas "Frequency Overview" (Claude artifact). To
change copy or layout, edit the design and regenerate. Hand edits to the generated files are
overwritten.

## Tracking

**All private pages.** The same tracker runs on `/how`, `/facilities` and `/lab` (`PRIVATE_PAGES` in
`lib/how/brief-events.ts`). Every event carries `page`. The `?r=` code carries across the private pages
in one tab, so `frequencylocal.com/facilities?r=jane` followed by a click to `/lab` stays Jane. Clicks
are page-wide (every link, button and expander, header and footer included) and a form submit records
only the option picked, never what was typed. **See it at `/admin/growth#private-pages`** (the Private pages
section at the bottom of the Growth dashboard; not its own route, because the deploy sits at the 8 GB
build budget): one row per reader and the full click log.

Every event goes to `engagement_events` with `source = 'web'`, no profile (`actor_profile_id` is
null), and its details in `context`. Each event carries `sid` (one visit), `ref` (the `?r=` code)
and `page = '/how'`. Nothing is sent when the browser signals Global Privacy Control, or when the
visitor has declined analytics.

| Event | When | Key details |
|---|---|---|
| `how.view` | Page opened | `utm_*`, `referrer_host`, `device`, `tz`, `visit` (count on this browser) |
| `how.section_view` | A section reaches mid-screen | `section`, `idx`, `at_s` |
| `how.section_dwell` | A section leaves mid-screen | `section`, `ms` |
| `how.scroll_depth` | 25, 50, 75, 90, 100 percent | `pct` |
| `how.heartbeat` | Every 15s of engaged (visible, active) time | `engaged_s` |
| `how.calc_input` | A calculator slider settles | `calc`, `key`, `value` |
| `how.appendix_open` | An appendix item opens | `item` |
| `how.link_click` | Rail, nav, "next" or summary link used | `kind`, `target` |
| `how.copy` | Text copied | `section`, `chars` |
| `how.complete` | Reader reaches the closing section | `engaged_s` |
| `how.exit` | Page hidden or left | `engaged_s`, `max_pct`, `sections`, `calc_touches`, `total_s` |

Section views, scroll depth, completion and calculator use are also mirrored to GA4 when the
visitor allows Google analytics.

### Reading it

Who opened it, and how far they got:

```sql
select context->>'ref'                                    as reader,
       min(created_at)                                    as first_seen,
       count(distinct context->>'sid')                    as visits,
       max((context->>'engaged_s')::int)
         filter (where event_type = 'how.exit')           as best_engaged_s,
       max((context->>'max_pct')::int)
         filter (where event_type = 'how.exit')           as best_scroll_pct,
       bool_or(event_type = 'how.complete')               as finished
from engagement_events
where event_type like 'how.%'
group by 1
order by first_seen desc;
```

Time spent on each section for one reader:

```sql
select context->>'section' as section,
       round(sum((context->>'ms')::int) / 1000.0) as seconds
from engagement_events
where event_type = 'how.section_dwell' and context->>'ref' = 'jane-coach'
group by 1
order by seconds desc;
```

Which calculator inputs they tried:

```sql
select created_at, context->>'calc' as calc, context->>'key' as input, context->>'value' as value
from engagement_events
where event_type = 'how.calc_input' and context->>'ref' = 'jane-coach'
order by created_at;
```
