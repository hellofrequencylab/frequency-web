# Member Data Platform — the governed library of member variables

Status: **Phase 1 shipped (dark).** Decision: [ADR-069](DECISIONS.md). Projects off the event
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
| **Traits** | tags + computed per-member variables | `member_tags` ✅, `member_traits` ⏳ |
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
- `contacts.consent_state` already exists; Phase 5 formalizes consent records + retention enforcement.

## Examples → mechanism

| Goal | Trait | How |
|---|---|---|
| *Web Beta* badge of early involvement | `web_beta` tag | ✅ backfilled to the founding cohort (non-demo/system members), dated to each join |
| When they joined | `join_cohort` + `profiles.created_at` | computed (ISO week) |
| How much they've used the site | `last_active_at`, `days_active_30`, `wam_status`, `rfm_score` | computed nightly from `engagement_events` |
| Discounts / early registration | a **Segment** (`web_beta` + active) → audience | reverse-ETL into `campaigns` / `contacts` |

## Phases

| Phase | Deliverable | Status |
|---|---|---|
| **1 · Foundation** | registry + `member_tags` + `web_beta` backfill + ADR/doc | ✅ shipped (dark) |
| **2 · Computed traits** | `member_traits` projection + nightly job (lifecycle/cohort/usage/WAM/RFM) | ⏳ |
| **3 · Segments** | saved segment definitions + Studio admin (name, predicates, member count) | ⏳ |
| **4 · Activation** | segment → audience reverse-ETL into `campaigns` / `contacts` | ⏳ |
| **5 · Consent & experiments** | consent records + retention enforcement + experiment-assignment trait + holdouts | ⏳ |

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
| `lib/traits/registry.ts` | the catalog — typed trait/tag definitions (the library) |
| `lib/traits/tags.ts` | `assignTag` / `removeTag` / `getMemberTags` / `hasTag` (registry-validated) |
| `supabase/migrations/*_member_tags.sql` | `member_tags` table + RLS + founding-cohort backfill |
| `lib/traits/registry.test.ts` | registry integrity + `isTagKey` |
