# Frequency — MVP Build List

**Audience reframe:** Circle.so sells to community *operators* marketing to their audiences. Frequency is built for the **people inside the offering** — embodied practitioners who show up to rides, gatherings, circles. That changes what's worth building and what's noise.

This roadmap is mirrored to [MVP Build List in Notion](https://www.notion.so/36efb0d4b941813e8e04d8a4d30d1dc3). The repo file is the source of truth — update both when status changes.

---

## Deliberately NOT building (creator-tool features)

These are Circle's bread and butter but conflict with Frequency's worldview. Resist scope-creep requests for them.

> **⚠️ Partly superseded by [PLATFORM-VISION.md](docs/PLATFORM-VISION.md) (2026-05-31).**
> The owner has expanded the vision to one community graph spanning a nonprofit
> (Foundation) + for-profit (Labs), so **Marketplace, Affiliate, and a native mobile app
> are now IN SCOPE — but guardrailed**: every vertical's high-value rewards must **ladder
> up to verified practice** (ADR-024/034), so the worldview is *preserved*, not abandoned.
> The genuinely-still-excluded worldview piece is **custom roles**: "many roles as we grow"
> is expressed on the **persona axis** (ADR-030), *not* by inflating the 6-tier ladder. See
> ADR-029→036.

- ~~White-label / branded mobile app~~ → **in scope** (native app, the *primary* doorway — TECH-STRATEGY) · Custom CSS · Theme editor · Landing page builder · Custom email templates UI
- Multi-tenant / Workspaces / sub-communities · Headless mode · ~~Marketplace~~ → **in scope, guardrailed** (entity-tagged `market` module — ADR-033)
- **Custom roles** still excluded (the 6-tier ladder IS the worldview; grow on the **persona axis** instead — ADR-030/034) · SAML / SCIM
- ~~Affiliate program~~ → **in scope, guardrailed** (for-profit `affiliate` module on the financial ledger — ADR-032/033) · Sub-account billing · MRR / churn dashboards
- AI agents impersonating hosts · AI Inbox triage
- Public API for external integrations (Zapier, HubSpot, Salesforce)

---

## Status legend

- 🔴 P0 — Broken or stubbed, fix before adding anything
- 🟠 P1 — Critical participant-experience gaps
- 🟡 P2 — Curriculum + practice (Hierarchy v3.3+)
- 🟢 P3 — Discovery & social trust
- 🟢 P4 — Light, aligned monetization
- 🔵 P5 — Host & leadership tools
- 🟣 P6 — Selective AI (search + digest only)
- ⚫ P7 — Foundational hygiene

State: `[ ]` pending · `[~]` in progress · `[x]` done

---

## 🔴 P0 — Fix the broken

- [x] **P0.1 — Repair `invite_links` drift.** ✅ 2026-05-28 — `migration repair --status reverted 20240105000000` + `db push` applied cleanly. Table verified via PostgREST (HTTP 200). Stale comment in `lib/achievements.ts:267-268` removed.
- [x] **P0.2 — Wire `/settings/notifications` UI.** ✅ 2026-05-28 — Shipped: migration `20240206000000_notification_preferences.sql` (table, RLS, updated_at trigger), [lib/notification-preferences.ts](lib/notification-preferences.ts) helper (`shouldSend(profileId, channel, category)` with lazy-create defaults), [/settings/notifications](app/(main)/settings/notifications/page.tsx) form (4 categories × 3 channels, push column locked until P1.4), and gate-checks at dispatch email send sites ([broadcast/actions.ts](app/(main)/broadcast/actions.ts), [admin/actions.ts](app/(main)/admin/actions.ts)). Welcome email at signup stays ungated (transactional). Categories: dispatches, events, mentions, lifecycle. Default opt-in true for email + in-app (no regression for existing members).
- [x] **P0.3 — Moderation actions wired end-to-end.** ✅ 2026-05-28 — Migration `20240207000000_moderation_actions.sql` (suspended_{at,until,reason,by} on profiles, hidden_{at,by} on posts + dispatches, seeded `@moderation` system profile, BEFORE INSERT trigger blocks suspended members from posting). [report-actions.ts](app/(main)/feed/report-actions.ts) now soft-hides instead of hard-deletes posts/dispatches, with three new helpers: `warnMember` (opens or reuses a 1:1 DM from the system profile, sends templated text), `suspendMember` (24h / 7d / 30d / indefinite), `cancelEventFromReport`. Queue UI ([moderation-queue.tsx](app/(main)/admin/moderation/moderation-queue.tsx)) shows per-target action menus and an inline "N prior reports" badge on member targets. Feed/broadcast/search/profile queries now filter `.is('hidden_at', null)` (8 read sites touched).

## 🟠 P1 — Critical participant-experience gaps

- [x] **P1.4 — PWA service worker + web push.** ✅ 2026-05-28 — Migration `20240210000000_push_subscriptions.sql` (UNIQUE per profile+endpoint, RLS read/insert/delete own). [public/sw.js](public/sw.js) handles `push` events (renders notification) and `notificationclick` (focuses existing tab or opens new). [components/push/registration.tsx](components/push/registration.tsx) mounted in (main) layout — registers SW, requests permission silently, subscribes, POSTs to [saveSubscription](components/push/actions.ts). [lib/push.ts](lib/push.ts) sends via `web-push` package; prunes 404/410 dead subscriptions automatically. Wired into both dispatch fan-out paths (broadcast + admin) AND event reminder cron; each gated by `shouldSend(*, 'push', category)`. Push column in `/settings/notifications` unlocked. VAPID keys added to `.env.example` — generate with `node -e "console.log(require('web-push').generateVAPIDKeys())"`. Verified: SW serves HTTP 200, tsc clean, reminder cron handles push column without error.
- [x] **P1.5 — Event reminders (email).** ✅ 2026-05-28 — Migration `20240209000000_event_reminder_sent.sql` adds `event_rsvps.reminder_{24h,2h}_sent_at` for per-RSVP idempotency. [lib/email.ts](lib/email.ts) gets `sendEventReminderEmail({lead, whenLabel, whenAbsolute, location, ...})` matching the dispatch template style. [/api/cron/event-reminders](app/api/cron/event-reminders/route.ts) runs every 15 min, fires T-24h and T-2h for events in a 30-min window, gates each send by `shouldSend(profileId, 'email', 'events')`. Push side will land with P1.4 — same call site, just add `shouldSend(…, 'push', 'events')`.
- [x] **P1.6 — Recurring events.** ✅ 2026-05-28 — Migration `20240208000000_event_recurrence.sql` (`recurrence_type` enum daily/weekly/monthly, `recurrence_until`, `parent_event_id` self-ref, CHECK constraint preventing occurrences from themselves being recurring). [lib/event-recurrence.ts](lib/event-recurrence.ts) materialises 60-day window; daily cron at [/api/cron/event-occurrences](app/api/cron/event-occurrences/route.ts) rolls it forward (added to vercel.json at 0 2 * * *). createEvent synchronously generates the first batch so users see them immediately. Event form has 4-button recurrence picker + optional end date. Event detail shows "🔁 Repeats weekly" badge. Chose simple enum over RFC 5545 RRULE — promotable later without data loss.
- [x] **P1.7 — Calendar export (ICS / Add to Calendar).** ✅ 2026-05-28 — Public route at [`/events/[slug]/event.ics`](app/events/[slug]/event.ics/route.ts) returns RFC 5545-compliant VCALENDAR with DTSTART/DTEND, SUMMARY, LOCATION, DESCRIPTION, URL, and STATUS:CANCELLED handling. Proper line folding at 75 octets and ICS escaping for `,;\\\n`. Proxy patched to exclude `*.ics` from auth gating (events are already anon-readable via public_landing_reads policies). "Add to Calendar (.ics)" button added to event detail next to "Add to Google Calendar".
- [x] **P1.8 — Weekly community digest email.** ✅ 2026-05-28 — [lib/digest.ts](lib/digest.ts) assembles per-profile payload (3 recent dispatches via circle/hub/nexus reach, 5 upcoming RSVP'd events, top streak, current season rank + zaps). Returns null if nothing to surface → cron skips silently. [/api/cron/weekly-digest](app/api/cron/weekly-digest/route.ts) runs Sundays at 14:00 UTC. Each send gated by `shouldSend(*, 'email', 'lifecycle')` so the existing "Onboarding nudges" toggle ALSO governs the digest (deliberate — both are "Frequency reminding you to come back"). Unsubscribe link + List-Unsubscribe headers wired. Verified: 3 candidates → 3 sent (no API key in dev so Resend no-op'd; assembler executed cleanly).
- [x] **P1.9 — Email opt-out / unsubscribe link.** ✅ 2026-05-28 — HMAC-signed stateless tokens via [lib/unsubscribe-tokens.ts](lib/unsubscribe-tokens.ts) (`UNSUBSCRIBE_SECRET` env var added; falls back to service-role key prefix in dev). Public page at [/unsubscribe](app/unsubscribe/page.tsx) — no login required, auto-flips on load. RFC 8058 one-click POST endpoint at [/api/unsubscribe](app/api/unsubscribe/route.ts). Email templates (dispatch + event reminder) inject `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers required by Gmail/Yahoo bulk-sender policies. Verified end-to-end: invalid token rejected, valid GET flips correct pref, POST returns 200, target email categories flipped without affecting others.

## 🟡 P2 — Curriculum + practice (Hierarchy v3.3+)

- [ ] **P2.10 — `seasons` table.** Start/end dates, theme, optional challenge set. Powers existing `season_zaps` reset with a proper UI.
- [ ] **P2.11 — `practices` + `circle_weekly_practice` tables.** What the circle is doing this week. Surface on circle home, in dispatches, in event detail.
- [ ] **P2.12 — Practice library / browse.** `/practices` page. Members see what other circles do.
- [ ] **P2.13 — Attendance-driven streaks via event check-in.** RSVP ≠ attended. Add `event_attendance` (checked_in_at) so streak math is honest. Feeds host analytics (P5).

## 🟢 P3 — Discovery & social trust

- [ ] **P3.14 — Map / proximity Circle discovery.** `circles` already has `lat/lng/city/neighborhood`. Add map view at `/circles` (Mapbox or Leaflet).
- [ ] **P3.15 — Member directory filters.** By Circle, by rank, by online-now, by city. Currently `/people` is a flat list.
- [ ] **P3.16 — Member profile richness.** Practice history, attendance count, achievements showcase, streaks earned. Data exists; profile page just renders basics.
- [ ] **P3.17 — @mention rendering + notifications.** `/api/search-handles` exists for autocomplete; finish mention parser + notification fan-out.
- [ ] **P3.18 — Friend suggestions.** "People in your Circle you haven't met" / "people with overlapping events." Cheap heuristics beat ML at this scale.
- [x] **P3.30 — Public SEO/AEO discovery layer.** ✅ 2026-05-28 — Logged-out visitors and crawlers can browse community content read-only without exposing precise location. **Phase 1** (commits `184bdb7`/`980583d`): dropped the anon `events: public read future non-cancelled` policy that leaked `events.location` via the raw REST API; added column-safe `SECURITY DEFINER` RPCs (`public_events`, `public_event_by_slug`, `public_circles`, `public_circle_by_id`, `public_posts`) returning city-only location and a redacted author shape (migration [`20240211000000_public_discover_reads.sql`](supabase/migrations/20240211000000_public_discover_reads.sql), applied to prod); rewired landing reads; SEO foundation ([lib/site.ts](lib/site.ts), [app/robots.ts](app/robots.ts), [app/sitemap.ts](app/sitemap.ts), [opengraph-image](app/opengraph-image.tsx) + [twitter-image](app/twitter-image.tsx), root metadata). **Phase 2** (commit `02693ac`): `/discover` hub + `/discover/topics/[slug]` + `/discover/circles/[id]` + `/discover/events/[slug]` built on the safe RPCs via a cookieless anon client ([lib/supabase/public.ts](lib/supabase/public.ts), [lib/discover.ts](lib/discover.ts)) — read-only, every interaction is a sign-in CTA, location stays city-only; dynamic sitemap. **Phase 3** (commit `a090364`): JSON-LD ([lib/jsonld.ts](lib/jsonld.ts) + [components/json-ld.tsx](components/json-ld.tsx)) — Organization + WebSite site-wide, Event + BreadcrumbList on event pages, ItemList + BreadcrumbList on topic/hub pages, BreadcrumbList on circle pages, and a visible FAQ backed by FAQPage schema on the hub. Full plan: [SEO-AEO-PLAN.md](SEO-AEO-PLAN.md).
- [ ] **P3.31 — Submit sitemap + custom domain for SEO.** Manual, needs creds. (1) Verify the production domain in Google Search Console + Bing Webmaster Tools and submit `sitemap.xml` (already advertised in `robots.txt`). (2) `.vercel.app` ranks weakly — point a custom domain at the app and set `NEXT_PUBLIC_SITE_URL` in Vercel (metadata, sitemap, robots, JSON-LD all follow automatically). Highest-leverage remaining SEO move.

## 🟢 P4 — Light, aligned monetization

The Circle pricing model (creator pays platform per member) is wrong for Frequency. Participant-aligned options:

- [ ] **P4.19 — Paid event tickets via Stripe Checkout.** Drop-in vs. member pricing. Embodied gatherings (workshops, retreats, paid rides).
- [ ] **P4.20 — Donation / tip-the-host.** Single-button "send a tip" to the host of an event you attended.
- [ ] **P4.21 — Paid Circle dues.** Optional monthly fee a specific Circle can charge its members; goes to the host. Frequency takes thin slice or nothing.
- ❌ **NOT building:** subscription paywall gating the whole platform · tiered "pro member" badges · pay-to-unlock-Spaces.

## 🔵 P5 — Host & leadership tools

- [ ] **P5.22 — Per-Circle host dashboard.** Attendance trend (4-week rolling), retention curve, members at risk (no event attendance in 21 days). Distinct from admin/janitor view.
- [ ] **P5.23 — "Members slipping" weekly nudge.** Host gets a list of "3 members haven't shown up in 21 days, want to reach out?" with one-click DM template.
- [ ] **P5.24 — Crew task verification queue per host.** Exists in schema; surface as host-scoped inbox.

## 🟣 P6 — Selective AI

- [ ] **P6.25 — Semantic search across dispatches + posts.** Embedding-based via `pgvector` (Supabase supports). "Remember when we talked about cold plunges?"
- [ ] **P6.26 — AI weekly digest summarizer.** Condense previous week's circle activity into 3-bullet recap inside P1.8 digest email.
- ❌ **NOT building:** AI agents impersonating hosts · AI-generated posts · AI moderation (the roles ladder is the moderation).

## ⚫ P7 — Foundational hygiene

- [ ] **P7.27 — Audit logging** for role changes, member suspensions, content removals. `admin_audit_log` table.
- [ ] **P7.28 — Email deliverability hardening.** DKIM/SPF on `hellofrequency.com`, dedicated IP if volume grows.
- [ ] **P7.29 — Background job durability.** Current cron creates notifications inline; if Resend is down mid-dispatch, emails silently drop. Add `notification_queue` with retries.

---

## Working order

1. Clear P0 (broken state first).
2. Then P1 #4–9 as a bundle (notification + reminder loop is the highest retention lift).
3. Then P2 (curriculum) — already on Hierarchy v3 roadmap.
4. Monetization (P4) decision before P3+.

Each item that lands gets checked here. New work that surfaces mid-build goes in as a new numbered item, not buried in a sub-bullet.
