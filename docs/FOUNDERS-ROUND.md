# Founders Round: the founding-member pre-sale (crowdfunding) build spec

> **What this is.** The plan of record for the Founders Round: a GoFundMe-style,
> Kickstarter-mechanics crowdfunding surface that raises seed capital from the owner's
> social following, friends, and supporters through the owner's **personal business
> PayPal** account. The money funds creating the nonprofit (Frequency Foundation), the
> legal work, and the first events and operations. It is the **pre-investor layer**: the
> community launches the platform for the community, by the community.
>
> **Authority order (unchanged):** running code + `supabase/migrations/` > this doc >
> Notion. Decision record: [DECISIONS.md ADR-358](DECISIONS.md). Companions:
> [PLATFORM-VISION.md](PLATFORM-VISION.md) (the two-entity model), [ROLES.md](ROLES.md)
> (tier vs role), [ECONOMY-AND-JOURNEYS.md](ECONOMY-AND-JOURNEYS.md) (free vs paid).
>
> **Status: 🔵 specified, not built.** Ships behind an env gate (`paypalEnabled()`),
> exactly like the dormant Stripe layer (`lib/billing/stripe.ts`). Nothing charges until
> PayPal keys are set. The migration is written but applied to prod by the owner via the
> Supabase SQL Editor (never `supabase db push`, per START-HERE house rules).

---

## 1. The one decision that shapes everything

Frequency is a **for-profit** business today (the owner's personal business), raising to
**create** the nonprofit. That single fact rules out running this as "donations":

| Constraint | Finding | Implication |
|---|---|---|
| 🔴 PayPal Campaign Fundraising terms | Prohibit offering any reward or perk in return for a contribution, and require registered-nonprofit status to use the Donate / fundraising product | We cannot use the Donate button or campaign-fundraising product |
| 🔴 For-profit tax reality | Money raised is taxable business income. Backers get no charitable deduction. "Donation" / "tax-deductible" is misleading | Never use "donation" or "tax-deductible" in copy |
| 🔴 FTC enforcement | Stated refund policies and use-of-funds claims are legally enforceable; non-delivery has triggered FTC bans | Deliver every promised perk; disclose plainly |
| ✅ The clean structure | Money exchanged for a membership or perk is a **sale** ("pre-sale", "pledge", "founding membership"), which fits PayPal Standard Checkout | Collect as ordinary commercial sales |

**So: build the GoFundMe feel (live tracker, milestones, backer feed, comments) with
Kickstarter language and mechanics (back, pledge, tiers, pre-paid memberships).** This is
not a workaround. The reward tiers literally are pre-paid memberships plus founder
recognition, which is a pre-sale by definition. The pitch is honest and stronger:

> The whole app is free for everyone. Help us launch it for real, and get founder
> recognition plus early membership perks.

This matters because the app genuinely is free (see §4): founders are not buying access
others lack. They are funding the launch and getting recognition plus a head start.

---

## 2. Locked configuration (from the owner Q&A, 2026-06-22)

| Decision | Choice |
|---|---|
| Funding goal | $10,000 to $25,000 (exact number set on the campaign row) |
| Timing | A straight 30-day public push with a hard deadline |
| Anchor perk | 1 year of paid membership (the `crew` tier) plus a lifetime founding rate-lock |
| Tier shape | A 4 to 5 tier ladder plus stackable add-ons |
| Price ladder | $25 / $60 / $150 / $500 (the named Founding Member tier anchored at the 1-year value) |
| Add-ons | Bonus Gems pack, gift a membership, an extra Space profile, time with the founder (call / AMA) |
| Recognition | Tiered founder badges plus a public Founders Wall, with opt-in anonymity |
| Momentum | Early-bird limited tier, live backer feed plus comments, stretch goals past the target (no match challenge) |
| Funds model | Keep what you raise, all sales final, perks delivered regardless |
| Placement | A public page at `/founders`, guest or member can back, plus an in-app banner for existing members |
| Use of funds | A clear breakdown with rough percentages |

---

## 3. What is free vs paid (so the copy stays honest)

Per [PLATFORM-VISION.md](PLATFORM-VISION.md) and [ECONOMY-AND-JOURNEYS.md](ECONOMY-AND-JOURNEYS.md),
the model is "everyone plays, only payers cash in." This is the truth the campaign copy
must reflect (CONTENT-VOICE skeptic test):

| Capability | Free (default `membership_tier='free'`) | Paid (`crew` / `supporter`) |
|---|---|---|
| Circles, channels, events, posts, messaging | ✅ | ✅ |
| Practices (log + personal tracker) | ✅ | ✅ |
| Journeys (adopt + complete) | ✅ | ✅ |
| Earning Zaps and Gems | ✅ full rate | ✅ full rate |
| Season ranks, Amplitude, streaks, leaderboards | ✅ accrue | ✅ accrue |
| Creating a Space / extra profile | ✅ (not gated today) | ✅ |
| Spending Gems in the Vault Store | ❌ | ✅ |
| Public rank badge (endorsement) | ❌ | ✅ |

The Founding Member perk grants the **paid tier** for a year (so they can cash in the
game from day one) plus the founder recognition that no later member can earn.

---

## 4. Architecture at a glance

Almost nothing here is conceptually new. It reuses the env-gated provider pattern, the
webhook + idempotency-table pattern, the `membership_tier` flag, and the service-role
write pattern the codebase already runs for Stripe and `space_donation_asks`.

| Layer | Choice | Mirrors |
|---|---|---|
| Payments | PayPal Standard Checkout, Orders v2 API, `intent: CAPTURE` (funds settle immediately) | new |
| Client SDK | `@paypal/react-paypal-js` (v6 line), buttons plus `enable-funding=venmo` plus Advanced Checkout card fields | new |
| Server SDK | `@paypal/paypal-server-sdk` (NOT the deprecated `checkout-server-sdk`) | new |
| Tracker truth | `PAYMENT.CAPTURE.COMPLETED` webhook adds, `PAYMENT.CAPTURE.REFUNDED` subtracts. Never count `APPROVED` | new |
| Env gate | `paypalEnabled()` returns true once keys are set; warn (not throw) at module load | `lib/billing/stripe.ts:40` `billingEnabled()` |
| Webhook idempotency | Claim the event `id` in `fundraise_webhook_events`; unique-violation = duplicate ack | `app/api/stripe/webhook/route.ts:35` + `stripe_webhook_events` |
| Order idempotency | A UUID `PayPal-Request-Id` on create and capture | new |
| Data writes | Service-role admin client in gated server actions; RLS on with no client policies | `lib/spaces/donations.ts` + `space_donation_asks` |
| Types | Untyped casts until `lib/database.types.ts` is regenerated (ADR-246) | `lib/spaces/donations.ts` |
| Pages | Public splash under `(marketing)`; admin under `(main)/admin`; pledge flow on a Focus surface | PAGE-FRAMEWORK |

---

## 5. Data model

A new `fundraise_*` family (generic enough to host future campaigns, including per-Space
campaigns via the nullable `space_id`). House style matches `space_donation_asks.sql`:
additive, idempotent (`create table if not exists`), RLS enabled with **no client
policies**, rich table and column comments, `set_updated_at()` triggers, applied to prod
by the owner via the SQL Editor.

### Tables

| Table | Purpose | Notable columns |
|---|---|---|
| `fundraise_campaigns` | One row per campaign (seed campaign slug `founders`) | `slug` (unique), `title`, `tagline`, `story`, `hero_media_url`, `goal_cents`, `currency`, `starts_at`, `ends_at`, `status` (draft\|live\|paused\|funded\|closed), `funds_model` (keep_all), `show_recent_backers`, `allow_comments`, `allow_anonymous`, `use_of_funds` (jsonb of `{label, pct, note}`), `raised_cents` (cached), `backer_count` (cached), `space_id` (nullable, NULL = platform), `created_by` |
| `fundraise_tiers` | The reward ladder | `campaign_id`, `sort_order`, `title`, `description`, `amount_cents`, `grants_membership_tier` (crew\|supporter\|null), `grants_membership_months`, `grants_gems`, `rate_locked`, `badge_slug`, `inventory_limit` (nullable), `claimed_count`, `is_early_bird`, `available_from`, `available_until`, `is_active`, `fulfillment_note`, `estimated_delivery` |
| `fundraise_addons` | Stackable upgrades | `campaign_id`, `sort_order`, `title`, `description`, `amount_cents`, `kind` (gems\|gift_membership\|extra_space\|time_with_founder\|custom), `grants_gems`, `grants_gift_membership_months`, `inventory_limit`, `claimed_count`, `is_active` |
| `fundraise_milestones` | Tracker markers and stretch goals | `campaign_id`, `threshold_cents`, `title`, `description`, `kind` (milestone\|stretch), `reveal_mode` (always\|on_previous_hit), `reached_at` (set when crossed), `sort_order`, `is_active` |
| `fundraise_pledges` | The tracker + backer feed source of truth | `campaign_id`, `tier_id` (nullable), `profile_id` (nullable = guest), `paypal_order_id` (unique), `paypal_capture_id`, `amount_cents`, `currency`, `status` (created\|approved\|completed\|denied\|pending\|refunded), `addons` (jsonb snapshot), `display_name`, `is_anonymous`, `comment`, `comment_status` (visible\|hidden\|flagged), `email`, `claim_token` (guest to account link), `is_early_bird`, `fulfilled_at` |
| `fundraise_webhook_events` | Idempotency (clone of `stripe_webhook_events`) | `event_id` (pk), `type`, `received_at` |
| `fundraise_updates` | Backer updates posts | `campaign_id`, `title`, `body`, `is_published`, `published_at`, `author_profile_id`, `notify_backers` |

### Aggregates

The live total is `sum(amount_cents) where status='completed'` minus refunds. Cache
`raised_cents` and `backer_count` on the campaign row, updated inside the webhook handler
(so the splash paints instantly without a scan). The backer feed reads completed pledges
ordered by `created_at desc`, indexed on `(campaign_id, status, created_at desc)`.

### Profile additions (membership fulfillment)

Additive `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` on `profiles`:

- `membership_paid_through timestamptz` (the granted-access expiry; webhook sets
  `greatest(existing, now() + months)`).
- `is_founding_member boolean default false`.
- `founding_rate_cents integer` (the locked monthly rate this founder keeps for life).

Optional audit table `membership_grants` (`profile_id`, `source`, `pledge_id`, `tier`,
`months`, `granted_at`, `expires_at`) if we want a full grant history rather than just the
denormalized expiry. Recommended for clean accounting; not required for MVP.

---

## 6. PayPal integration

### Flow (server-authoritative)

1. The splash renders PayPal buttons (`NEXT_PUBLIC_PAYPAL_CLIENT_ID`).
2. `createOrder()` calls `POST /api/fundraise/orders`: validates the tier, amount, and
   inventory, sends a UUID `PayPal-Request-Id`, creates an Orders v2 order with
   `intent: CAPTURE`, and writes a `created` pledge row.
3. The buyer approves in the PayPal popup.
4. `onApprove()` calls `POST /api/fundraise/orders/[orderId]/capture`.
5. **The webhook is the source of truth** (the client can drop). On
   `PAYMENT.CAPTURE.COMPLETED`: flip the pledge to `completed`, grant the membership /
   Gems / badge, increment `claimed_count`, evaluate milestones, queue the receipt email
   (Resend outbox), and update the cached aggregates. On `PAYMENT.CAPTURE.REFUNDED`:
   reverse.

### Webhook handler (`app/api/paypal/webhook/route.ts`, mirrors the Stripe route)

- `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`.
- Guard `if (!paypalEnabled()) return 503`.
- **Verify every event.** Either the `verify-webhook-signature` API, or offline RSA-SHA256
  over `transmission_id|transmission_time|webhook_id|crc32(raw_body)`. **Verify against the
  raw request body bytes** (re-serializing JSON breaks the CRC), so read `await req.text()`
  first, exactly as the Stripe route does.
- **Dedup** on the event top-level `id` via `fundraise_webhook_events` (unique-violation =
  duplicate ack). PayPal delivers at-least-once with no ordering guarantee and retries
  failed deliveries up to ~25 times over ~3 days, so return 2xx fast and process async.
- Cache the OAuth token (do not mint per call); honor `Retry-After` on HTTP 429.
- Skip IPN entirely (legacy; Website Payments Standard is end-of-life around Jan 2027).

### Env (the on-switch, mirrors the Stripe header comment)

```
PAYPAL_CLIENT_ID            — REST app client id (server)
PAYPAL_CLIENT_SECRET        — REST app secret (server only)
PAYPAL_WEBHOOK_ID           — the webhook id from the Developer dashboard (per env)
PAYPAL_ENV                  — 'sandbox' | 'live'
NEXT_PUBLIC_PAYPAL_CLIENT_ID — client id for the JS SDK (public)
```

Sandbox and live have separate apps and separate webhook ids. `paypalEnabled()` is true
once `PAYPAL_CLIENT_ID` + `PAYPAL_CLIENT_SECRET` + `PAYPAL_WEBHOOK_ID` are present.

### Fees (US, PayPal merchant schedule dated 29 Oct 2025; confirm live before launch)

| Method | Rate | Note |
|---|---|---|
| PayPal wallet checkout | 3.49% + $0.49 | The default path |
| Cards (Advanced Checkout) | 2.99% + $0.49 | |
| Venmo | 3.49% + fixed | US only, USD only |
| Confirmed-charity rate | 1.99% + $0.49 | ❌ Unavailable (needs 501(c)(3)) |

Plan the goal net of about 3.5% + $0.49 per pledge (a $100 pledge nets about $96). The
"2.2%" figure sometimes seen is Stripe's nonprofit rate, not PayPal's.

### ⚠️ Verify-before-build (PayPal blocks automated doc fetches; confirm in a browser)

- The exact current `@paypal/react-paypal-js` version (pin it; v10 made `environment`
  mandatory).
- The live fee PDF.
- Your account's Advanced Checkout eligibility (cards on-page).
- The 45-day `PayPal-Request-Id` idempotency window.

---

## 7. Membership fulfillment and the Stripe bridge

Stripe subscriptions are not live yet, but we do not need them to sell pre-paid years now:

- On a completed pledge whose tier grants membership, set `profiles.membership_tier='crew'`
  (the paid value, per `EntitlementTier` in `lib/core/entitlement`), set
  `membership_paid_through = greatest(existing, now() + months)`, set
  `is_founding_member = true`, and store `founding_rate_cents` (the locked rate).
- This never touches `community_role` (ADR-207 / ADR-225: `membership_tier` is the sole
  paid source of truth; the Stripe webhook already follows this rule at
  `app/api/stripe/webhook/route.ts:48`).
- When Stripe goes live, subscriptions take over renewals and extend from
  `membership_paid_through`. Fully additive, no refactor, consistent with the "additive
  later, never a refactor" posture in `space_donation_asks.sql`.

---

## 8. Pages and routes (composing the kit)

| Surface | Route | Template / chrome | Contents |
|---|---|---|---|
| Campaign splash | `/founders` (under `(marketing)`) | Public marketing landing built from `PageHeading` / `StatCard` / `SectionHeader` / `EntityCard` / `EmptyState` | Hero + founder story, live progress (`StatCard`: raised, %, backers, days left), suggested amounts, tier cards, milestone tracker, live backer feed + comments, updates, use-of-funds breakdown, risks + honest timeline, refund + not-tax-deductible disclosure, social share |
| Pledge / checkout | `/founders/back` | **Focus** (centered, no rail) | Tier select, amount (anchors + custom), add-ons, PayPal buttons (server create / capture) |
| Thank-you | `/founders/thanks` | **Focus** | What you unlocked, claim-your-account prompt for guests, receipt via Resend |
| Admin workspace | `/admin/fundraising` | **Dashboard** (admin rail already `'none'`) | `StatCard`s (raised, backers, avg pledge, days left, conversion) + sections linking to editors |
| Campaign settings | `/admin/fundraising/settings` | **Focus** | Goal, dates, story, toggles, use-of-funds editor |
| Milestone editor | `/admin/fundraising/milestones` | **Focus** | Add / reorder thresholds, reveal mode |
| Tier + add-on editor | `/admin/fundraising/tiers` | **Focus** | Tiers, inventory, early-bird windows, membership grants, add-ons |
| Pledges table | `/admin/fundraising/pledges` | **Index** | Status, refunds, fulfillment, CSV export |
| Updates composer | `/admin/fundraising/updates` | **Focus** | Post backer updates, email backers |
| Comment moderation | `/admin/fundraising/comments` | **Index** | Hide / flag feed messages |

Nav: add a `/founders` entry to `PUBLIC_MEGA_NAV` in `lib/site.ts` (and consider a primary
CTA). The in-app banner is a small component the member shell renders for logged-in
members, linking to `/founders`. No `page-chrome.ts` change is needed for the marketing
splash (it is outside the member shell); `/admin/fundraising` inherits the existing
`/admin/*` `'none'` rail.

> House rule: this is the modified Next 16 fork. **Read `node_modules/next/dist/docs/`
> before writing route handlers, Server Actions, or data fetching** (AGENTS.md). The edge
> entry is `proxy.ts`, not `middleware.ts` (ADR-001).

---

## 9. Recognition and badges

Reuses the existing achievements system (the `achievements` table; precedent is the
`founders-first-week` badge seeded by `20260606170000_founders_first_week_badge.sql`). A
"Founding Member" badge is a **net-new achievement, not a tier or role** (per the
Explore-agent reconciliation of ROLES.md and the founder config).

- Seed achievement rows: `founding-supporter`, `founding-member`, `founding-circle`,
  `founding-patron` (tiered), and `founding-day-one` (the early-bird badge). Tier
  `badge_slug` points at the right one; the webhook grants it on a completed pledge.
- Distinct from `founders-first-week` (an onboarding milestone anyone can earn
  post-launch). Founding Member is cohort recognition for backing the raise.
- Tag backers with `member_tags.tag='founding-member'` for CRM segmentation (separate from
  display), alongside the existing `web_beta` cohort tag.
- The **Founders Wall** reads completed pledges where `is_anonymous = false`, grouped by
  tier. Anonymous backers still count toward the social-proof tally but show as
  "Anonymous" (research: forced public recognition suppresses small gifts, so anonymity is
  opt-in).

---

## 10. Crowdfunding feature set (research-backed, prioritized)

Legend: ✅ MVP (Phase 1) · ⏳ Phase 2.

| Status | Feature | Evidence |
|---|---|---|
| ✅ | Single clear goal + live progress (raised, %, backers, days left) | Core convention |
| ✅ | 4 to 5 tier ladder, strong mid-anchor at the 1-year value | ~6 tiers convert best; ~$25 to $60 sweet spot |
| ✅ | Suggested amounts (anchors + custom) | Goswami & Urminsky 2016 (default anchoring) |
| ✅ | Live backer feed + optional comment, opt-in anonymity | Social proof; recognition is double-edged (Vanderbilt 2021) |
| ✅ | Use-of-funds breakdown with percentages | Budget disclosure lifts funding >100% (M&SOM 2022) |
| ✅ | Risks + honest timeline + refund / not-tax-deductible disclosure | FTC-enforceable; 75%+ of projects ship late |
| ✅ | Founder faces + story | Trust signal |
| ✅ | Early-bird limited tier (Day One badge) | Day-1 urgency; compensates for skipping a private seed |
| ✅ | Founding badges + Founders Wall | Recognition, social proof |
| ✅ | Add-ons (Gems, gift membership, extra Space, time with founder) | Add-ons lift average pledge 15% to 35% |
| ⏳ | Milestones + stretch goals, revealed one at a time | Kickstarter guidance; collect past goal |
| ⏳ | Backer updates (at least monthly; more at start and end) | Inverted-U: helps most early and late, spam backfires |
| ⏳ | Real deadline + email reminders | Reverse-J curve: first and last 48h often >50% of cash |

Deliberately **not** built: a page countdown timer (NextAfter: inconsistent, sometimes
-11.5%; urgency belongs in email and the real deadline) and a match challenge (no matcher
lined up; if one appears, match presence lifts giving about 20% and the ratio does not
matter, so a 1:1 is enough).

---

## 11. Copy and voice

All copy follows [CONTENT-VOICE.md](CONTENT-VOICE.md) and [NAMING.md](NAMING.md): plain,
warm, no narrated feelings, no em or en dashes, passes the skeptic test. Everything is
**pre-sale** language, never "donate". AI-generated strings (Vera can draft tier copy,
thank-you notes, and backer-update first drafts via `lib/ai/voice.ts`) run the same rules.

- Hero: "Help us open the doors."
- The ask: "We are raising $X to launch Frequency for real. Here is exactly where it goes."
- Anchor tier: "Founding Member. One year of membership, paid now, your rate locked for life."
- Button: "Back this" (not "Donate").
- Feed line: "Sam backed the Founding Member tier. In since day one."
- Required disclosure: "This is a pre-sale, not a donation. You are buying a membership and
  founder perks. It is not tax-deductible. The app is free for everyone either way."

---

## 12. Compliance checklist (flags, not legal advice; owner to confirm with counsel + CPA)

- 🔴 Never use "donation", "donor", or "tax-deductible".
- 🔴 Publish a clear policy: all sales final, perks delivered regardless, the app is free
  for everyone. Honor every promise (FTC-enforceable). Have counsel review the "all sales
  final" stance against FTC delivery expectations.
- ⚠️ Pre-sale revenue is taxable business income in the year received; cash-vs-accrual
  recognition is a CPA question.
- ⚠️ Pre-sales can trigger state sales-tax obligations (you are the seller, not a
  marketplace facilitator). State-tax pro question.
- ⚠️ The 1099-K threshold reverted to $20,000 / 200 transactions (OBBBA, July 2025); ignore
  older "$600" sources.
- ⚠️ Which legal entity collects (the personal business now; the Foundation later) is an
  open decision tied to ADR-031 / ADR-037. The pre-sale is collected by the for-profit now,
  by design.

---

## 13. Phased roadmap

| Phase | Scope | Gate |
|---|---|---|
| 0 — Decisions | Exact goal number, refund policy wording, tier copy, counsel + CPA sign-off | owner |
| 1 — Compliant MVP | Migration + admin editors + env-gated PayPal sandbox + splash + pledge flow + verified webhook + live tracker + receipt email + membership grant + founding badges + Founders Wall + early-bird | ships dark behind `paypalEnabled()` |
| 2 — Conversion | Milestone reveal, comment moderation surface, backer updates + email, stretch goals, deadline reminders | |
| 3 — Stripe handoff | Stripe takes over renewals; pre-paid grants honored and extended; optional per-Space campaigns via `space_id` | |

---

## 14. Research sources (load-bearing)

Crowdfunding mechanics: List & Lucking-Reiley 2002 (seed money ~6x), Karlan & List 2007
(match presence +19% / +22%, ratio irrelevant), Goswami & Urminsky 2016 (default
anchoring), M&SOM 2022 (budget disclosure >100% lift), Mollick 2014/2015 (75%+ ship late;
~9% non-delivery), Vanderbilt 2021 (public recognition double-edged), NextAfter (countdown
timers unreliable on pages), Kickstarter handbook (updates, stretch goals, risks).

PayPal + legal: PayPal Orders v2 + JS SDK v6 docs, PayPal merchant fee PDF (29 Oct 2025),
PayPal Campaign Fundraising T&Cs + Giving Fund nonprofit-cert policy, IRS FS-2022-20 +
quid-pro-quo guidance + OBBBA 1099-K FAQ (July 2025), FTC Chevalier 2015 + iBackPack 2020.

Full citations live in the session research transcript; re-verify PayPal API specifics and
fees in a browser before building (PayPal blocks automated doc fetches).
