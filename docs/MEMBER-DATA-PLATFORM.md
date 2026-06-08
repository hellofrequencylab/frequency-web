# Member Data Platform — the governed library of member variables

Status: **Phases 1–3 shipped.** Decision: [ADR-069](DECISIONS.md). Projects off the event
ledger ([ENGAGEMENT-ARCHITECTURE.md](ENGAGEMENT-ARCHITECTURE.md), ADR-025) and feeds the analytics
dashboard ([ANALYTICS.md](ANALYTICS.md), ADR-050), gamification, marketing, and Vera
([AI-VERA.md](AI-VERA.md)).

**The one idea:** don't build a parallel analytics/marketing system. Build a governed **trait &
segment layer that *projects off* the `engagement_events` ledger we already have.** The "library of
variables" is, precisely, a **registry** — definitions in git, values in Postgres.

---

## The model — six layers

```
Identity → Events → TRAITS → SEGMENTS → Activation → INTELLIGENCE
profiles   engagement   (tags +     (saved      campaigns /   feature store +
contacts   _events      computed)   audiences)  automation /  AI recommend +
 ✅          ✅           ✅          ✅          Vera ✅        retro rewards 📋
```

| Layer | What | Where |
|---|---|---|
| Identity | members, leads, staff | `profiles`, `contacts`, `team_members` |
| Events | the raw behavioral truth (typed, idempotent) | `engagement_events` ✅ (semantic), `interaction_events` ⏳ (raw firehose, PI.1) |
| **Traits** | tags + computed per-member variables | `member_tags` ✅, `member_traits` ✅ |
| **Segments** | saved, reusable audience definitions | `segments` ✅ |
| Activation | send / segment / automate | `campaigns`, `automation_rules`, comms spine |
| **Intelligence** | feature store → AI site-improvement loop → retroactive rewards | track **PI** 📋 ([ADR-166](DECISIONS.md)) |

## Layer 6 — Intelligence & Activation (track PI, [ADR-166](DECISIONS.md))

The owner vision — *track everything, let the AI recommend site changes, and reward past behavior* —
is this layer. It does **not** rebuild the spine; it extends it. **One rule governs it: capture wide
and immutable now** — every future metric/reward/model is a *read* over data already banked, never a
backfill. Five capabilities (full status in [BUILD-LIST.md](BUILD-LIST.md) PI):

| Cap | What | Builds on |
|---|---|---|
| **PI.1 Wide capture** | `interaction_events` — the raw twin of the semantic `engagement_events`: a batched, sampled, consent-aware client `observe()` beacon (view · dwell · scroll · click · search/zero-result · abandon · rage-click), wide + jsonb-extensible | the event spine + consent scopes |
| **PI.2 Feature store** | `member_traits` → a per-member behavioral vector (recency/frequency/depth per surface, affinities, stage) + per-surface rollups — the clean aggregate AI + rewards read | `lib/traits/compute` + the nightly cron |
| **PI.3 Predictive traits** | churn-risk · activation-propensity · next-best-action · LTV as `predicted` traits | the slot `member_traits` was shaped for (below) |
| **PI.4 AI Studio** | Claude reads aggregates → ranked, falsifiable **site-change** hypotheses → each spawns an experiment → measures lift | `lib/experiments` + `lib/ai` kernel + `admin/insights` |
| **PI.5 Retroactive rewards** | rule DSL over historical events/ledgers/traits + idempotent batch grant — reward *past* behavior from a rule defined *today* | the append-only gem/zap ledgers + idempotency |

## Three kinds of trait — kept separate

| | **Tag** | **Computed trait** | **Predicted trait** (PI.3) |
|---|---|---|---|
| Nature | declarative membership, asserted | derived from the ledger + interaction firehose | forward-looking inference over the feature store |
| Examples | `web_beta`, `founder`, `host`, `vip` | `lifecycle_stage`, `wam_status`, `rfm_score`, `engagement_depth` | `churn_risk`, `activation_propensity`, `next_best_action` |
| Provenance | `source`, `assigned_at`, `expires_at` | `derivation`, `computed_at` | `derivation` (heuristic v1 → model later), `computed_at` |
| Storage | `member_tags` (rows) | `member_traits` (projection) | `member_traits` (same projection) |
| Freshness | `static` | `nightly` / `realtime` | `nightly` |

## The registry *is* the library — `lib/traits/registry.ts`

Every member variable is **declared before it exists**, the same governance pattern as the help
feature-key registry. Definitions live in code (reviewed in PRs, documented, privacy-classed);
**values** live in Postgres. This is what keeps the catalog from rotting into a junk drawer.

Each entry carries: `key · label · description · kind · category · type · pii · freshness ·
retentionDays · owner · derivation? · values?`. Assignment goes through `assignTag()`, validated
against the registry — **a typo can't mint a tag.**

## Privacy-by-design (non-negotiable)

- Every entry has a **`pii` class** (`none` / `identity` / `sensitive`) and **`retentionDays`**.
- Members can **view their own tags** (RLS `member_tags_select_own`); tags are **erased with the
  account** (FK `on delete cascade`) — extending the Vera member-erase path (ADR-066).
- `contacts.consent_state` already exists; Phase 5b adds an append-only **consent ledger**
  (`consent_records`, latest-record-per-scope wins) + a nightly **retention cron** — `hasConsent()`
  is what AI/Vera writes gate on (the ADR-028 harness).

## Examples → mechanism

| Goal | Trait | How |
|---|---|---|
| *Web Beta* badge of early involvement | `web_beta` tag | ✅ backfilled to the founding cohort (non-demo/system members), dated to each join |
| When they joined | `join_cohort` + `profiles.created_at` | computed (ISO week) |
| How much they've used the site | `last_active_at`, `days_active_30`, `wam_status`, `rfm_score` | computed nightly from `engagement_events` |
| Discounts / early registration | a **Segment** (`web_beta` + active) → audience | reverse-ETL into `campaigns` / `contacts` |

## Acquisition source — first-touch attribution ([ADR-095](DECISIONS.md))

How a member/lead **first reached us** is captured at the edge and stamped as a
governed tag, so origin is segmentable forever. One channel taxonomy lives in
`lib/attribution/channels.ts`; each channel is a `source_<channel>` **tag**
(category `marketing`), exactly like the `beta_*` cohort tags.

| | |
|---|---|
| **Channels** | `donor` · `referral` · `qr_scan` · `event_guest` · `video` · `social` · `search` · `email` · `organic` · `direct` |
| **Capture** | `proxy.ts` writes an **immutable** `fq_attr` first-touch cookie on an anon's first request (utm_*, gclid/fbclid, referrer, landing, ts); entry routes drop an `fq_src` channel hint |
| **Resolve** | `resolveAcquisition()` (`lib/attribution/server.ts`) folds the cookies into one record at signup — **first-touch primary** |
| **Persist** | governed tag `source_<channel>` (the first-touch channel) + full record on `profiles.meta.acquisition` / `contacts.meta.acquisition` |
| **Model** | first-touch = the canonical tag (credits true origin); converting/last-touch + utm detail kept in `meta` for multi-touch analysis |
| **No migration** | rides `member_tags` + `meta` only; best-effort, never blocks signup |

`donor` + `event_guest` are **plumbing only** (channels + resolver wired; flows not built). A **backfill** (`lib/attribution/backfill.ts`) infers a source for pre-capture members from `referred_by_profile_id` + `meta.beta.*`; the **channel-mix rollup** (`lib/attribution/rollup.ts`) renders on `/admin/intel` with a one-click backfill button.

## Phases

| Phase | Deliverable | Status |
|---|---|---|
| **1 · Foundation** | registry + `member_tags` + `web_beta` backfill + ADR/doc | ✅ shipped (dark) |
| **2 · Computed traits** | `member_traits` projection + nightly job (lifecycle/cohort/usage/WAM/RFM) | ✅ shipped (dark) |
| **3 · Segments** | saved segment definitions + Studio admin (name, predicates, member count) | ✅ shipped |
| **4 · Activation** | trait segments selectable as campaign audiences (`seg:<slug>` → member contacts, consent-aware) | ✅ shipped |
| **5 · Consent & experiments** | experiments + holdouts (`lib/experiments`) · append-only consent ledger + retention cron (`lib/consent`) | ✅ shipped |
| **6 · Intelligence & Activation** | wide `interaction_events` capture → feature store → predictive traits → AI site-improvement loop → retroactive reward engine (track PI, [ADR-166](DECISIONS.md)) | 📋 PI.1 first |

## Future-proofing (set up now, not retrofitted)

- **Post-cookie, server-side first-party** — already how we emit; double down (don't add client-only).
- **Composable / warehouse-native CDP** — keep the event + trait schema clean + typed so it can sync
  to a warehouse or reverse-ETL tool later with zero re-instrumentation.
- **Predictive / AI traits** — `profiles.embedding` + the Vera kernel already exist; `member_traits`
  is shaped so churn-risk / propensity / interest traits slot beside deterministic ones.
- **Identity resolution** — `contacts.profile_id` is the stitch point (anonymous → lead → member).
- **Real-time traits & experimentation** — `freshness: 'realtime'` and an experiment-assignment trait
  make live nudges and measurable change first-class.

## Code map

| Path | Role |
|---|---|
| `lib/traits/registry.ts` | the catalog — typed trait/tag definitions (the library; incl. `source_*` acquisition tags) |
| `lib/traits/tags.ts` | `assignTag` / `removeTag` / `getMemberTags` / `hasTag` (registry-validated) |
| `lib/attribution/channels.ts` | acquisition channel taxonomy + pure `deriveChannel()` (unit-tested) |
| `lib/attribution/first-touch.ts` | edge-safe first-touch cookie capture (used by `proxy.ts`) |
| `lib/attribution/server.ts` | `resolveAcquisition()` + `stampAcquisitionTag()` (first-touch primary) |
| `lib/traits/compute.ts` | pure trait computation (cohort, lifecycle, WAM, RFM…) — unit-tested |
| `lib/traits/refresh.ts` | the nightly job — RPC aggregates → compute → upsert `member_traits` |
| `lib/traits/segments.ts` | segment model + pure evaluator/validator/describer + live counts |
| `app/(main)/admin/segments/page.tsx` | Studio admin — segments with live counts + member previews |
| `app/api/cron/refresh-traits/route.ts` | Vercel Cron entrypoint (02:30 daily; `CRON_SECRET`-guarded) |
| `supabase/migrations/*_member_tags.sql` · `*_member_traits.sql` | tables + RLS + `member_engagement_stats` RPC + founding-cohort backfill |
| `lib/traits/*.test.ts` | registry integrity, `isTagKey`, and the compute layer |
| `lib/experiments/registry.ts` · `assign.ts` | experiment catalog + deterministic, storage-free variant assignment (holdout = `control`) |
| `lib/consent/scopes.ts` · `consent.ts` | consent scope registry + `latestByScope` / `recordConsent` / `hasConsent` (the harness) |
| `lib/consent/retention.ts` · `app/api/cron/enforce-retention` | purge expired data nightly (`isExpired` pure-tested) |
| `supabase/migrations/*_consent_records.sql` | append-only consent ledger + RLS |
