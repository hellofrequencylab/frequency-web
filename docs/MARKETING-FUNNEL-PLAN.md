# Marketing + Funnel development plan

> Forward-facing site audit + the plan to get it launch-ready. Vision is locked (owner, 2026-07-02):
> the through-line is **building Third Spaces**. Two pillars that must stay distinct but both be
> represented: **Community** = the worldwide movement (broaden the framing from the loneliness
> epidemic to the Third Spaces movement); **Labs** = the infrastructure/tooling that supports it.
> Feature/splash volume naturally skews Labs; the **highest-traffic forward-facing pages must be
> balanced Community vs Labs**. Every page: indexed, on a funnel + onboarding path, Puck-editable,
> on the voice + naming canon.

## Where we are (audit, 2026-07-02)

- ✅ **SEO indexing is strong** — nearly every forward-facing page is in `app/sitemap.ts` with
  `generateMetadata` + canonical + JSON-LD; the only pages out of the sitemap are correctly excluded
  (checkout/confirm `noindex`, redirect stubs, auth-walled `/onboarding`).
- ✅ **One clear induction** — the funnel converges on `BETA_CTA_HREF = /onboarding/beta`, carried by
  the shared `MarketingHeader` CTA + `BetaCTA` in most bodies.
- 🔴 **Puck-editability gap** — only 8 slugs are editor-backed (`home`, `about`, `spaces`, `the-lab`,
  `the-community`, `the-quest`, `pricing`*, `circles`); *`pricing` doesn't even render the Puck chain
  (static JSX, orphaned `templates/pricing.ts`). All 12 SEO articles, `what-is-frequency`, every
  `/discover/*`, `/for/[persona]`, `/vs`, `/founders`, `/beta`, `/start` are hand-coded.
- 🔴 **Pillar imbalance** — the 12-page SEO cluster is 100% Seeker/Community loneliness-pain with
  **zero Labs/builder-infrastructure SEO pages**; the Community framing leans on the loneliness
  epidemic rather than the Third Spaces movement on the highest-traffic pages.
- ⚠️ **Dead-end / soft-leak funnels** — `/discover/practices`, `/discover/practices/pillar/[slug]`,
  `/discover/partners` (index pages) have no body CTA; `/life-after-the-feed` hero has no CTA button;
  `/start`'s three role cards route into 308-redirect stubs and never reach `/onboarding/beta`;
  `/beta/[slug]` is inert (`BETA_SEQUENCES` empty → 404).
- ⚠️ **Voice/naming nits** — lowercase proper nouns in legacy fallbacks (`Zaps`, `Circle`), curly
  quotes on `/beta`, `/discover/topics/[slug]` breadcrumb says "Topics" not the canonical "Channels".
- ⚠️ **Redundancy** — `/discover/places` (activity-gated) and `/discover/cities` (density-gated) are
  two parallel city-hub systems; orphaned Puck templates (`build`, `practice`, `spread`, `pricing`).

## Funnel inventory (what a "funnel" is here)

**Two admin builders + a stack of acquisition primitives.**

| System | Where | What it is |
|---|---|---|
| **Funnels-as-object** (Growth OS Engine 2, ADR-455) | `admin/growth/funnels`, `lib/funnels/*`, migration `20260913000000_funnels.sql` | Named path of 4 canonical stages **entry → wedge → capture → convert**; each stage a typed soft-ref (`entry_point`/`campaign`/`page`/`lead_flow`/`nurture`/`custom`); `goal_event` measured via `funnel_rollup` RPC over `engagement_events`. 4 seed templates. ⚠️ migration header says "NOT APPLIED" — confirm it's live in prod. |
| **Campaign builder** (ADR-126) | `admin/marketing/funnels`, `lib/entry-points/campaigns.ts`, `20260606000000_entry_points.sql` | `entry_campaigns` = themed groups of **Entry Points** (an owner-owned `qr_codes` row + `template_id` + flyer). Templates: event/circle/invite/waitlist/partner. Branded flyers + QR + scan tracking. |
| **QR / short-links** | `app/q/[slug]/route.ts` (+ `/n/[nodeId]` earn-nodes, `/g/[slug]` gift-Zap, `/u/scan` unsubscribe) | Universal resolver: `url`/`node`/`action`(referral\|gift_zap)/`circle`/`event`/`splash`; sets first-touch + channel + A/B (`fq_var`) + referral (`fq_ref`) cookies. |
| **Link Generator** | `admin/growth/links`, `lib/growth/link-compose.ts` | UTM-tracked destination → `qr_codes` short-link + QR. |
| **Referral** | `profiles.referred_by_profile_id` + `fq_ref` + `reward_grants referral.activated:*`; `/admin/referrals`; flag `referrals_enabled` | Member-get-member. |
| **Beta waitlist** | `requestBetaAccess` → `contacts` double-opt-in; `/admin/marketing/beta`; `/beta/confirm` | Email lead capture (distinct from the open `/onboarding/beta` induction). |
| **Applications** (Growth OS Engine 3) | `applications` table; `/admin/growth/applications` | Dual-track review queue. |
| **Attribution** | `applyEntryPointConversion` at signup (`onboarding/actions.ts`) | Persists first-touch/channel/referral cookies onto the new member. |
| **Primary induction** | `BETA_CTA_HREF = /onboarding/beta` (open beta); secondary `/sign-in` | Where every marketing CTA lands. |

**Three easily-confused "join" funnels** to disambiguate in copy: `/onboarding/beta` (real induction),
`/beta` (email waitlist), `/founders/*` (paid reservation).

## Development plan (prioritized)

### M1 · Funnel dead-ends + voice/naming nits — *quick wins, ship first*
- Add a beta/sign-in CTA to `/discover/practices`, `/discover/practices/pillar/[slug]`, `/discover/partners` index bodies.
- Add the missing hero CTA to `/life-after-the-feed`.
- Fix `/start`: route its three role cards to a real lead-flow/`/onboarding/beta` path, not the 308 stubs.
- Either wire `/beta/[slug]` (seed `BETA_SEQUENCES`) or remove the inert route.
- Voice: capitalize `Zaps`/`Circle` in the legacy fallbacks (`the-quest`, `the-community`, `the-lab`); straighten curly quotes on `/beta`; breadcrumb "Topics" → "Channels" on `/discover/topics/[slug]`.
- Delete orphaned Puck templates (`build`, `practice`, `spread`; retire `pricing.ts` when `/pricing` is Puck-enabled).

### M2 · Pillar rebalance — *Third Spaces movement + Labs representation* — ✅ shipped
- ✅ **Labs-side SEO cluster (0 → 4)** shipped: `/what-is-a-third-space`, `/how-to-run-a-community-space`, `/tools-for-community-builders`, `/host-a-recurring-gathering`. Each is single-pillar Labs (builder/host/operator voice), answer-first with Article/HowTo + FAQ schema, funnels to `/spaces` (+ `/the-lab`, siblings, `/how-to-start-a-circle`). Wired into `app/sitemap.ts`; cross-linked inbound from `/spaces` ("Guides for builders").
- ✅ **Top-of-funnel Community framing** — audit found `home`, `about`, `/the-community`, `/the-lab`, `/spaces`, and the pain-SEO pillars were **already rebalanced to the Third Spaces movement in prior work** (home: "Not home. Not work. The third place… you can bring it back"; about closes on "we're building infrastructure"; the pain pages use pain as the SEO on-ramp then bridge to the movement + Circles). No rewrite needed — would have been churn/regression risk.
- ✅ **Steps mis-numbering fix** — the shared `Steps` component re-indexes per call, so pages that split a guide into two `<Steps>` blocks rendered "01,02,03,01,02,03". Collapsed to a single block on all four how-to pages (`how-to-run-a-community-space`, `host-a-recurring-gathering`, `how-to-reconnect-with-old-friends`, `how-to-start-a-circle`).
- Note: no generic host `/for/[persona]` exists (personas are commercial operator types only); the Labs guides use `/the-lab` as the on-pillar secondary instead.

### M3 · Puck-enable the forward-facing surface — *operator-editable without a deploy*
- Bring the SEO articles + `what-is-frequency` + `/discover/*` hubs + `/for/[persona]` + `/vs` + `/founders` + `/beta` + `/start` onto the page-editor chain (`getPublishedData → getTemplate → BlockRender`), starting with the highest-traffic (home is already done; do the 12 articles next as a shared template).
- Make `/pricing` actually render the Puck chain (it currently ignores `templates/pricing.ts`).
- Move the editable `/circles` template out of the robots-disallowed `(main)` group so its editable copy can be indexed.

### M4 · Funnel consolidation + measurement
- De-dupe `/discover/places` vs `/discover/cities` (canonicalize one; 301 the other).
- Standardize detail-page CTAs: hubs → `/onboarding/beta`, detail → the same induction (not bare `/sign-in`), inline capture where a waitlist is intended.
- Confirm the Growth OS `funnels` tables are applied in prod; wire the 4 seed funnels to real `goal_event`s and watch `funnel_rollup`.

## Definition of done (launch)
Every forward-facing page: in the sitemap with canonical + metadata; carries a funnel CTA into
`/onboarding/beta` (or a deliberate waitlist/founder track); single-pillar and on-voice; and (M3)
Puck-editable. The primary-nav + SEO set reads balanced Community (movement) vs Labs (infrastructure).
