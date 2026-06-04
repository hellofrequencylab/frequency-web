# Member Data Platform — the governed library of member variables

Status: **Phases 1–3 shipped.** Decision: [ADR-069](DECISIONS.md). Projects off the event
ledger ([ENGAGEMENT-ARCHITECTURE.md](ENGAGEMENT-ARCHITECTURE.md), ADR-025) and feeds the analytics
dashboard ([ANALYTICS.md](ANALYTICS.md), ADR-050), gamification, marketing, and Vera
([AI-VERA.md](AI-VERA.md)).

**The one idea:** don't build a parallel analytics/marketing system. Build a governed **trait &
segment layer that *projects off* the `engagement_events` ledger we already have.** The "library of
variables" is, precisely, a **registry** — definitions in git, values in Postgres.

---

## The model — five layers

```
Identity → Events → TRAITS → SEGMENTS → Activation
profiles   engagement   (tags +     (saved      campaigns /
contacts   _events      computed)   audiences)  automation_rules / Vera
 ✅          ✅           ◑ P1        ⏳ P3         ✅
```

| Layer | What | Where |
|---|---|---|
| Identity | members, leads, staff | `profiles`, `contacts`, `team_members` |
| Events | the raw behavioral truth (typed, idempotent) | `engagement_events` |
| **Traits** | tags + computed per-member variables | `member_tags` ✅, `member_traits` ✅ |
| **Segments** | saved, reusable audience definitions | ⏳ Phase 3 |
| Activation | send / segment / automate | `campaigns`, `automation_rules`, comms spine |

## Two kinds of trait — kept separate

| | **Tag** | **Computed trait** |
|---|---|---|
| Nature | declarative membership, asserted | derived from the ledger |
| Examples | `web_beta`, `founder`, `host`, `vip` | `lifecycle_stage`, `join_cohort`, `wam_status`, `rfm_score` |
| Provenance | `source`, `assigned_at`, `expires_at` | `derivation`, `computed_at` |
| Storage | `member_tags` (rows) | `member_traits` (projection, Phase 2) |
| Freshness | `static` | `nightly` / `realtime` |

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
