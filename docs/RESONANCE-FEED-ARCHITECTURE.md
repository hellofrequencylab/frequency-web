# Resonance Feed architecture

> **The plan for connecting the right people and the right activity, anywhere in the world, without
> ever giving away where someone lives.** One feed that is always full, gets more local the denser
> your area is, ripples outward when it is sparse, and quietly introduces you to people on your
> wavelength. Built on the resonance + geo + embedding layers we already ship, not a rebuild.

**Status legend:** ✅ shipped · ⏳ in flight · 📋 specced, not built · ⚠️ deliberately deferred · 🔴 blocked.

This doc is the master plan. It composes existing specs rather than restating them:
[`CONNECTION-LAYER.md`](CONNECTION-LAYER.md) (proximity + the resonance graph),
[`DISCOVER-LAYER.md`](DISCOVER-LAYER.md) (browse/search), [`NEXT-GEN-CRM.md`](NEXT-GEN-CRM.md)
(the resonance engine + embeddings), and the access model in
[`DECISIONS.md`](DECISIONS.md) ADR-414. Member-facing voice follows
[`CONTENT-VOICE.md`](CONTENT-VOICE.md) and [`NAMING.md`](NAMING.md).

---

## 1. The answer up front

Three things ship as one coherent system:

| Pillar | What a member experiences | How it works underneath |
|---|---|---|
| **Access** | Any Crew member creates events, circles, journeys, and practices. Plain Members join and adopt, but creating prompts a one-tap "Crew is free during the beta" upgrade. | The four `*.create` capabilities, gated on the real Crew tier (ADR-414). ✅ Phase 0. |
| **Resonance feed** | A feed that is never empty. The more is happening near you, the more local it gets. When your area is quiet, it ripples outward (neighborhood → city → region → world) so there is always something worth seeing, and quietly surfaces people you would click with. | A blended rank over proximity + social graph + shared interest + recency + density, with an adaptive radius and a member-controlled slider. ⏳ Phases 1 to 3. |
| **Founder + privacy** | If nobody is near you yet, a warm "be a founder in your neighborhood" prompt (start a circle, host an event, invite a friend). If people are near, you see the closest activity instead. Location is opt-in, and your exact spot is never shared, ever. | The density rollup decides founder-vs-activity; all reads use the fuzzed geocell, never raw coordinates. 📋 Phase 2, scaffolded in Phase 0. |

The design goal in one line: **proximity creates serendipity, the graph makes it relevant, and density
decides how wide we cast the net, so the feed is always full and always feels like your corner of the world.**

---

## 2. What already exists (build ON this)

We are not starting from zero. The graph, the embeddings, and the geospatial plumbing are shipped.

| Layer | Status | Where |
|---|---|---|
| Per-profile interest embeddings (384-d, nightly) | ✅ | `resonance_embeddings`, `lib/resonance/embeddings.ts` |
| Reciprocal match edges + scores + plain reasons | ✅ | `resonance_edges`, `lib/resonance/{candidates,edges,score}.ts` |
| Double opt-in matches | ✅ | `resonance_matches`, `lib/resonance/matches.ts` |
| Proximity RPCs (members + events near a point) | ✅ | `members_near()`, `nearby_events()`, `my_orbit()`, `resonance_neighbors()` |
| Fuzzed home geocell (~1.1km), PostGIS geography | ✅ | `profiles.home_geocell_lat/lng`, `home_geog` |
| Member radius + privacy controls | ✅ | `profiles.feed_radius_m`, `location_band`, `discoverable_by`, `discovery_radius_m`, `directory_visible`, `ghost_mode` |
| Platform connection bounds (admin-gated) | ✅ | `connection_settings`, `lib/connections/connection-settings.ts` |
| Today's feed (recent/relevant/nearby/story) | ✅ | `app/(main)/feed/page.tsx`, `lib/feed-rank.ts` |
| Nexus region hierarchy (the ripple rings) | ✅ | `nexus_regions` (parent_id, depth, full_path) |

**What is missing is the composition layer:** a single ranked feed that blends all of the above, an
adaptive radius that reads local density, the founder prompt, the hide control, and the create gate.
That is what this plan adds. No new embedding model, no new graph, no duplicated geo columns.

---

## 3. The resonance rank (the core algorithm)

Every candidate item (a post, event, dispatch, challenge, or suggested person) gets a score that is a
weighted blend of five signals. The blend is the whole game.

```
score(item, viewer) =
    w_prox · proximity(item, viewer)      // how near, on the fuzzed-geocell distance
  + w_graph · graph(item, viewer)         // resonance-edge strength + shared circles/channels
  + w_interest · interest(item, viewer)   // cosine(embedding_viewer, embedding_item)
  + w_recency · recency(item)             // time-decay, so the feed stays alive
  + w_signal · soft_signals(item, viewer) // streak alignment, shared events, vibe (quiet)
  - penalties(item, viewer)               // hidden people, already-seen, self-throttle
```

**Density adapts the weights, not just the radius.** In a dense area, `w_prox` rises (local is
abundant, so prefer it). In a sparse area, `w_prox` falls and the radius expands, so the graph and
interest signals carry the feed until proximity has something to offer. This is the "ripple": the
denser your corner, the more local the feed; the emptier it is, the wider and more interest-led.

**Diversity rerank.** After scoring, a light rerank prevents any one circle, person, or content type
from dominating, so the feed feels like a varied corner of the world, not one loud room. (Maximal
marginal relevance over the top candidates.)

**Soft signals (quiet by design, per the owner).** Streak alignment ("you both keep a daily
practice") and shared-event history nudge people-suggestions up, but are never loud labels. They bias
the rank; they are not a leaderboard. ⚠️ No swipe mechanics, ever.

---

## 4. Adaptive radius + the ripple (always-full feed)

The feed must never be empty, anywhere in the world. The mechanism is an **expanding ring walk** over
the density rollup:

1. Start at the member's chosen radius (`profiles.feed_radius_m`, default 25km), or their slider value.
2. Read `resonance_density_cells` for the cells inside that radius. If the blended density clears a
   "this area is alive" threshold, rank locally and stop.
3. If it does not, **expand one ring**: neighborhood → city → `nexus_region` → parent region → world.
   Each ring loosens `w_prox` and leans harder on interest + graph.
4. Worst case (a truly isolated member), the ring reaches **worldwide**, where the feed is interest-
   and graph-led: the best of the whole community on your wavelength. Still full.

**The radius slider** (dating-app style, member-controlled) sets the *starting* ring and a hard cap.
A member who wants only their block sets it tight; a member who wants the world opens it up. The slider
writes `feed_radius_m` (already exists). Density expansion only ever *widens* from there when local is
empty, never narrows past the member's choice.

**Why a density rollup instead of counting live.** Counting members/posts/events per request, per
ring, does not scale. A periodic job rolls each populated geocell up into `resonance_density_cells`
(Phase 0 table) with counts + a single 0..1 `density_score`, so the radius logic does one cheap indexed
read. Keyed to the **fuzzed geocell**, never a raw coordinate.

---

## 5. Founder prompt vs closest activity

The density read does double duty. When a member opens their feed/discovery:

- **People are nearby** (density clears threshold within a reasonable ring) → show the **closest
  activity**: nearby circles, events, and people on your wavelength. No founder prompt.
- **Nobody is nearby yet** (sparse even after a ring or two) → show the **founder prompt**: a warm
  "be a community founder in your neighborhood" with three concrete actions (start a circle, host an
  event, invite a friend), plus the best of the wider ripple underneath so the feed is still full.

The prompt is encouragement, not a dead end. It turns an empty area into the member's opportunity, and
it is exactly how a new region bootstraps its first circle.

---

## 6. People matching (a community matcher, not a dating app)

The connective tissue: members meet **at a circle or an event**, and the feed warms up the
introduction beforehand. Qualities, per the owner:

| Quality | Decision |
|---|---|
| Meet on the same vibe / interests | ✅ Core. Interest embeddings + shared circles/channels drive people-suggestions. |
| No swipe | ⚠️ Never. The feed surfaces people; there is no card stack. |
| Hide / X a suggestion | ✅ Phase 0 table (`suggestion_hidden`); a member removes anyone they are not interested in, and the rank filters them out. |
| Streaks as a match signal | ✅ Quiet. Biases the rank, never a prominent badge. |
| Safety + verification for in-person | 📋 Meetups happen at real circles/events; verification + safety gating is a tracked phase, not an afterthought. |
| Romance mode | ⚠️ **Not built.** Reserved as a future baseline (`member_match_prefs.romance_mode`, off). |
| Birth-chart / astrology matching | ⚠️ **Not built.** Reserved as a future baseline (`member_match_prefs.birth_data` + `astrology_opt_in`, null/off). |

**Why scaffold romance + astrology now without building them.** Isolating those special-category
fields in one opt-in, owner-RLS table (`member_match_prefs`) means the day the product wants them, the
governed home already exists, with no migration scramble and no PII sprinkled across `profiles`. Until
then, nothing reads them.

---

## 7. Location privacy (the cardinal rule)

**Exact location never leaves the database. Ever.** This is non-negotiable and it is how we earn the
opt-in.

- Members are *encouraged* to turn on location, with a plain promise: we use your approximate
  neighborhood (a ~1.1km fuzzed cell), never your address, and you control who can find you.
- All discovery reads use `home_geocell_lat/lng` (generated, fuzzed) or coarse band labels
  (here / nearby / your area / your city), never `home_lat/lng`.
- Existing privacy controls already cover the granularity: `location_band` (hidden | city |
  neighborhood), `discoverable_by` (nobody | connections | community), `discovery_radius_m`,
  `directory_visible`, `ghost_mode`. The settings UI exposes them (`settings/connections`).
- k-anonymity guard: a cell with too few members never renders a precise count, so density can never
  be reverse-engineered into "who is home."

---

## 8. Phased delivery

| Phase | Scope | Status |
|---|---|---|
| **0. Foundations** | Real-Crew create gate across all four entities + the upgrade popup (ADR-414). Additive schema: `suggestion_hidden`, `resonance_density_cells`, `member_match_prefs`. | ✅ shipped (ADR-414) |
| **1. Blended rank** | The five-signal score + diversity rerank as a unified feed rank, composing the existing proximity RPCs, resonance edges, and embeddings. People-suggestions enter the feed. | ✅ shipped (ADR-415) |
| **2. Adaptive radius + founder prompt** | The density rollup job + the expanding-ring walk. The founder-vs-activity branch. The privacy "turn on location" nudge. | ✅ shipped (ADR-416) |
| **3. Radius slider + hide control** | Member radius slider (writes `feed_radius_m`); the X-to-hide wired to `suggestion_hidden`; streak-as-quiet-signal in the rank. | ✅ shipped (ADR-417) |
| **4. Safety + verification** | Verification + safety gating for in-person meetups that originate from a circle/event introduction. | 📋 |
| **5. Future baselines** | Romance mode and astrology matching, if and when the product calls for them, on the Phase 0 scaffolding. | ⚠️ Deferred |

Each phase is independently shippable and reads the phase before it. Nothing in Phases 1 to 5 needs a
new embedding model or a new geo column, only the composition logic and the surfaces that read it.

---

## 9. Access model (Phase 0, shipped)

Who can create what, and what a non-Crew member sees. This is the gate the upgrade funnel runs on.

| Actor | Create event / circle / journey / practice | Join / adopt |
|---|---|---|
| Real Crew (paid tier) | ✅ | ✅ |
| Community steward (crew+ on the trust ladder), platform staff | ✅ | ✅ |
| Plain Member (free tier, even under beta auto-grant) | ⛔ → one-tap "Crew is free during the beta" popup | ✅ |
| Signed-out | ⛔ → sign in | browse only |

**Implementation:** the four `event.create | circle.create | journey.create | practice.create`
capabilities in `lib/core/capabilities.ts`, granted on `isPaid(realTier) || atLeastRole(role,'crew')
|| isStaff`. The gate reads the **real** Crew tier (`Viewer.realTier`, the DB value before the
`BETA_OPEN_ACCESS` override), so the upgrade popup fires during the beta. Entry points render
`CrewGateButton`; create pages and actions re-check with `assertCanCreate`. Full rationale: ADR-414.

---

## 10. Data model summary

| Table | Purpose | Access |
|---|---|---|
| `suggestion_hidden` | The member-controlled "X / hide this person" on a suggestion. | Owner-RLS (read/insert/delete own). |
| `resonance_density_cells` | Per-fuzzed-geocell activity rollup; the adaptive radius reads it. | Service-role only (RLS, no policy). |
| `member_match_prefs` | One opt-in row: `connect_intent` (soft signal now), plus reserved `romance_mode` / `astrology_opt_in` / `birth_data` (off/null). | Owner-RLS (read/insert/update own). |

All three are additive, fail-closed under RLS, and reached untyped until `lib/database.types.ts`
regenerates (ADR-246), since no read path consumes them until Phase 1+. Existing geo + privacy columns
on `profiles` are reused as-is; this plan adds no duplicate location storage.
