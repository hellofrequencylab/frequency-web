# Studio Review — compiled product priorities (2026-06-01)

A six-strategist "design-agency" review of the whole system: **Feed**, **Circles/Discovery**,
**Events + the practice loop**, **Onboarding/Vera**, **Studio/Analytics**, and
**Marketing/Funnel/SEO/Identity**. Each section was reviewed against the codebase for current
state → content-display best practices → gaps → prioritized recommendations. This doc is the
cross-section synthesis. North Star throughout: **Weekly Active Members (WAM)**.

> Companion specs already merged: ONBOARDING.md (ADR-047), AI-VERA.md (ADR-049),
> ANALYTICS.md (ADR-050), GA4 (ADR-048). This review prioritizes against them.

## The spine — 5 cross-cutting themes

1. **One keystone unblocks four sections: the `track()` event helper (ADR-050).** The
   `engagement_events` backbone is live and clean, but the feed, onboarding flow, and analytics
   emit almost nothing into it. Build the dual-emit `track()` helper + taxonomy once and feed
   ranking, the activation funnel, analytics trends, practice nudges, and Vera's memory all
   light up. **Do this first.**
2. **"Built but dark" — reclaim what's already coded.** High-value work exists but isn't wired
   up: the **proximity "Circles near you" list** (`components/circles/near-you.tsx`, mounted
   nowhere — `sort=nearest` falls back to alphabetical at `circles/page.tsx:144`),
   **`engagement_score`** (computed in `lib/studio/contacts.ts`, shown nowhere), **achievement
   unlocks** (awarded silently in `lib/achievements.ts`), and the **`/discover` index pages**
   (don't exist). Near-zero effort, real value.
3. **The North Star has no cue.** The retention engine is architecturally excellent (one ledger,
   clean `practice.verified`, correct WAM/cohort analytics) but the **practice log — the actual
   WAM action — has no reminder** (events get a 24h/2h cron; practices get none), and the
   **streak model is weekly while the UI implies daily** (`lib/achievements.ts` `isSameWeek`
   guard vs the 14-day grid). Biggest WAM leak in the system.
4. **The front door is a gate, and it shows tiny numbers.** New members hit a **blocking
   handle-uniqueness wizard** before seeing any content; cold visitors see **raw `0`/tiny
   social-proof counts**. Both actively cost you the people you just attracted.
5. **You can't see if you're winning.** Analytics metrics are correct but have **no time axis** —
   every number is a static snapshot and the `/studio` home shows nothing live. Growth is
   indistinguishable from decay.

## Verified findings (checked against code)
- `NearYou` built, **mounted nowhere**; `sort=nearest` → `localeCompare`.
- `post_reactions` RLS requires **crew+ to read & insert** → plain members likely can't react.
- No `app/api/cron/practice-reminder` (events have `event-reminders`).
- `/discover/{circles,topics,events}` index routes are **absent**.

---

## P0 — Now (highest leverage; mostly small)

| # | Move | Section | Effort | Why |
|---|---|---|---|---|
| 1 | **Ship the dual-emit `track()` helper + event taxonomy** (writes `engagement_events` + fires GA4); wire into onboarding/feed/practice/circle actions | Analytics · keystone | M | Unblocks ranking, activation funnel, trends, nudges, Vera memory — one build, four sections |
| 2 | **Mount the existing `NearYou` proximity list**; make `sort=nearest` rank by real distance | Discovery | S | "Who's near me?" is the #1 newcomer question; already written; fixes a false "shipped" claim |
| 3 | **Kill the onboarding gate (Phase 0)** — backfill default handle/name, demote `/onboarding` to optional | Onboarding | S | Biggest activation lever; newcomers reach content in session 1; no AI/schema |
| 4 | **Practice-reminder cron + streak-at-risk nudge** (clone `event-reminders`) | Practices | M | The missing cue for the North-Star action; biggest WAM leak |
| 5 | **Fix streak model↔UI coherence + streak-stakes in the feed prompt** ("keep your 6-wk streak 🔥") | Practices/Feed | S | Removes the demotivating "streak stuck" bug; loss-aversion drives the habit |
| 6 | **Optimistic reactions/replies + fix the member-reaction RLS bug** | Feed | S | Cheapest engagement made instant; fixes a likely-broken core interaction |
| 7 | **`/studio` home KPIs + time axis (deltas + sparklines) + retention heatmap** | Studio | S–M | Turns correct-but-static metrics into a read on growth vs decay |
| 8 | **Social-proof floor** (replace `0`/tiny counts with qualitative proof: named circles, the Moonlight story, photos) | Marketing | S | Removes the #1 trust-killer for a brand-new community |
| 9 | **Build the 3 `/discover` index pages** (events/circles/topics) with `ItemList` schema | Marketing/SEO | M | Browse hierarchy + crawl fan-out; currently absent |
| 10 | **Merchandise `/beta`** (cohort/scarcity, "what happens next", privacy trust) + single dominant hero CTA | Marketing | S | Directly lifts qualified sign-up rate |
| 11 | **Card legibility + activation dead-ends**: city/capacity/status on `CircleCard`; richer feed empty-state → "join a circle / find people / RSVP"; in-feed welcome moment | Feed/Discovery | S | Legibility + turn dead-ends into the activation funnel |

> Note: `NEXT_PUBLIC_SITE_URL=https://frequencylocal.com` is already set in prod (domain
> migration) — just **verify** canonical/OG/sitemap show the brand domain.

## P1 — Next

| Move | Section | Effort | Why |
|---|---|---|---|
| **Activation funnel panel** (account.created → onboarding steps → first practice) | Studio | M | Shows *where* new members stall (needs #1) |
| **"Nearly full → start the next circle" growth flywheel** (prefilled, sets new host) | Discovery | M | Turns the 50-cap into the mechanism that mints hosts + weekly gatherings — biggest WAM multiplier |
| **Guided first-circle suggestion** (deterministic: region + popularity) | Onboarding | M | Replaces the blind `/circles` dump with "here's one that fits" |
| **Achievement-unlock + milestone celebration** (surface silent awards: confetti/modal) | Practices | M | Variable reward + recognition → stickiness |
| **One-tap RSVP on event cards + host avatar/cover + relative time** | Events | M | Lowers friction to the gateway action |
| **Reaction faces + inline reply previews + personalize "For You"** | Feed | M | Belonging legibility; stops stale global hotness |
| **Per-campaign/automation performance + surface `engagement_score` in CRM + search/drill-down** | Studio | M | Closes the learn loop; lights up the dark behavioral signal |
| **Circle "practice of the week" hero + surface the practice prompt beyond the feed** | Practices | S–M | Social-accountability multiplier; more log surfaces |
| **Post-auth deep-link continuity** (discover circle → sign-in → land back with join armed) + **soften the newcomer breadcrumb** | Discovery | S | Converts the highest-intent visitor; removes operator jargon |
| **Beta segmentation field** (interest/neighborhood → `contacts.meta`) + **testimonials/faces block** | Marketing | S–M | Segmented invites; human proof = trust |
| **Public privacy-safe profiles + `Person`/`ProfilePage` schema** (city-level only) | Identity/SEO | L | Largest untapped acquisition/trust/virality surface |
| **AI core (`lib/ai/`)** — model router, prompt cache, caps, kill switch, governance | AI | L | Prerequisite for Vera; prove on the support bot first (ADR-028/041) |

## P2 — Later / strategic

| Move | Section | Effort |
|---|---|---|
| **Vera** persona registry + onboarding concierge (Phase 2) — propose-and-confirm tools, streamed | AI | L |
| **GA acquisition widget** in Studio via the GA Data API (service account) | Studio | M |
| Realtime feed "new posts" pill + "active now" panel (Supabase Broadcast) | Feed/Studio | M |
| Multi-image carousel/lightbox + per-event OG images | Feed/Marketing | M |
| Streak grace / "log yesterday" recovery | Practices | M |
| Strengthen check-in "verified" (host roster / time-window / geo/QR) | Practices | L |
| Saved/named segments → one-click campaign | Studio | M |
| Hub pages as local destinations (events + activity, not just a child list) | Discovery | M |
| Paginate + PostGIS geo-rank the directory; feed reads → SECURITY DEFINER RPC/read-model | Discovery/Feed | L |
| Post-confirm "invite a neighbor" referral loop | Marketing | M |

## Recommended sequencing

- **Sprint 1 — Foundation + free wins:** #1 `track()` keystone · #2 mount `NearYou` · #8
  social-proof floor · #9 discover index pages · #7 `/studio` KPIs + time axis. *(Keystone +
  reclaim the "built but dark".)*
- **Sprint 2 — WAM engine + activation:** #3 kill the gate · #4 practice reminder · #5 streak
  fixes · #6 optimistic feed + RLS fix · #10 `/beta` merchandising · #11 card/empty-state.
- **Sprint 3 — Depth:** activation funnel · full-circle flywheel · guided first-circle ·
  achievement celebration · one-tap RSVP · per-campaign analytics.
- **Strategic track (parallel, longer):** public profiles → AI core (proven on support bot) →
  Vera Phase 2.

### Note on the GA-on-the-dashboard request
Pulling GA acquisition data into the Studio dashboard (GA Data API widget) is **P2** here: the
six-section review is unanimous that the **first-party time-axis + KPIs (#7)** deliver more
operator value than the GA widget, and the GA widget depends on a service-account setup. If the
acquisition view is a priority regardless, it can be pulled forward — it's independent of the
P0 work.
