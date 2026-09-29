# App Store privacy label and age rating inputs

What the product collects, mapped to the App Store privacy "nutrition label", and the answers the
age rating questionnaire will ask for. Written from the code on 2026-09-29 for LIVE-724
([ADR-1642](DECISIONS.md)); each row cites the file that proves it.

**Status lives in [`docs/BUILD-BACKLOG.json`](BUILD-BACKLOG.json)**, not here. This file is a
reference: it says what is true of the code, and it does not track work. The native app itself is
parked (DEF-MOBILE); the iOS readiness rows are in wave WM of that file.

**How to keep it true.** The public policy at [`app/privacy/page.tsx`](../app/privacy/page.tsx)
and this inventory describe the same facts. A change that adds a processor, a data type, or a new
use of one updates both in the same PR. Re-derive rather than trust: `package.json` dependencies,
`grep -rhoE "https://[a-z0-9.-]+" lib app components`, and the member export's table list in
[`lib/privacy/export.ts`](../lib/privacy/export.ts).

**Terms used below.** *Linked* means Apple's "linked to the user's identity": the row is keyed to a
profile or an account. *Tracking* means Apple's definition: linking our data with other companies'
data for targeted advertising or measurement, or sharing it with a data broker. Frequency shows no
ads, sets Google Analytics' advertising signals off, and sells nothing, so **no data type is used
for tracking** and the app needs no App Tracking Transparency prompt.

---

## 1. The label, by Apple data type

Purposes use Apple's list: App Functionality, Analytics, Product Personalization, Developer's
Advertising or Marketing, Third-Party Advertising, Other Purposes.

### Contact Info

| Apple type | Collected | Linked | Tracking | Purpose | Where it lives / evidence |
|---|---|---|---|---|---|
| Name | Yes | Yes | No | App Functionality | `profiles.display_name`, `handle`. Google sign-in supplies it. |
| Email Address | Yes | Yes | No | App Functionality; Developer's Marketing (newsletters and digests the member can switch off) | Supabase Auth `auth.users`; sent to Resend ([`lib/email.ts`](../lib/email.ts)). |
| Phone Number | Yes, optional | Yes | No | App Functionality (texts the member opts into) | `profiles.phone`, `sms_consent.phone`; sent to Twilio ([`lib/comms/sms-send.ts`](../lib/comms/sms-send.ts)), fail-closed until provisioned ([`lib/comms/sms.ts`](../lib/comms/sms.ts)). |
| Physical Address | No for members | n/a | No | n/a | A venue address typed for an event belongs to the event, not the member. Stripe may collect a billing address on its own page. |
| Other User Contact Info | Yes, optional | Yes | No | App Functionality | `profiles.website`, `profiles.vcard` (the connect card). |

### Health and Fitness

| Apple type | Collected | Linked | Tracking | Purpose | Evidence |
|---|---|---|---|---|---|
| Health | No | n/a | No | n/a | No HealthKit, no medical records. |
| Fitness | See note | Yes | No | App Functionality | `practice_logs`, `practice_sessions` record that a member did a practice (breathwork, meditation and similar) and when. Declared as Other User Content below; owner confirms (see section 4). |

### Financial Info

| Apple type | Collected | Linked | Tracking | Purpose | Evidence |
|---|---|---|---|---|---|
| Payment Info | No (Stripe collects it) | n/a | No | n/a | Card entry is Stripe Elements or Checkout; we hold `profiles.stripe_customer_id` only. The iOS app will sell plans through Apple in-app purchase (ADR-1637). |
| Credit Info | No | n/a | No | n/a | |
| Other Financial Info | Yes, hosts only | Yes | No | App Functionality | Hosts who get paid: `profiles.stripe_account_id` and payout flags; Stripe Connect holds the identity and bank details. |

### Location

| Apple type | Collected | Linked | Tracking | Purpose | Evidence |
|---|---|---|---|---|---|
| Precise Location | Yes, optional | Yes | No | App Functionality | Home point `profiles.home_lat/home_lng`; live location once per opt-in `profiles.live_lat/live_lng` ([`components/settings/live-location-toggle.tsx`](../components/settings/live-location-toggle.tsx)). Others see only `location_band`. A geofenced code claim sends the position to `node_within_range` and does not store it ([`lib/engagement/verify.ts`](../lib/engagement/verify.ts), [`lib/engagement/capture.ts`](../lib/engagement/capture.ts)). |
| Coarse Location | Yes | No (not stored) | No | App Functionality | `getApproxLocationByIP` asks ipapi.co from the browser to center a map ([`lib/geolocation.ts`](../lib/geolocation.ts)). The result is not saved. `profiles.city`, `home_label` are the member's own words and are covered by Precise Location above. |

### Sensitive Info

| Apple type | Collected | Linked | Tracking | Purpose | Evidence |
|---|---|---|---|---|---|
| Sensitive Info | No, owner confirms | n/a | No | n/a | No field asks for race, religion, health, sexual orientation, or politics. Two opt-ins sit near the line: romance matching (`member_match_prefs.romance_mode`) and a birth date for astrology (`member_match_prefs.birth_data`) ([`lib/match/prefs.ts`](../lib/match/prefs.ts)). Declared as Other Data below. |

### Contacts

| Apple type | Collected | Linked | Tracking | Purpose | Evidence |
|---|---|---|---|---|---|
| Contacts | Yes, optional | Yes | No | App Functionality | Google Contacts import, read-only, one-time token ([`lib/integrations/google/people.ts`](../lib/integrations/google/people.ts)); business-card scans and hand-entered contacts in `network_contacts`; a Space's CRM `contacts`. Private to the owner. |

### User Content

| Apple type | Collected | Linked | Tracking | Purpose | Evidence |
|---|---|---|---|---|---|
| Emails or Text Messages | Yes | Yes | No | App Functionality | Direct messages `messages`, room chat `room_messages`, Space email replies received through Resend inbound ([`app/api/webhooks/inbound-email/route.ts`](../app/api/webhooks/inbound-email/route.ts)). |
| Photos or Videos | Yes | Yes | No | App Functionality | Storage buckets `avatars`, `posts`, `network-contacts`, `event-media` ([`lib/account-erasure.ts`](../lib/account-erasure.ts)). Card and poster photos go to Anthropic to be read. |
| Audio Data | Yes, hosts only | Yes | No | App Functionality | A Space's Airwaves audio uploads ([`app/(main)/spaces/[slug]/settings/airwaves/airwaves-console.tsx`](../app/(main)/spaces/[slug]/settings/airwaves/airwaves-console.tsx)). No microphone capture in the product. |
| Gameplay Content | No | n/a | No | n/a | Zaps and Gems are ledgers of actions, listed under Product Interaction. |
| Customer Support | Yes | Yes | No | App Functionality | `support_tickets`, `support_ticket_messages`, the live chat into the CRM inbox. |
| Other User Content | Yes | Yes | No | App Functionality; Product Personalization (Vera) | `posts`, comments, `event_rsvps`, `practice_logs`, `studio_draft`, Vera's memory `ai_member_context` ([`lib/ai/memory.ts`](../lib/ai/memory.ts)). |

### Browsing and Search History

| Apple type | Collected | Linked | Tracking | Purpose | Evidence |
|---|---|---|---|---|---|
| Browsing History | No | n/a | No | n/a | Only in-app page paths, which Apple counts as Product Interaction. Links to other sites are not recorded. |
| Search History | No | n/a | No | n/a | Queries are answered and not stored. `search.performed` exists in [`lib/analytics/events.ts`](../lib/analytics/events.ts) but nothing emits it; recorded paths drop the query string ([`lib/analytics/observe.ts`](../lib/analytics/observe.ts)). |

### Identifiers

| Apple type | Collected | Linked | Tracking | Purpose | Evidence |
|---|---|---|---|---|---|
| User ID | Yes | Yes | No | App Functionality; Analytics | The profile id. Sent to Google Analytics as `user_id` on server-side events, only with analytics consent ([`lib/analytics/ga-server.ts`](../lib/analytics/ga-server.ts), [`lib/analytics/track.ts`](../lib/analytics/track.ts)). Used as a rate-limit key in Upstash ([`lib/rate-limit.ts`](../lib/rate-limit.ts)). |
| Device ID | Yes | Yes | No | App Functionality | A web push subscription (`push_subscriptions.endpoint`, keys, `user_agent`) ([`components/push/actions.ts`](../components/push/actions.ts)). No IDFA; the native app will add an APNs device token in the same role. |

### Purchases

| Apple type | Collected | Linked | Tracking | Purpose | Evidence |
|---|---|---|---|---|---|
| Purchase History | Yes | Yes | No | App Functionality; Analytics | `commerce_orders`, `event_tickets`, `financial_transactions`, `supporter_contributions`, plan state on `profiles`. A purchase reaches Google Analytics as `purchase` with consent. |

### Usage Data

| Apple type | Collected | Linked | Tracking | Purpose | Evidence |
|---|---|---|---|---|---|
| Product Interaction | Yes | Yes | No | Analytics; Product Personalization | `interaction_events` (member-tied, analytics consent only, purged after 90 days, [`lib/consent/retention.ts`](../lib/consent/retention.ts)); `engagement_events`, `zap_transactions`, `gem_transactions`. Google Analytics with consent. |
| Advertising Data | No | n/a | No | n/a | No ads. |
| Other Usage Data | Yes | No | No | Analytics | Vercel Web Analytics page views, cookieless ([`app/layout.tsx`](../app/layout.tsx)). |

### Diagnostics

| Apple type | Collected | Linked | Tracking | Purpose | Evidence |
|---|---|---|---|---|---|
| Crash Data | Yes | No | No | App Functionality | Sentry error reports; no `setUser`, default PII off ([`lib/observability/sentry.ts`](../lib/observability/sentry.ts), [`instrumentation.ts`](../instrumentation.ts)). |
| Performance Data | Yes | No | No | App Functionality; Analytics | Web vitals stored with `profile_id` null ([`app/api/vitals/route.ts`](../app/api/vitals/route.ts)); Sentry traces sampled at 10% in production. |
| Other Diagnostic Data | No | n/a | No | n/a | |

### Surroundings, Body, Other

| Apple type | Collected | Linked | Tracking | Purpose | Evidence |
|---|---|---|---|---|---|
| Environment Scanning | No | n/a | No | n/a | The QR scanner decodes camera frames on the device and uploads nothing ([`components/scan/scanner.tsx`](../components/scan/scanner.tsx)). |
| Hands, Head | No | n/a | No | n/a | |
| Other Data Types | Yes, optional | Yes | No | App Functionality; Product Personalization | Match preferences (connect intent, romance opt-in, astrology opt-in, birth date); SMS consent evidence (`sms_consent.ip_address`, `user_agent`); consent history `consent_records`. |

---

## 2. Who receives it (processors)

Every processor the code calls, what it gets, and the file. The public policy names each one that
receives member data.

| Processor | What it receives | Evidence |
|---|---|---|
| Supabase | Everything stored: database, Storage files, Auth. The `embed` Edge Function runs inside it, no outside vendor. | `@supabase/*`, [`lib/ai/embed.ts`](../lib/ai/embed.ts) |
| Vercel | Every request (IP, user agent); Web Analytics page views; the AI Gateway when `AI_GATEWAY_URL` is set. | `vercel.json`, `@vercel/analytics`, [`lib/ai/client.ts`](../lib/ai/client.ts) |
| Anthropic | Prompts built from member text, Vera memory, card and poster photos, Loom images for tagging, help questions, a few CSV rows for import mapping. | `@anthropic-ai/sdk`, [`lib/ai/client.ts`](../lib/ai/client.ts), [`lib/ai/vera/agent-claude.ts`](../lib/ai/vera/agent-claude.ts), [`lib/crm/import/ai.ts`](../lib/crm/import/ai.ts) |
| Sentry | Errors, request URL and context, browser and device, sampled traces. Inert without a DSN. | `@sentry/nextjs`, [`lib/observability/sentry.ts`](../lib/observability/sentry.ts) |
| Twilio | Phone number and message body. Fail-closed until A2P registration and the operator switch. | [`lib/comms/sms-send.ts`](../lib/comms/sms-send.ts) |
| Resend | Email address, name, message; inbound replies. | `resend`, [`lib/email.ts`](../lib/email.ts) |
| Stripe | Card and bank details (entered on Stripe), customer and Connect accounts; the customer is deleted with the account. | `stripe`, `@stripe/*`, [`lib/account-erasure.ts`](../lib/account-erasure.ts) |
| Upstash | IP address or account id as a sliding-window counter key. | `@upstash/*`, [`lib/rate-limit.ts`](../lib/rate-limit.ts) |
| Google | OAuth sign-in; People API contacts (read-only); Analytics (client with consent, server mirror with `user_id` and consent); Maps JS and Places (server key); Wallet pass when configured. | [`lib/integrations/google/people.ts`](../lib/integrations/google/people.ts), [`lib/consent/cookie-consent.ts`](../lib/consent/cookie-consent.ts), [`lib/events/google-places.ts`](../lib/events/google-places.ts), [`lib/wallet/google.ts`](../lib/wallet/google.ts) |
| OpenFreeMap | Map tile requests from the browser (IP). | [`lib/maps/provider.ts`](../lib/maps/provider.ts) |
| Photon (Komoot) | Typed place text from the browser (IP). | [`lib/geocode.ts`](../lib/geocode.ts) |
| OpenStreetMap Nominatim | Typed address text, from our server. | [`lib/events/nominatim.ts`](../lib/events/nominatim.ts) |
| ipapi.co | The browser's IP, to return an approximate point. | [`lib/geolocation.ts`](../lib/geolocation.ts) |
| Recraft | A cover prompt: the entity type, title (120 chars) and summary (240 chars). | [`lib/loom/recraft.ts`](../lib/loom/recraft.ts), [`lib/loom/cover.ts`](../lib/loom/cover.ts) |
| Browser push services | An encrypted payload (RFC 8291) the service cannot read. | `web-push`, [`lib/push.ts`](../lib/push.ts) |
| Healthchecks | Cron job names and outcomes only. No member data, so not in the policy. | [`lib/observability/cron-heartbeat.ts`](../lib/observability/cron-heartbeat.ts) |
| Brave Search | Business names an operator imports. No member data, so not in the policy. | [`lib/ai/web/index.ts`](../lib/ai/web/index.ts) |

---

## 3. Age rating inputs

The questionnaire in App Store Connect words its questions its own way; these are the facts to
answer it with. Confirm each against the live questionnaire when filing.

- **Minimum age.** The terms require members to be 18 or older ([`app/terms/page.tsx`](../app/terms/page.tsx)). The rating should not be below that; 18+ is the consistent answer.
- **User-generated content.** Yes: posts, comments, messages, rooms, events, profiles, photos. Members can report content and block members (web today: [`app/(main)/feed/report-actions.ts`](../app/(main)/feed/report-actions.ts) and [`lib/blocking.ts`](../lib/blocking.ts)). The zero-tolerance terms clause, a community guidelines page, and in-app report and block for the native app are LIVE-723.
- **Messaging and chat.** Yes: direct messages and room chat between members.
- **Meeting in person and romance.** Yes: events are in person, and an opt-in romance lane pairs mutual opt-ins with meet-safely guidance ([`components/feed/romance-strip.tsx`](../components/feed/romance-strip.tsx)). No swipe mechanics.
- **Unrestricted web access.** Yes: member profiles, events and posts carry links to any site, and embeds (YouTube, Vimeo, Spotify, SoundCloud and others) load third-party pages.
- **Location sharing.** Approximate only, between members; exact points are never shown.
- **Health or wellness topics.** Yes: breathwork, meditation, and similar practices. No medical treatment is offered; a curator can run an advisory screen of a member-proposed practice for health claims before approving it ([`lib/ai/practice-publish-screen.ts`](../lib/ai/practice-publish-screen.ts)).
- **Gambling, contests, lotteries.** None. Zaps and Gems are earned by taking part and Gems are spent in the Vault Store on cosmetics and perks ([`docs/REWARDS-ECONOMY.md`](REWARDS-ECONOMY.md)); the code has no path that sells them for money or pays them out.
- **Advertising.** None.
- **Violence, sexual content, profanity, alcohol or drugs, horror.** Not product content. Anything members post is governed by the terms and moderation above.
- **Parental controls and age assurance.** None in the product; the 18+ terms are the gate.
