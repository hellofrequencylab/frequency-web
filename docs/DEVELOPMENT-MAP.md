# Development Map: the single source of truth

> **What we're building, in what order.** This is the one canonical plan. It **supersedes
> and folds in** the two previous trackers, [`ROADMAP.md`](../ROADMAP.md) (product features)
> and [`BUILD-PHASES.md`](BUILD-PHASES.md) (architecture phases), which are now thin
> pointers kept for history. Mission → structure → staged build list.
>
> **Authority order (unchanged):** running code + `supabase/migrations/` > this doc >
> Notion. Where this names something not yet built, the code is still the truth.
>
> Companions: [PLATFORM-VISION.md](PLATFORM-VISION.md) (the *why* of the two-entity model)
> and [DECISIONS.md](DECISIONS.md) (ADR-029→036, the irreversible seams). Updated 2026-06-03 ·
> ADR-071–075 (open beta, admin IA redesign, onboarding→Vera handoff, activation instrumentation).
>
> **2026-06-02:** the in-app design overhaul shipped (foundation kit + shell adoption + dashboard/
> admin cohesion sweeps, PRs #81–93, ADR-061) — see [REDESIGN-INAPP.md](REDESIGN-INAPP.md) for status
> + the remaining backlog. A 4-agent review pass reconciled the docs + deduped (PR #94).
>
> **2026-06-03:** the focused design round began (Feed content pass, PR #95), and the **AI marketing
> operator's first wedge — "The Market Read"** shipped under Studio (vertical 11): outbound
> acquisition, live signal → named pain points → brand-voice drafts, deterministic for now with the
> live-Claude operator slotting in behind it (PR #96). Plan of record: [MARKETING-AI.md](MARKETING-AI.md).
>
> **2026-06-04:** **QR Studio** shipped — vertical 3's authoring layer. The `nodes` engine
> (capture → ledger → zaps → `practice.verified` / partner redemption) was already built; this
> adds in-app code authoring (`/admin/qr`, host+), server-side QR image rendering (`lib/qr/`,
> `qrcode` dep), a same-site-only `/api/qr` download endpoint, and a member personal connect
> code at `/codes` — no migration. Closes part of vertical 3's 🟡 wiring (ADR-088).
>
> **2026-06-05:** QR platform **Phase 1 — dynamic links + analytics** (ADR-089). New `qr_codes`
> entity: retargetable `/q/<slug>` codes that redirect to any URL *or* run an earning node (the
> "Both" model), a scan log (`qr_scans` + `record_qr_scan` RPC), and a Studio analytics tab.
> Migration `20260605010000` applied to prod. Roadmap: Phase 2 beautiful editor → Phase 3
> per-member referral/action codes → Phase 4 challenges/campaigns.
>
> **2026-06-05:** QR platform **Phase 2 — beautiful editor** (ADR-090). Isomorphic styled SVG
> renderer (`lib/qr/render-styled.ts`) over the QR matrix — brand colors/gradients, module & eye
> shapes, center logo, CTA frame — driven by a live-preview editor in the dynamic-links Studio and
> persisted to `qr_codes.style`. No new dependency, no migration. Next: Phase 3 per-member codes.
>
> **2026-06-05:** QR platform **Phase 3 — per-member codes** (ADR-091). Every member gets three
> editable personal codes (connect / referral / gift-a-zap, `qr_codes.purpose`), restyled on
> `/codes`; the `/q` resolver is now a route handler with an `action` destination type; referral
> attribution (`profiles.referred_by_profile_id`, set at onboarding) rewards the referrer, and a
> gift-a-zap confirm flow (`/g/[slug]`) awards the owner. Migration `20260605020000` applied to prod.
> In flight next (owner request 2026-06-05): editor v2 (more themes, all shapes, connected
> rounded-end modules), crew marketing-funnel codes (≤3, circle/event), and a Google-Analytics tie-in.
>
> **2026-06-05:** QR **editor v2** (extends ADR-090) — added the **connected** module shape
> (adjacent modules merged into rounded-end run bars), independent eye-**frame**/**pupil** shapes,
> and expanded to **9 preset themes**. Renderer-only (`lib/qr/render-styled.ts` + `style.ts`), no
> migration. Next: crew marketing-funnel codes, then the Google-Analytics tie-in.
>
> **2026-06-05:** QR **crew marketing codes** (ADR-092). Crew members create up to **3** funnel
> codes (owner + `purpose IS NULL`) pointing at a circle/event they promote, styled + scan-tracked,
> managed on `/codes`. No migration.
>
> **2026-06-05:** QR **Google-Analytics deep tie-in** (ADR-093) — completes the 2026-06-05 batch.
> Server-side GA4 mirror (Measurement Protocol, `lib/analytics/ga-server.ts`) wired into `track()`,
> so QR funnel events (`qr.scanned` / `qr.referral_signup` / `qr.gift_zap` / `qr.code_designed`) reach
> GA4 even when the scan redirects off-site — alongside the existing client `gtag` mirror + internal
> `qr_scans`. Inert until `NEXT_PUBLIC_GA_MEASUREMENT_ID` + `GA_API_SECRET` are set in prod. No migration.
>
> **2026-06-05:** QR platform **Phase 4 — campaign challenges** (ADR-094). Scavenger hunts on the
> existing gamification engine: a campaign is a `season_challenges` row (criteria `qr_scan` + target N)
> scoped to a code set by one join (`challenge_qr_codes`); the `/q` resolver emits a `qr_scan` event
> (idempotent per code+member → distinct-code counting), `advanceChallenges` rewards on completion, and
> it shows on `/crew/challenges` automatically. Admin authoring = new **Campaigns** tab in the Studio
> (collect-all / collect-N + code picker). Migration `20260605030000` applied to prod.
>
> **2026-06-05:** QR Studio polish — dynamic links now build from a **curated in-site destination
> picker** (each option shows its funnel value; `lib/qr/destinations.ts`), and the logo editor gains
> **square/circle crop** + **color/gradient tint** (alpha-mask recolor for monochrome marks). Extends
> ADR-089/090, no migration.
>
> **2026-06-05:** QR polish backlog #1 — **referral-credit chaining**. The `/q` resolver now drops the
> `fq_ref` cookie for any anonymous scan of an **owner-owned** code (member codes + crew marketing
> funnels), so a funnel credits its owner on signup (attributed at onboarding). Extends ADR-091, no
> migration.
>
> **2026-06-05:** QR backlog #2 — **campaign time windows**. `season_challenges` gains
> `valid_from`/`valid_until` (migration `20260605040000`); the engine only advances a `qr_scan`
> challenge while within the window, and the Studio **Campaigns** tab authors start/end + shows a
> Scheduled / Active / Ended status. Extends ADR-094. Backlog remaining: consent-gate GA · styled-PNG.
>
> **2026-06-05:** QR backlog #3 + #4 — **consent-gated GA** (server mirror + client `ga-disable` flag
> respect the `analytics` consent scope, ADR-069/093) and **styled-PNG export** (`/api/qr?format=png`
> for styled codes rasterizes the design via `@resvg/resvg-wasm`, `lib/qr/raster.ts`, remote logos
> inlined, plain-PNG fallback; `serverExternalPackages` keeps the wasm out of the bundle). Backlog
> remaining: apply the styler to check-in nodes (#5).
>
> **2026-06-05:** QR backlog #5 — **styler on check-in codes**. `nodes` gains a `style` jsonb
> (migration `20260605050000`); the Studio's Check-in tab now has the full design editor + styled
> preview, and `/api/qr?node=<id>` serves styled SVG/PNG downloads. Member connect codes already
> ship a styled default (avatar). **Backlog complete** (#1–#5).
>
> **2026-06-05:** QR Studio **IA + dashboard redesign**. Moved to its **own host+ menu spot under
> Platform** (`/admin/qr`, a dedicated `qr` admin group + `admin-qr` rail entry). The dashboard is now
> a single scroll: a **generator at the top** (type selector → Dynamic link / Check-in, all options +
> design inline) with **categorized code lists below** (Dynamic links · Check-in · Member profile
> codes · Campaigns · Analytics). Member codes **consolidated to ONE** auto-generated profile code per
> member (it doubles as the referral code via owner-credit chaining); editable + download all formats
> on `/codes`. No migration.
>
> **2026-06-05:** QR **stats dashboard + scan locator map** (`/admin/qr/stats`, host+). Scans now
> capture coarse **IP-geo** (migration `20260605060000`: `qr_scans` city/country/lat/lng + extended
> `record_qr_scan`; the `/q` resolver reads the edge geo headers). The dashboard tracks the whole
> system: scan volume + funnel (referral signups, gifts), a **maplibre locator map** of where codes are
> scanned, the live code inventory (links / check-in / member / marketing / campaigns), top locations,
> and top codes. No precise GPS — city-level only.
>
> **2026-06-05:** QR **action destinations + time-aware** (the "3 wins", issue #221, migration
> `20260605070000`). A dynamic link can now **join a circle** (`destination_type:'circle'`) or **RSVP +
> verified-practice check-in to an event** (`'event'`) on scan — the `/q` resolver reuses `joinCircle`
> / `checkInEvent`; and a `url` code can **switch destination at a set time** (`switch_at` +
> `alt_target_url`). Authored in the dynamic-link form (Circle / Event pickers + time-switch).
> Applied to prod. Roadmap of further functions tracked in issue #221 (next: editable vCard + permissions).
>
> **2026-06-05:** QR **editable contact card / vCard with permissions** (issue #221, migration
> `20260605080000`: `profiles.vcard` jsonb). Members toggle "Save contact" on their profile code and
> pick exactly which fields it shares (photo + opt-in email/phone/org/title/website); the public
> `/people/<handle>/vcard` endpoint serves a `.vcf` of only those fields, surfaced as a **Save contact**
> button on the profile + a `/codes` editor. `lib/vcard.ts` (parse + build) is pure + tested.
>
> **2026-06-05:** QR Studio — **admin editing of member profile codes**. In the Member profile codes
> category, host+ operators can now restyle a member's code AND edit their contact card on their behalf
> (`member-actions.ts`; reuses `StyleEditor` + `VcardEditor`, which was parametrized by an `onSave`
> action so it serves both self-edit on `/codes` and admin edit). No migration.

> **2026-06-05:** QR Studio — **admin editing of campaigns + marketing codes** (closes the
> editability audit). Campaigns gained in-place editing (`updateCampaign` in `campaign-actions.ts`;
> the dashboard pre-fills name/goal/window/code-set and diffs `challenge_qr_codes`). Crew **marketing
> funnel codes** — previously member-only on `/codes` — now appear as their own host+ category in the
> Studio (`marketing-actions.ts` + `marketing-codes-admin.tsx`): operators can restyle, rename, **pause**
> (`active` toggle), or retire any member's code, with owner/target/scan context. Every code kind in the
> Studio is now editable in the admin section. No migration.

> **2026-06-05:** QR/NFC platform — **NFC parity** (ADR-105, migration `20260605120000`, issue #221).
> A **Web NFC writer** (`nfc-writer.tsx`, `NDEFReader`) lets operators program a physical tag with any
> code's URL straight from an Android phone (graceful "NFC (Android)" hint elsewhere) — on every code
> card: dynamic links, member, marketing, and check-in nodes. **Medium attribution**: a written
> dynamic-link tag encodes `?m=nfc` (`withMedium`), the `/q` resolver forwards it to `record_qr_scan`,
> and it lands on a new defaulted `qr_scans.medium` column (`'qr' | 'nfc'`). Analytics now split scans by
> channel with an **NFC taps** stat. Nodes carry their channel via their own `type`. No member-facing change.

> **2026-06-05:** QR/NFC — **per-code print sheets**. New host+ `/print/qr` route (outside the app
> shell) renders any code's styled QR print-ready in three layouts — foldable **table tent**, a 3×3
> **sticker sheet** with cut guides, and a wall **poster** — via `?code=`/`?node=` + `?layout=`. A
> **Print** link sits by the downloads on every code card. No migration.

> **2026-06-05:** QR/NFC — **location-aware earning** (ADR-106, migration `20260605130000`, issue #221).
> Surfaces the existing `nodes` proximity engine: a "Location-aware" toggle on the check-in form sets a
> geofence (lat/lng + radius, with "use my location"), written via a new `set_node_geo` RPC and read back
> via `nodes_geo()`. The `/n` claim flow now forwards `navigator.geolocation` to `captureNode`, so a
> geofenced code only earns on-site (`location_required` / `too_far` already surfaced). Device location is
> used at claim time only, never stored.

> **2026-06-05:** QR/NFC — **UTM / source passthrough** (ADR-107, migration `20260605140000`, issue #221).
> Each dynamic code gains an operator **`source_tag`**; an anonymous `/q` scan stamps it into the
> first-touch cookie (first-touch wins). New **`profiles.acquisition`** jsonb snapshots first-touch
> (utm/source/campaign/code/channel/landing) **once** at onboarding (`persistAcquisition`, best-effort),
> so a signup is permanently traceable to the poster that brought them — extends the ADR-095 attribution
> spine.

> **2026-06-05:** QR/NFC — **Google Wallet pass** (ADR-108, issue #221). Members get an "Add to Google
> Wallet" button for their profile code; `lib/wallet/google.ts` signs the Save-to-Wallet JWT with
> `node:crypto` (RS256, no new dependency). **Env-gated** (`GOOGLE_WALLET_*`): ships dark — the
> `/api/wallet/google` route 404s and the button hides until credentials are set. Ownership-gated. Apple
> Wallet deferred (needs the pkpass cert chain). Unverified end-to-end without real Google credentials.

> **2026-06-05:** QR/NFC round 2 (issue #221) — four more functions:
> • **Scarcity codes** (ADR-112, migration `20260605150000`) — nullable `nodes.max_claims`; `verifyCapture`
>   rejects with `capacity_reached` once N verified claims exist ("first N win"). Authored on the NodeForm
>   + an `N/max claimed` badge.
> • **Scannability guardrails** (ADR-113) — pure `scannabilityWarnings(style)` flags low contrast /
>   inverted / small quiet-zone / risky-logo as an advisory banner in the editor before printing.
> • **Acquisition analytics** (ADR-114) — `summarizeAcquisition` rolls up `profiles.acquisition` into an
>   **Acquisition** section on the stats page: channel + source rankings, QR-vs-NFC split, per-code
>   scan→signup conversion. Cashes in the ADR-104/107 data.
> • **Signed anti-spoof payloads** (ADR-115) — a "Require a signed code" toggle mints a `secret`; the code
>   URL carries `?s=` everywhere (QR/print/NFC), `/n` forwards it, `verifyCapture` rejects a mismatch — so
>   a forged `/n/<id>` can't claim. Pairs with location-aware earning.
>
> **2026-06-05:** **Entry Points & Campaigns** — the lead-funnel system (full spec `docs/ENTRY-POINTS.md`).
> Built on the QR/attribution/zaps rails above. Shipped across phases:
> • **Phase 1 — crew builder** (ADR-126, migration `20260606000000`): `/entry-points` — template → branded
>   QR + print-ready flyer (**vector SVG + high-res PNG**, bundled Liberation Sans) → capped create zaps +
>   owner credit on signup. `qr_codes.template_id/flyer/campaign_id`, `entry_campaigns`.
> • **Phase 2 — admin builder** (ADR-126): `/marketing/funnels` campaign builder; **2b** added
>   **assign-to-crew** + **template curation** (`entry_template_settings`). Remaining: Puck custom landings.
> • **Phase 3 — growth:** per-persona **nurture** drips (ADR-131, `nurture_*`, cron `/api/cron/nurture`);
>   **recruiter leaderboard + tiers** (ADR-134, `/crew/leaderboard?scope=entrypoints`); **segment broadcasts**
>   (persona segments seeded); **A/B testing** destinations with per-variant conversion (ADR-136,
>   `entry_point_variants` / `entry_point_conversions` / `qr_scans.variant_key`).
> Migrations `20260606000000`–`20260607030000` applied to prod + version-reconciled. Operator how-to in
> Notion (Training & Strategy → "Entry Points & Campaigns (lead funnels)").
>
> **2026-06-06:** **Navigation rebuild** (canonical in [IA-STRATEGY.md](IA-STRATEGY.md), phases 1–3) —
> the sidebar is now 5 worlds (Home · Practice · Community · The Quest) + axis-gated **Manage** groups
> (Steward · Structure · Studio · Platform); "Around You" rename, Programs → Leader training, contextual
> Hubs/Nexuses, mobile Manage folded into the avatar menu. **Active-Journey progress** (ADR-144):
> `getActiveJourneyProgress()` derives live Journey progress from `practice_logs` (cadence-based
> done-this-week + `circleCompanions`), surfaced on the `/crew/journey` Dashboard tab and the home
> `JourneyBoard` current-step line — realizes BACKLOG §Q, no migration. **Design-system cohesion**
> (ADR-147): shared in-app primitives (`components/ui/field`, `button`, `dialog`, `lib/utils` `cn`) + a
> named sub-xs type scale (`text-2xs`/`text-3xs` `@utility`) replacing the `text-[Npx]` anti-pattern, and
> token-only color (raw palette → DAWN tokens). **Admin dedup:** per-entity *editing* now lives on the
> page dock; the redundant `StaffEditButton` deep-link was removed from circle/hub/nexus pages.

> **2026-06-06:** **Game economy hardened to launch quality** (vertical 2, Stage A "Reward economy" →
> ✅). Reward currency now follows the act everywhere — online → Gems, real-life → Zaps — across base
> actions *and* the meta-layer (achievements/challenges/quests), fixing a leak that paid zaps for online
> milestones + an achievement double-award (ADR-139). Zaps got a real ledger (`zap_transactions`),
> powering the Vault **"how you earned" points log**. Journeys (the gamified `quest_chains`) became
> **join-gated + Pillar-tagged** with a real `/crew/quests` browse/start surface; the **member zap-rate**
> and the **endorsement layer** (rank shown only for Crew) landed gated/inert-in-Beta (ADR-140/141); the
> Store gem balance now nets spend. Migrations `20260607040000`–`20260607070000` applied to prod.
>
> **2026-06-06:** **The Studio** — the DIY journey builder shipped as the first instance of a reusable
> creation window (ADR-142), closing the last open ECONOMY item (§7.5). Best-practice plan to bring
> circles/practices/events onto the same shell — **compose, don't configure** — is ADR-143 /
> [STUDIO.md](STUDIO.md): a shared shell + a studio *kit* + a thin registry, one entity per follow-on PR.
> Migration `20260607080000` applied to prod. Audit + remaining gamification backlog: [GAMIFICATION-AUDIT.md](GAMIFICATION-AUDIT.md).
>
> **2026-06-06:** **Progress-driven disclosure** — strong streaks + a stage spine that reveals the
> product gradually. (1) A real **daily practice streak** (consecutive days with a logged practice)
> is now the headline streak, derived live from `practice_logs` with working **freeze tokens**,
> milestone **zap rewards**, and an at-risk nudge — fixing the bug where weekly counts rendered as
> "X day streak" (ADR-145, `lib/practice-streak.ts`). (2) `getMemberProgress()` folds activation +
> streak + Journeys + rank into a five-rung **stage** (Newcomer → Anchor); the home feed reveals more
> panels as the stage climbs, with a stage strip + one-time "stage reached" moment (ADR-146,
> `lib/member-progress.ts`). Left nav stays fully visible (owner decision). No migration — both derive
> from existing data + a `profiles.meta` marker.
>
> **2026-06-06:** **Embedded admin console** — the `/admin` catalog is being absorbed into the page
> itself (ADR-133/137/138/149, [EMBEDDED-ADMIN.md](EMBEDDED-ADMIN.md)). Hit **Edit** on a page you
> steward and a drill-down settings **console** (`components/admin/sidebar/admin-console.tsx`) opens
> in the `PageAdminDock`, its categories driven by the role-gated catalog so tiers auto-filter — no
> trip to `/admin`. **16 surfaces ported in place** (each a loader + gated `'use server'` action + a
> module reusing the existing admin UI): Moderation, Broadcasts, Gamification, Crew tasks, Members,
> Roles, Insights summary, QR generator, Demo, AI controls, Vera config, Circles, Channels, Events,
> Hubs, Nexuses. Remaining: the read-only Insights dashboards + Help gaps, then the server-composed
> `@admin` slot — and `/admin/*` retires. Operator guide synced to Notion.
>
> **2026-06-06:** **Quest/Journey hierarchy** (ADR-152) — canonical model **The Quest → Seasonal
> Quest → Journeys → Practices**, all **free** (reverses the ADR-150 "one concept" detour and
> ADR-087's paywall). *Phase A* restored "Quests" as the distinct seasonal concept + removed every
> Journey paywall. *B1* added the data nesting: a `quests` container table +
> `journey_plans.quest_id`/`official` + a seed (the active season's Quest with one official Journey
> per Pillar), migration `20260608010000`. *B2* rebuilt `/crew/quests` to list the Seasonal Quest →
> its official Journeys (each → the Journey detail's practices + free Adopt; `lib/quests.ts`).
> Remaining: B3 (retire the legacy `quest_*` action-chains + `advanceQuests` + terminology pass).
>
> **2026-06-06:** **Admin gets three layers** (ADR-153) — whole management suites were too much for
> the narrow sidebar. Admin is now: ① the **catalog spine** (`admin/sections.ts`, one declaration per
> surface); ② **nine full-page suites** — *Spaces · Engage · Comms · Safety · Reach · People ·
> Insights · Vera · System* — each a full page whose links are its **top-bar sub-nav tabs** (and a
> launchpad section), telescoped by role; ③ the **per-page sidebar console**, trimmed to **light
> page-globals** (Basics, Layout, this page's Stats + QR) that **link back to each surface's parent
> suite + sub-items**. Regrouping the catalog updated the sub-nav + launchpad for free; the sidebar
> trim follows. The sidebar *tunes the page*; the suite *manages the domain*.

---

## Mission (locked)

> **Shared interests into real-world community: a free global mission, a game that drives
> people offline, and physical spaces where it lives.**

Frequency turns shared interests into real-world community, ending the isolation of
connection lived only through a screen. A free, worldwide **Foundation** gives anyone a
place to gather around what they love; a game rewards the things that actually build
community: showing up, inviting strangers, backing local life; and **Labs** builds the
physical third spaces, sustained by commerce, where it all takes root. One community, one
game, two engines.

**North Star, Weekly Active Members (WAM):** members with ≥1 `practice.verified` in a
rolling 7 days. Every stage optimizes for this one number.

---

## The structural inventory

Five layers. Only one of them is "verticals"; the rest is the substrate everything sits on.

### Substrate
- **2 legal entities:** **Foundation** (nonprofit, 501c3) · **Labs** (for-profit).
- **3 rails:** **Community Graph** (shared, entity-blind) · **Game Ledger** (shared,
  entity-blind) · **Financial Ledger** (hard-partitioned by entity). Money never
  commingles; points are not money; points are entity-blind, every dollar is entity-tagged.
  (ADR-029.)

### Identity: 3 orthogonal axes
- **Trust ladder**: `member < crew < host < guide < mentor < janitor` (the worldview; stays 6).
- **Staff/ops role**: `team_members` (owner/admin/marketer/analyst). (ADR-027.)
- **Persona / hats**: multi-select set, each with verification state + (if money) a Stripe
  Connect binding. Growth happens here, not by inflating the trust ladder. (ADR-030/034.)

### Horizontals (the shared engine every vertical rides)
| Horizontal | State |
|---|---|
| Capability resolver + role ladder (`lib/core`) | ✅ |
| Contract / view-models (`lib/contract`) | ✅ |
| Engagement spine (`engagement_events`) | ✅ |
| Comms spine + durable queue | ✅ |
| Geo / PostGIS | ✅ |
| Trust & safety (moderation; +blocking, deletion, reviews) | 🟡 |
| **Payments + financial ledger (Stripe Connect)** | 📐 |
| **Module registry** (verticals declare into it) | 🟡 |
| Design tokens | ✅ |
| **Website Membership / tiers** (resolver input + `/upgrade`; generalizes `crew`) | 🟡 |

### Verticals (13): lines of business, each a registry module
Legend: ✅ built · 🟡 partial · 📐 designed only.

| # | Vertical | Entity | What it is | State |
|---|---|---|---|---|
| 1 | **Community** | Foundation | circles, events, interests, feed, messaging, social graph | ✅ |
| 2 | **The Game** | shared | gems/zaps, ranks, seasons, the circle-lifecycle rewards | ✅ · 🟡 economy |
| 3 | **Physical World** | shared | QR/NFC/ghost nodes, captures, PostGIS | ✅ · 🟡 wiring |
| 4 | **Programs** | Foundation | frameworks + trainings to start/run/maintain a circle; lifecycle gamification (start→activate→invite→attend). The mission's activation engine. | 🟡 content |
| 5 | **Local Marketplace** | Foundation · **no fee** | geolocated goods swap/sell/offer; anti-consumerism, local mutual support. Likely **no in-app payment** (arrange offline, FB-Marketplace-local style). | 📐 |
| 6 | **Donations & Grants** | Foundation | nonprofit funding rail (one-time + recurring) | 📐 |
| 7 | **The Collective** | Labs | members apply to contribute and host **paid** meditations/courses (Insight-Timer model); Connect payouts | 📐 |
| 8 | **Partners** | Labs | local business directory, offers, plaques, redemptions | ✅ · 🟡 |
| 9 | **Affiliate** | Labs | referrals + commission payouts | 📐 |
| 10 | **Lab Spaces** | Labs | gym-style SaaS for a worldwide network of physical facilities: packages, subscriptions, marketing, booking. **Lab membership lives here.** | 📐 *later* |
| 11 | **Studio** | ops | CRM, campaigns, automations, analytics, agent | 🟡 |
| 12 | **Marketing & Acquisition** | ops | public site, beta funnel, page CMS | ✅ |
| 13 | **Moderation & Admin** | ops | trust/safety console, community admin | ✅ |

### Surfaces (delivery channels: not verticals)
- **Web app** ✅ · **Public discover/SEO** ✅ · **Mobile (Expo/RN)** 📐, the eventual *primary doorway*.

### Membership rollup (the one cross-layer rule)
**Website membership** (horizontal, freemium tier) and **Lab membership** (inside vertical
10) are separate products. An **active Lab membership rolls in all website tiers**: the
physical membership is the apex. One-directional (website paid ≠ Lab access). Implemented as
the subscription-as-bridge entitlement (ADR-035): Lab subscription → entitlement → the
resolver treats it as superseding the website paid tier.

---

## Where we are (honest status)

In the old phase tracker we are at **end of Phase 7**. The web platform + growth engine is
substantially built and live-capable; **everything that moves money, the two-entity layer,
personas, and the mobile app are greenfield.**

- **✅ Done:** Foundations/seams (Phase 0), Web IA + 3 templates (Phase 1), Gamification +
  physical backbone (Phase 3), Marketing site + beta funnel + CMS (Phase 7), most of
  CRM/Studio (Phase 6).
- **🟡 Partial:** reward *economy* (amounts), `practice.verified` sources, RLS convergence
  (Phase 2), live-Claude agent + autonomy, partner redemption-on-capture, apex cutover.
- **📐 Not started:** money foundation (entities, ledger, Connect, personas), Programs,
  Local Marketplace, The Collective, Affiliate, Lab Spaces, Donations, Mobile.
- **⏸ Deferred (correct):** scale hardening (Phase 4), metric-driven, not calendar-driven.

---

## The staged build list

Sequenced per the owner decisions (2026-05-31): **harden current → launch a free Beta →
prove PMF → then mobile + money in parallel → then money verticals.** During the free Beta
**no money moves**, which is why the whole money/entity layer is parallel infrastructure,
not a blocker. State: `[ ]` pending · `[~]` in progress · `[x]` done.

### Stage A: Harden to a launchable Free Beta  ·  *close the 🟡s*
**Goal:** a stranger can sign up → find/join a circle → attend → earn → and WAM is measured,
on the real domain. **Depends on:** nothing (all in-codebase closeouts).

- [~] **Reward economy**: set gem/zap amounts, `nodes.zaps_value`, and a `seasons` table +
      config UI (old ROADMAP P2.10). The game already runs; this gives it real numbers.
      *Done:* `zap_config` table (migration `20240227000000`) brings zaps to parity with
      `gem_config`; `awardZapsForAction` reads it; real values seeded. `seasons` table
      (migration `20240229000000`) gives seasons identity (number, name, dates, status);
      `reset_season` now advances them; admin "end season" control on `/admin/gamification`.
      Member-facing **season banner + live countdown** shipped on `/crew` (2026-06-02):
      `app/(main)/crew/season-banner.tsx` reads `getCurrentSeason()`, shows season number/name/
      theme, and a hydration-safe live "Nd Nh left" countdown when a season has an end date
      (else "Ongoing"). **Live amount-editing UI** shipped (2026-06-02): janitor-only reward-economy
      editor on `/admin/gamification` (`reward-config.tsx` + `reward-actions.ts`) tunes per-action
      zap/gem amount, daily cap, and on/off — written to `zap_config`/`gem_config`, which the award
      engines already read at grant time, so changes are live with no redeploy. Reward economy ✅.
- [~] **Complete `practice.verified` sources**: logged practice + verified node check-in +
      event attendance check-in (old P2.13). The North-Star event must fire from every
      real-practice path, not just event RSVP-checkin. *Done:* practices backbone
      (migration `20240228000000`: `practices` / `circle_practices` / `member_practices` /
      `practice_logs`) + `lib/practices.ts` (`logPractice` emits `practice.verified`,
      host-assigned + personal paths). UI shipped: `/practices` hub (adopt + log), circle
      "This week's practice" card (host sets, members log), nav entry, and node-capture
      now emits `practice.verified`; `/practices` shows a 14-day activity history; members
      and hosts can create custom practices. *Next:* verification layers (host/peer
      confirm) if desired.
- [~] **RLS convergence (Phase 2)**: migrate high-traffic read/write paths from
      admin-client → RLS + `SECURITY DEFINER` RPCs, with policy tests, surface by surface.
      *Surface 1 — notifications (2026-06-02, ✅ migration applied to prod):* migration
      `20240307000000_notifications_rls_convergence.sql` adds an UPDATE-own policy + the
      `my_notifications` / `my_unread_notification_count` DEFINER read RPCs (the RPC pattern is
      needed because the read joins the actor profile, which the `profiles` policy hides from
      sub-crew/cross-region viewers). `app/(main)/notifications/actions.ts` now runs on the
      user-scoped client; the row→view-model mapper is unit-tested (`lib/notifications-map.test.ts`)
      and SQL isolation checks are in the migration footer. **Pattern + deploy-ordering rule:
      ADR-056.** ⚠️ **Apply the migration (`supabase db push`) + regen types BEFORE this code
      deploys** — the code calls the new RPC/policy, so shipping it first degrades notifications
      (empty list, mark-read no-ops) until applied.
      *Surface 2 — friendships (2026-06-02, ✅ migration applied to prod):* migration
      `20240308000000_friendships_rls_convergence.sql` adds the `my_friendships` DEFINER read RPC
      (same restricted-`profiles`-join reason); `app/(main)/friends/page.tsx` now runs on the user
      client, bucketing logic unit-tested (`lib/friendships-map.test.ts`). Friendship write policies
      already exist, so friend-actions can converge later with no new migration.
      ✅ **Both migrations applied to prod 2026-06-02** (`db push`), types regenerated, prod
      verified (no regression on the live app). Shipped in PR #63.
      *Surface 3 — main feed (2026-06-02, ✅ migration applied to prod):* migration
      `20240309000000_feed_rls_convergence.sql` adds the `feed_for_viewer` DEFINER RPC. The whole
      reach model (public + group-in-my-circles + cluster-via-hub/tuned-channel) — previously
      re-implemented in `components/feed/feed-list.tsx` over the admin client — now lives in SQL,
      reusing the same `get_my_circle_ids`/`get_my_hub_ids`/`get_my_tuned_channel_ids` helpers the
      posts RLS policy uses, for ALL roles (the crew+ posts policy would otherwise drop a member's
      own circle posts). Returns author public fields + reactions safely. FeedList's main branch now
      runs on the user client; ranking extracted to `lib/feed-rank.ts` (unit-tested). *Scope:* main
      feed only.
      *Surface 4 — feed DETAIL mode (2026-06-02, ✅ migration applied to prod):* migration
      `20260602194223_feed_detail_rls_convergence.sql` adds the `scoped_feed_for_viewer` DEFINER RPC
      (same reach predicate as surface 3, constrained to the requested scope ids). The circle/channel
      detail FeedList (`showPublicLayer=false`) previously read posts on the admin client filtered
      only by `scope_id` — with NO visibility check — leaking a circle's members-only ('group') posts
      to any visitor who could open the page. The RPC closes that: **a non-member now sees only a
      circle's PUBLIC posts** (owner-approved behaviour change), while members still get their
      group/cluster posts and channel forums (public) are unaffected. FeedList's detail branch runs on
      the user client. *Still on admin (follow-up):* the scope/dispatch/event metadata lookups.
      *Surface 5 — messages inbox + DM threads (2026-06-02, ✅ migration applied to prod):* migration
      `20260602195209_messages_rls_convergence.sql` adds the `message_peer_profiles` DEFINER RPC. The
      messaging tables already have membership-based SELECT policies (`am_participant` /
      `am_room_member`) + an UPDATE-own last_read policy, and `profiles` allows reading your own row —
      so the inbox (`messages/page.tsx`), DM thread (`messages/[id]/page.tsx`), and popover summary
      (`messages/popover-actions.ts`) reads + the mark-as-read write moved to the user client with NO
      behaviour change. The one thing RLS hides — the other DM participants' profiles — is hydrated by
      the RPC (public fields only, scoped to people the caller shares a conversation/room with). PRs
      #71 (surface 4) + #72 (surface 5). *Still on admin (follow-ups):* the **room thread**
      (`messages/r/[roomId]`) — its `room_messages` policy is members-only, so converging it changes
      the current non-member public-room message preview (a visibility decision, like circles); and the
      "new members in your circles" prompt in `page.tsx`.
      *Surface 6 — room thread (2026-06-02, ✅ migration applied to prod):* migration
      `20260602200701_room_thread_rls_convergence.sql` adds the `visible_room_member_profiles` DEFINER
      RPC. `messages/r/[roomId]/page.tsx` now runs on the user client: rooms_read / room_members_read
      / room_messages_read enforce who sees the room, its roster, and its (members-only) messages;
      member + author profiles are hydrated by the RPC (public fields, gated on the caller being able
      to see the room). Owner-approved behaviour change: **a non-member previewing a public room no
      longer sees its messages** — the page shows a "join to see the conversation" panel instead
      (members unaffected; the roster still shows for public rooms). *Still on admin (minor
      follow-ups):* the "new members in your circles" prompt + the feed's scope/dispatch/event
      metadata lookups — mechanical, no decision.
      **RLS convergence (Phase 2): the high-traffic read paths are now DB-enforced.**
- [x] **Partner redemption-on-capture**: plaque bump → discount + zaps logged to
      `partner_redemptions` (closes Phase 3 wiring). ✅ 2026-06-02 — verified wired end-to-end:
      `/n/[nodeId]` claim button → `claimNode` action → `captureNode` (`lib/engagement/capture.ts`
      step 5) logs a `partner_redemptions` row, surfaces the unlocked offer title, awards the
      node's `zaps_value`, and emits `practice.verified` for non-partner nodes.
- [x] **Live-Claude agent + consent test**: swap the deterministic proposer for the bounded
      Claude operator; add the `shouldSend` consent test; keep copilot-gated (closes 6.6).
      ✅ 2026-06-02 — `lib/studio/winback.ts`: `draftWinbackWithClaude` drafts win-back copy via
      the Anthropic SDK (`claude-opus-4-8`, JSON-constrained, cached system prompt) when
      `ANTHROPIC_API_KEY` is set, with a deterministic template fallback so nothing breaks
      without a key. `proposeWinbacks` now gates candidates by `shouldSend(*, 'email',
      'lifecycle')` *at proposal time* (not just at send), via the injectable `filterByConsent`.
      Still copilot-gated: the model only drafts a *proposed* action; a human approves before
      send. Consent + fallback unit-tested (`lib/studio/winback.test.ts`). Set
      `ANTHROPIC_API_KEY` in prod to enable live drafting (see LAUNCH.md).
- [x] **Trust & safety floor (ADR-036)**: first-class **blocking** + in-app **account
      deletion**. Shipped: `blocked_users` (migration `20240301000000`) + `lib/blocking.ts`
      (gates DMs both ways, unfriends on block); profile Block/Unblock button; account hard
      delete (`lib/account.ts`) + blocked-list management at `/settings/account`.
- [~] **Beta-experience polish**: map/proximity circle discovery (P3.14), profile richness
      (P3.16), @mention rendering + notifications (P3.17). *Done:* @mentions now fan out on
      replies too (shared `fanOutMentions` helper), completing P3.17; profiles surface
      verified practices + current streak (P3.16); **proximity discovery** shipped as a
      distance-sorted "Circles near you" (browser geolocation + haversine, no map dependency)
      (P3.14). *Optional later:* a visual map layer on top (deferred because a map widget
      can't be verified without a browser).
- [~] **Domain + owner config**: `frequencylocal.com` is **live** (DNS → Vercel; the app serves on
      the apex). Remaining owner steps: confirm the prod env vars (`CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`,
      `NEXT_PUBLIC_APP_URL`, `EMAIL_FROM`) + the Supabase/Google OAuth redirect URLs. Full runbook: [LAUNCH.md](LAUNCH.md).
- [x] **Admin IA redesign** (ADR-072/073): the `/admin` surface is now **one grouped catalog**
      (`app/(main)/admin/sections.ts`, five role-gated groups — Community/Structure/Insights/Vera/
      Platform) feeding a launchpad, a shared `requireAdmin` guard (`lib/admin/guard.ts`), and a shared
      `AdminPage`/`AdminSection` shell (`components/admin/admin-page.tsx`). Nav went **two-layer**: the
      left rail "Manage" carries the five admin categories (`NAV_AREAS` replaced the single `admin`
      area with `admin-community`/`admin-structure`/`admin-insights`/`admin-vera`/`admin-platform`),
      and the sub-nav shows only the active category's pages. No route moves, no gate change — just
      chrome + organization unified.
- [~] **Embedded admin console** (ADR-133/137/138/149 · [EMBEDDED-ADMIN.md](EMBEDDED-ADMIN.md)) — the
      successor to the catalog above: `/admin` is **absorbed into the page**. **Edit** opens a
      drill-down **console** in the `PageAdminDock` (`components/admin/sidebar/admin-console.tsx`),
      categories driven by the same role-gated catalog (tiers auto-filter; no `/admin` trip). **16
      surfaces ported in place** — Moderation · Broadcasts · Gamification · Crew tasks · Members ·
      Roles · Insights (summary) · QR generator · Demo · AI controls · Vera config · Circles ·
      Channels · Events · Hubs · Nexuses (each: a loader + gated action + a module reusing the existing
      admin UI; inlined pages were first extracted into a shared component). **Remaining, in priority
      order:** ① the read-only **Insights dashboards** (engagement full / intel / outcomes / AI read /
      segments) + **Help gaps** — embed a compact read or keep the deep-link per surface; ② the
      server-composed **`@admin` parallel-route slot** (move modules off the client on-open fetch);
      ③ the rest of the inline **tuning** layer (Layout, Vera-tone). Then `/admin/*` retires.
- [x] **Onboarding → Vera handoff + activation instrumentation** (ADR-074/075): induction now redirects
      to **`/onboarding/vera`** (the Vera concierge — the primary new-member path), with a feed
      first-run banner catching anyone who skips; the dead `/feed?intro=1` param is retired. The
      activation funnel is instrumented — `track()` emits `onboarding.induction_completed`,
      `onboarding.vera_opened`, `circle.joined`, `practice.adopted`, `profile.completed`, surfaced as a
      **New-member activation** funnel on `/admin/engagement`. See [ONBOARDING.md](ONBOARDING.md) +
      [AI-VERA.md](AI-VERA.md).

**Done when:** the loop above works end-to-end on `frequencylocal.com` and WAM is live on the
admin/analytics surface.

### Stage B: Free Beta + grow the mission  ·  *prove PMF, no money*
**Goal:** prove the practice-retention loop (PMF) and enrich the mission with the free
verticals that don't need the money foundation. **Depends on:** Stage A.

- [x] **Launch the free Beta** (ADR-071): the **self-serve beta is open** — "Join the Beta" →
      `/sign-in` → induction → real member (`BETA_CTA_HREF = "/sign-in"`, one switch in `lib/site.ts`);
      the `/beta` waitlist + `requestBetaAccess` are **parked** for the future gated weekly-cohort phase.
      *Instrumentation:* WAM + activation live on `/studio/analytics`; weekly practice-
      retention cohorts shipped there too (`getPracticeRetention`), the PMF lens. The **New-member
      activation funnel is ✅ live on `/admin/engagement`** (ADR-075: `onboarding.induction_completed`
      → `onboarding.vera_opened` → `circle.joined` → `practice.adopted` → `profile.completed` via
      `track()`), not just `/studio/analytics`.
- [x] **Member-driven circle creation** (the flywheel enabler): any signed-in member can
      start a circle around an Interest and become its host (was admin-only). Creator is
      auto-enrolled as host + member. Matches what the Programs guides teach.
- [~] **Programs (vertical 4)**: the circle start/run/maintain framework + training library,
      hubbed into the network, with lifecycle gamification. Free; deepens activation and the
      North Star directly. *Done:* content library shipped (`/programs` + `lib/programs.ts`,
      MDX-in-git, 4 seed frameworks: start a circle, run a gathering, grow/split, keep
      alive; reuses the help markdown renderer; nav entry). Progress tracking shipped (mark
      complete via the engagement ledger, no migration; per the guardrail, reading is tracked
      but not rewarded). Circle-lifecycle rewards shipped: starting a circle, activating it
      (first practice), and an accepted invite all award zaps through the ledger (attending
      already did). Credits live today; will land in the Vault for free users once the
      entitlement layer ships (ADR-037).
- [x] **Local Marketplace (vertical 5)**: Foundation, no fee, geolocated to circle/hub/nexus,
      listings + messaging (no in-app payment). Proves local exchange + feeds the density
      signal. *Shipped (ADR-148, migration `20260607090000`):* `market_listings`
      (offer/free/lend/request · free-text price · geo + optional circle anchor · status) with
      RLS; `/market` browse + `/market/[id]` detail + owner controls; create via the Studio
      window (`NewListingButton`, reuses the ADR-143 kit); contact hands off to the seller's
      profile/DMs (no stranger DMs, no payment). *Round-out (PR #347):* "near me" distance sort
      (`MarketGrid` + browser geolocation), listing edit on the Studio shell (`ListingBuilder`,
      per-field autosave), and image galleries — `images`/`lat`/`lng` carried through create + update.
- [x] **Density / demand read-model**: the "where to seed the next third space" surface off
      the place-tree (PLATFORM-VISION §6). *Shipped (ADR-151, migration `20260608000000`):* the
      `density_by_city` RPC joins supply (circles + capacity), realized demand (members in
      circles), latent demand (residents + 30-day arrivals), and local exchange (active
      listings) per city; `lib/analytics/density` scores each into a 0–100 Lab-readiness with a
      🌱 Seed → ⏳ Growing → ✅ Ready ladder + ⚠️ capacity-crunch flag (deterministic + unit-tested);
      surfaced at `/admin/expansion` (Insights, janitor). Doubles as grant-funder + expansion story.

**Done when:** PMF signal holds (a defensible WAM-retention curve), and the flywheel
(Programs → more circles → local exchange → density) is observable in data.

### Stage C: Two parallel tracks  ·  *post-PMF*
**Goal:** stand up the doorway and the money substrate at once, so neither blocks the other.
**Depends on:** Stage B (PMF). Build the money foundation *during* beta so it's ready when
the entities are legally live.

- **C1 · Mobile app (old Phase 5)**: Expo/RN on the proven contract + capability sets +
  tokens; native QR/NFC/geofencing/push; pilot a Postgres-backed sync engine on one surface.
- **C2 · Money foundation (the new substrate)**: pure infrastructure, nothing charges yet:
  - [ ] Entity partition + `financial_transactions` ledger, entity-tagged (ADR-029/032).
  - [ ] **Persona axis**: `profile_personas` (state + Connect binding) (ADR-030).
  - [ ] **Stripe Connect** payments module (`create_checkout`/`process_payout`/
        `record_commission`) (ADR-032).
  - [ ] **Module registry** formalized so verticals self-declare (ADR-033).
  - [ ] **Subscription-as-bridge entitlement** (ADR-035) + **store seams**: digital/physical
        flag, reviews/disputes (ADR-036).

**Done when:** mobile reaches relevant parity by *assembling* the contract; and a test
checkout + payout can run end-to-end in a sandbox with money correctly entity-partitioned.

### Stage D: Money verticals  ·  *switch on when entities are live*
**Goal:** turn on revenue, each vertical a registry module that ladders up to verified
practice (ADR-034). **Depends on:** Stage C2 + legally-live entities.

- [ ] **D1 · The Collective (vertical 7)**: *first commerce build.* Contributor application
      + verification → host paid offerings → Connect payout → digital/physical flag →
      practice-laddering. Exercises the entire money foundation; closest to the product's soul.
- [ ] **D2 · Freemium: free app + Vault + membership cash-in** (ADR-037): the game accrues
      for everyone into a persistent Vault, locked until claimed; game access is an
      entitlement (own membership / **host comp-grant** / Lab rollup / staff grant). The pay
      path is a Foundation membership (dues floor + pay-what-you-want donation tiers, game as
      a member benefit) carrying `entity` + `revenue_type` (ADR-031). Cash-in claims the
      Vault to gems + lifetime rank; seasonal play starts fresh. Generalizes `crew`; wires
      `/upgrade` + `/settings/billing`. Plus the **inter-entity Lab bridge** (ADR-038).
- [ ] **D3 · Affiliate (vertical 9)**: referral attribution → commission → payout ledger.
- [ ] **D4 · Donations & Grants (vertical 6)**: Foundation rail; independent of the for-profit
      Connect work, so it can land any time the Foundation is ready to accept money.
- [ ] **D5 · Lab Spaces (vertical 10)**: the gym-management SaaS + Lab membership + the
      rollup entitlement. The largest build; ongoing as the physical network grows.

**Done when:** revenue flows on the for-profit rail and donations on the nonprofit rail, each
reconciled per entity, with every vertical's high-value rewards tied to verified practice.

### Continuous: Scale hardening  ·  *metric-driven*
Connection pooling → read replicas → denormalized feed read-model + hybrid fan-out →
time-partition append-only tables → Broadcast realtime → Redis/search only on real signals.
Added against measured load, never speculatively. (old Phase 4 / SCALE-ARCHITECTURE.)

---

## Dependency map

```
 Stage A (harden) ─▶ Stage B (free beta + Programs + Marketplace, prove PMF)
                         │
                         ├─▶ C1 Mobile ───────────────┐
                         └─▶ C2 Money foundation ──────┴─▶ Stage D money verticals
                                                              (D1 The Collective first)
 Continuous: Scale (parallel, triggered by metrics)          D4 Donations can land anytime post-beta
```

**Gates:** Stage B waits on a launchable beta (A). Stage C waits on PMF (B). Stage D waits on
C2 **and** legally-live entities. The agent's *autonomy* (A) waits on its consent test. Money
verticals never ship a high-value reward that isn't tied to `practice.verified`.

---

## Open decisions (carried, not guessed)

1. **Which entity sells the Website paid tier** (charitable-purpose line), architecture
   supports either via `entity` + `revenue_type` (ADR-031). Legal picks before D2.
2. **Local Marketplace payments**: confirmed *no fee*; recommend *no in-app payment at all*
   (arrange offline). Revisit only if in-app peer payment is wanted.
3. **Inter-entity value flow**: for-profit→Foundation donation vs Foundation→for-profit
   services agreement. Architecture records audited inter-entity transfers regardless (ADR-029).
4. **Web's long-term role once mobile leads**: full parity vs lighter funnel (old TECH-STRATEGY).

---

## Where things live (doc map)

- **This doc**: what/when (the plan).
- [PLATFORM-VISION.md](PLATFORM-VISION.md), why (two-entity model, the seams).
- [DECISIONS.md](DECISIONS.md), ADRs (irreversible decisions + rationale).
- [OVERVIEW.md](OVERVIEW.md), mission + the whole-picture synthesis.
- [DEMO-SYSTEM.md](DEMO-SYSTEM.md), the Beta `is_demo` content layer + `demo_mode`
  switch, badge/recede UI, geolocation, and teardown (ADR-064/065).
- Domain/architecture detail, GLOSSARY, DATABASE, ARCHITECTURE, SCALE-ARCHITECTURE,
  ENGAGEMENT-ARCHITECTURE, CAPABILITIES-AND-MOBILE, COMMS-CRM-ARCHITECTURE.
- [ROADMAP.md](../ROADMAP.md) + [BUILD-PHASES.md](BUILD-PHASES.md), **superseded**, kept for
  history; their open items are folded into the stages above.
