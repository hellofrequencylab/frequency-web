# Hunts expansion and legacy retirement review (FH-048)

> **Answer: no expansion is ready to launch on its own, and legacy retirement is not recommended or scheduled.** This is a readiness review of the code and gates in the tree. It is not the cohort comparison the row asks for, because there is no pilot data: every Hunts switch is off in production and no cohort has run.

Status lives in the [build backlog](../BUILD-BACKLOG.json), never this file: `pnpm backlog`, `pnpm ledger:view FH-048`, and the two rows this review files, `pnpm ledger:view FH-048S` and `pnpm ledger:view FH-048T`.

Reviewed 2026-11-16 by an agent, from the integration tree (main plus the first-wave Hunts branches). Sources: `lib/hunts/`, [the switches](../../lib/hunts/flags.ts), [the Hunts runbook](../RUNBOOKS.md#frequency-hunts-switches), `.env.example`, the FH rows in the ledger and the other pages in this folder.

## What this review could not do

| Asked by the row | Result | Why |
|---|---|---|
| Compare cohorts | Not done | No cohort exists. The free Trail pilot, the single-business pilot and the district drill have not run. |
| Operational cost | Not done | No pilot hours, support load or venue time has been recorded. This page states no figure. |
| Merchant benefit | Not done | The merchant report has never held a real visit or redemption. |
| Field risks | Listed from the code and the gate pages only | Nothing was observed in the field. The risks below are design limits the rows already record. |
| Per-expansion approvals, switch, monitoring, rollback | Done as an inventory, below | Read from the tree. |
| Legacy active use and obligations | Queries written, not run | No database was read for this review. |

No production value was read: not a switch, not a row count, not a log line. Where this page says a switch is off in production, that rests on the runbook rule and the program brief, not on a reading.

## Needs your call

Sorted by what blocks the most.

| Severity | Item | Who decides |
|---|---|---|
| 🔴 | **No expansion has its own switch.** Five of the six share a switch with a base capability or with each other (table below). The row's bar of "its own flag" is not met for any of them. Tracked as FH-048T. | Product and release |
| 🔴 | **No pilot has run**, so nothing here chooses an expansion. The comparison is owed after the first pilot. Tracked as FH-048S. | Product and release |
| ⚠️ | **No event tells an expansion apart.** The five Hunt events carry no team, branch, edition, gift or sponsor dimension, and "cohort" in the event model means guest, member or staff, not a pilot group. | Product and analytics |
| ⚠️ | **Turning the commerce switch off stops refund handling for Hunt benefits and Trail gifts.** For money features the safe stop is the sales pause, not the switch. See "Rollback for money features". | Finance and release |
| ⚠️ | **Legacy retirement has no inventory.** The queries are below. Nobody has run them. | Owner |

## The switches as they are

Six capability switches in [`lib/hunts/flags.ts`](../../lib/hunts/flags.ts), plus one forwarding switch in [`lib/hunts/analytics.ts`](../../lib/hunts/analytics.ts). All default blank, which is off.

| Switch | Opens | Needs |
|---|---|---|
| `HUNTS_ENABLED` | Browse, entry, a player's own run, first-party event recording | Nothing |
| `HUNTS_CLAIMS_ENABLED` | A scan or proof may credit a stop | `HUNTS_ENABLED` |
| `HUNTS_REWARDS_ENABLED` | A credit may grant a reward | `HUNTS_CLAIMS_ENABLED` |
| `HUNTS_AUTHORING_ENABLED` | Creators draft and publish | `HUNTS_ENABLED` |
| `HUNTS_WORKER_ENABLED` | The outbox worker delivers | `HUNTS_ENABLED` |
| `HUNTS_COMMERCE_ENABLED` | Paid passes, store-item benefits, the finance view, Trail gifts, sponsor milestones | `HUNTS_ENABLED` |
| `HUNTS_GUEST_ANALYTICS_ENABLED` | A signed-out visitor's Hunt events may leave for Google Analytics | `HUNTS_ENABLED` |

## Each expansion

"Own switch" means an environment switch that opens this expansion and nothing else.

| Expansion | Switch that gates it today | Own switch? | Other locks in code or data |
|---|---|---|---|
| Teams | `HUNTS_CLAIMS_ENABLED` | **No.** Shared with every solo claim. Claims on means teams on. | None. Migration `20270346082000` must be applied or the commands do not exist. |
| Branches, choices and Mystery | `HUNTS_CLAIMS_ENABLED` at the claim door | **No.** The graph engine has no switch at all: a published route with a choice group is evaluated wherever claims are on. | No screen can author one yet, which is the only thing keeping it dark. |
| Fundraisers: gifts | `HUNTS_COMMERCE_ENABLED` | **No.** Shared with paid passes, store items and sponsor milestones. | Per Trail: an ask opens only with `enabled` set and a recorded approver on `hunt_donation_asks`. No screen writes the approver. |
| Fundraisers: sponsor milestones | `HUNTS_COMMERCE_ENABLED` | **No.** Same shared switch. | Per Trail: an active agreement with a recorded approver on `hunt_sponsor_agreements`. No screen writes one. |
| Seasonal editions | `HUNTS_AUTHORING_ENABLED` for release and import, `HUNTS_ENABLED` for reads | **No.** Shared with all authoring. | Migration `20270346082000` must be applied. |
| Collective and partner model | `HUNTS_AUTHORING_ENABLED` for invites and partner pages, `HUNTS_CLAIMS_ENABLED` for route health and the venue report | **No.** | `PARTNER_TERMS.approved` is `false` in [`lib/hunts/partners.ts`](../../lib/hunts/partners.ts), so no venue can accept. That is a code constant, changed by a deploy, not a switch. |
| Paid passes | `HUNTS_COMMERCE_ENABLED` | **Closest, still shared.** The switch also opens store-item benefits, gifts and sponsor milestones. | The sales pause on `/hunts/finance` (`hunt_commerce_state`, audited) closes pass sales alone, without a deploy. |

### Teams

- **Built.** [`lib/hunts/teams.ts`](../../lib/hunts/teams.ts), [`lib/hunts/team-store.ts`](../../lib/hunts/team-store.ts), [the five team actions](../../app/%28main%29/hunts/%5Bslug%5D/play/team-actions.ts), migration `20270346082000_hunt_teams_editions.sql` with `supabase/tests/hunt_teams.test.sql`. A team shares one run, so one stop is one credit per team.
- **Not built.** Team screens, a non-captain's scan, and the award split call: FH-043S.
- **Approvals owed.** Database owner applies the migration and confirms the two-session check (FH-043S). Owner decides whether teammates see each other's names (FH-043S). FH-016V and FH-019 come first: no solo Trail has been walked on a real database.
- **Monitoring.** Route health counts runs, and a team is one run, so team and solo runs are not told apart. No team event exists.
- **Rollback.** Unset `HUNTS_CLAIMS_ENABLED`, which also stops solo claims. `hunt_teams`, `hunt_team_members`, `hunt_team_awards`, the shared run and its credits all stay. Nothing is deleted.

### Branches, choices and Mystery

- **Built.** [`lib/hunts/graph/branches.ts`](../../lib/hunts/graph/branches.ts), [`lib/hunts/mystery.ts`](../../lib/hunts/mystery.ts). No migration.
- **Not built.** The player answer form, authoring, and a real two-session race on Postgres: FH-042S.
- **Approvals owed.** Game systems decides whether the claim command itself should refuse a second member of a choice group (FH-042S, item 4). Until then a staff approval of a held claim can add a second credit, and the evaluator keeps the earlier one.
- **Monitoring.** `hunt.stop_claim` records the reason class only. The Mystery answers (`answer_wrong`, `answer_locked`) are not in the class map in [`lib/hunts/analytics.ts`](../../lib/hunts/analytics.ts), so they fold into `unavailable`, the same class as an unknown error. A Mystery that locks players out cannot be told from a fault in events. Route health shows where runs wait and stall per stop, which is the nearest signal.
- **Rollback.** Unset `HUNTS_CLAIMS_ENABLED`. Credits, claims and answer attempts stay. A choice already credited stays chosen.

### Fundraisers: gifts and sponsor milestones

- **Built.** Gifts: [`lib/hunts/donation-ask.ts`](../../lib/hunts/donation-ask.ts), [`lib/hunts/donation-sync.ts`](../../lib/hunts/donation-sync.ts), [`components/hunts/hunt-fundraising.tsx`](../../components/hunts/hunt-fundraising.tsx). Sponsor: [`lib/hunts/sponsor-milestone.ts`](../../lib/hunts/sponsor-milestone.ts), [`lib/hunts/sponsor-settlement.ts`](../../lib/hunts/sponsor-settlement.ts), run from the reconcile-transfers cron. Tables in migration `20270346041000_hunt_commerce.sql`.
- **Not built.** The staff screens that record an approver, the sponsor invoice, and run completion: no shipped path sets a run to completed, so the sponsor reader qualifies nobody today (FH-047T).
- **Approvals owed.** FH-045 (D8 beneficiary and sponsor model, Legal and finance, unsigned; draft in [the product drafts](PRODUCT-DRAFTS-D4-D7-D8.md)). FH-035 (D7 funds flow, Finance and legal). Then FH-046T and FH-047T: one provider acceptance run each in test mode. Both rows proved their states against a fake client only.
- **Monitoring.** No gift or sponsor event. The record is the tables: `hunt_donation_gifts`, `hunt_sponsor_snapshots`, `hunt_sponsor_settlements`, and the money lines on the play page. A failed mirror step is logged, not counted anywhere.
- **Rollback.** See "Rollback for money features". Gifts are ordinary Space donations with their own receipts, and they stay with the Space fund whatever the switch says.

### Seasonal editions

- **Built.** [`lib/hunts/editions.ts`](../../lib/hunts/editions.ts), [`lib/hunts/edition-store.ts`](../../lib/hunts/edition-store.ts), [the edition actions](../../app/%28main%29/hunts/edition-actions.ts), `supabase/tests/hunt_editions.test.sql`.
- **Not built.** Release and import screens, and the player's view of an earlier edition: FH-044S. The editor's publish step still calls the older action, which carries no printed code forward.
- **Approvals owed.** Owner rules on runs in flight at a release: today such a run becomes a record and takes no new credit (FH-044S, item 1). Database owner applies the migration. An operator walks one release with real printed codes (FH-044S, item 6).
- **Monitoring.** No release event and no edition dimension. A claim on a superseded edition answers `version_superseded`, which folds into the `closed` class with nine other answers.
- **Rollback.** Unset `HUNTS_AUTHORING_ENABLED`, which stops all authoring. **A release is not undone by the switch.** A published edition is frozen by a trigger and moves forward to superseded only. Rolling back a bad edition means releasing another one.

### The collective and partner model

- **Built.** [`lib/hunts/partners.ts`](../../lib/hunts/partners.ts), [`lib/hunts/partner-store.ts`](../../lib/hunts/partner-store.ts), the partner pages under `app/(main)/hunts/partners/` and `app/(main)/hunts/edit/[id]/partners/`, count rules in [`lib/hunts/graph/count-rules.ts`](../../lib/hunts/graph/count-rules.ts), the finale gate in [`lib/hunts/rally-finale.ts`](../../lib/hunts/rally-finale.ts), [route health](../../lib/hunts/route-health.ts) and [the merchant report](../../lib/hunts/merchant-report.ts).
- **Not built.** Acceptance on approved terms (FH-029S), authoring for N-of-M and chapters and live closures (FH-030S), the finale on any screen (FH-031S), live partner state in route health (FH-032S).
- **Approvals owed.** FH-028S: a real operator walks [the partner agreement](PARTNER-AGREEMENT.md) and the partnerships owner, finance and counsel approve it. It is a draft with four open questions. FH-023 (contact policy, Privacy and CRM) before any venue receives a contact. FH-033 (district drill) and FH-034 (regional pilot, Local operations) have not run.
- **Monitoring.** This is the best covered expansion. Organisers get `/hunts/<slug>/health`: stops reached, waiting and stalled (24 hours), placements open and closed, each venue's counts, and the outbox as message status. Venue staff get `/hunts/<slug>/report` and two exports, with cells under five hidden. Limit recorded in FH-032S: a venue withdrawn through the partner flow is not yet dropped from the active list.
- **Rollback.** Unset the switch for the surface in question. Partner rows, pinned terms and earned credit stay. A single venue leaves by withdrawal or revocation, which blocks new proof there and keeps earlier credit, with no switch change.

### Paid passes

- **Built.** [`lib/hunts/pass-binding.ts`](../../lib/hunts/pass-binding.ts), [`lib/hunts/pass-gate.ts`](../../lib/hunts/pass-gate.ts), [`lib/hunts/pass-checkout.ts`](../../lib/hunts/pass-checkout.ts), [`lib/hunts/commerce-webhook.ts`](../../lib/hunts/commerce-webhook.ts), the finance view at `/hunts/finance`, and the signed event matrix in [`lib/hunts/pilot-commerce-matrix.test.ts`](../../lib/hunts/pilot-commerce-matrix.test.ts).
- **Approvals owed.** FH-035 (D7 funds flow). FH-036T: the owner's drill of pausing and reopening sales. FH-041S: a real sale, a real refund, payout proof and the operator's sign-off. The owner has declined real-card runs for now, and [the gate record](PILOT-COMMERCE.md) is unsigned. Migrations `20270346041000` and `20270346083000` must be applied.
- **Monitoring.** `/hunts/finance` is the reconciling view. `hunt_commerce_audit` records each sales pause. A swallowed hook failure leaves a pending `hunt_commerce_intents` row with its error, retried twelve times and then left for review, or a `[hunts-commerce]` log line. No Hunt event fires on a sale.
- **Rollback.** Pause sales first. See below.

## Rollback for money features

Read from [`lib/hunts/commerce-webhook.ts`](../../lib/hunts/commerce-webhook.ts) and [`lib/hunts/donation-sync.ts`](../../lib/hunts/donation-sync.ts): with `HUNTS_COMMERCE_ENABLED` off, every Hunt hook returns before doing any work.

| Action | What stops | What keeps running | What stays |
|---|---|---|---|
| Pause sales on `/hunts/finance` | New pass checkouts on a bound tier | Payments in flight, refunds, disputes, the repair cron, reconciliation | Every ticket, benefit and audit row |
| Unset `HUNTS_COMMERCE_ENABLED` | Everything above, plus the Hunt side of refunds and disputes, the gift mirror, the sponsor pass and the finance view | Canonical ticket, order and donation settlement, which never read the switch | Every row. Nothing is revoked or deleted. |

The consequence: while the switch is off, a refunded pass keeps its unused Hunt benefit, and a refunded gift is not mirrored into `hunt_donation_gifts`. Neither is repaired until the switch is back on and the cron runs. So the order is: pause sales, let refunds settle, reconcile with the five checks in [the gate record](PILOT-COMMERCE.md), and only then unset the switch. Gifts and sponsor milestones have no pause of their own. Closing one Trail's ask means clearing `enabled` on its row by hand.

## Field risks already on record

None of these was observed in the field. Each is a limit a row or a gate page already states.

| Risk | Where it is recorded |
|---|---|
| No Trail has been played end to end on a real database or a second device | FH-016V |
| The accessibility and low-signal script has not been run on real phones | FH-017S |
| An opened dispute suspends nothing: a benefit stays usable until the dispute closes | [Gate record](PILOT-COMMERCE.md) |
| A refund handled before the ticket first settles is not seen | [Gate record](PILOT-COMMERCE.md) |
| A run in flight when an edition is released takes no new credit | FH-044S |
| Two live Postgres sessions racing for the last reward unit are checked by hand only | [Evidence](EVIDENCE.md), FH-002S |
| A legacy capped check-in code admits two members at its last unit | FH-002S |

## Legacy retirement

**Retirement is not recommended and not scheduled by this review.** It stays that way until the inventory below has been run on production and the owner has read the result. [D1](DECISIONS-D1.md) already rules that the legacy paths keep their routes, tables, printed links and history. Nothing in the Hunts program needs them gone.

### What still ships

These paths are on main. They are not behind any Hunts switch. Whether `LOYALTY_ENABLED` is on in production was not read for this review, so "live" below means the code ships and answers when that switch is on.

| Path | Code | Switch | Obligation it carries |
|---|---|---|---|
| Regulars check-in and stamp | [`lib/engagement/capture.ts`](../../lib/engagement/capture.ts), [`lib/loyalty/visit.ts`](../../lib/loyalty/visit.ts), `loyalty_record_visit` | `LOYALTY_ENABLED` | Stamps on `loyalty_stamps` count toward a card the owner promised a reward for. |
| Regulars Hunt progress | [`lib/loyalty/hunts-visit.ts`](../../lib/loyalty/hunts-visit.ts), `loyalty_hunt_progress` | `LOYALTY_ENABLED` | A member part way through a live hunt has stops that count until the window ends. |
| Regulars Hunt page | [`app/(main)/hunts/[slug]/page.tsx`](../../app/%28main%29/hunts/%5Bslug%5D/page.tsx), [`lib/loyalty/hunt-store.ts`](../../lib/loyalty/hunt-store.ts) | `LOYALTY_ENABLED` | A link a host has shared or printed. |
| Host and stop management | [`lib/loyalty/hunt-actions.ts`](../../lib/loyalty/hunt-actions.ts), [`components/spaces/loyalty/hunts-panel.tsx`](../../components/spaces/loyalty/hunts-panel.tsx) | `LOYALTY_ENABLED` | Invited Spaces that accepted a stop. |
| Rewards wallet and roster | [`app/(main)/rewards/page.tsx`](../../app/%28main%29/rewards/page.tsx), `app/api/v1/rewards/route.ts`, [`lib/loyalty/store.ts`](../../lib/loyalty/store.ts) | `LOYALTY_ENABLED` | Earned reward codes not yet handed out. The table has no expiry column, so an unredeemed reward is owed with no end date. |
| QR campaigns | `app/q/[slug]/route.ts`, `season_challenges`, `challenge_qr_codes` | None of the above | Printed codes in the field, and Quest awards already paid. |
| Check-in codes with a cap | [`lib/engagement/verify.ts`](../../lib/engagement/verify.ts), `nodes.max_claims` | None of the above | "First N win" promises on printed codes. |

The runbook's own rollback for Regulars is to unset the switch: earned rewards stay readable and nothing is deleted ([Regulars runbook](../RUNBOOKS.md#regulars-live-940-adr-1780)). Retirement is a different act from that rollback and has no runbook.

The Hunts import tools ([`lib/hunts/editions.ts`](../../lib/hunts/editions.ts)) copy a legacy hunt's title and places into an unpublished draft. They carry no stamp, completion or reward across. An import does not discharge any obligation in the table above.

### Queries to measure active use and obligations

Read-only. Written from the migrations in the tree and **not run**. Someone with production read access runs them, records the date and the results, and only then is a retirement proposal worth writing.

Live and recent hunts, with their stops:

```sql
select h.status,
       count(*)                                        as hunts,
       count(*) filter (where current_date between h.starts_on and h.ends_on) as in_window,
       max(h.ends_on)                                  as last_end
from public.loyalty_hunts h
group by h.status;

select h.id, h.slug, h.host_space_id, h.starts_on, h.ends_on,
       count(*) filter (where st.status = 'accepted')  as accepted_stops,
       count(*) filter (where st.status = 'invited')   as pending_invites
from public.loyalty_hunts h
join public.loyalty_hunt_stops st on st.hunt_id = h.id
where h.status = 'live'
group by h.id
order by h.ends_on;
```

Members part way through a live hunt (stops visited, not yet complete):

```sql
select h.id as hunt_id, h.slug,
       count(distinct s.profile_id) as members_with_a_stop,
       (select count(*) from public.loyalty_hunt_completions c where c.hunt_id = h.id) as completed
from public.loyalty_hunts h
join public.loyalty_hunt_stops st on st.hunt_id = h.id and st.status = 'accepted'
join public.loyalty_stamps s
  on s.space_id = st.space_id and s.kind = 'visit'
 and s.visit_day between h.starts_on and h.ends_on
where h.status = 'live' and current_date between h.starts_on and h.ends_on
group by h.id, h.slug;
```

Unredeemed rewards, which are the open obligations:

```sql
select (r.hunt_id is not null)          as from_a_hunt,
       count(*)                         as unredeemed,
       count(distinct r.space_id)       as spaces_owing,
       count(distinct r.profile_id)     as members_owed,
       sum(r.reward_value_cents)        as stated_value_cents,
       min(r.earned_at)                 as oldest
from public.loyalty_rewards r
where r.redeemed_at is null
group by 1;

select r.space_id, count(*) as unredeemed, min(r.earned_at) as oldest
from public.loyalty_rewards r
where r.redeemed_at is null
group by r.space_id
order by unredeemed desc;
```

Cards in progress (stamps not yet turned into a reward) and recent activity:

```sql
select count(*)                     as open_stamps,
       count(distinct s.space_id)   as spaces,
       count(distinct s.profile_id) as members,
       max(s.visit_day)             as last_visit_day
from public.loyalty_stamps s
where s.reward_id is null;

select date_trunc('week', s.visit_day)::date as week, count(*) as visit_stamps
from public.loyalty_stamps s
where s.kind = 'visit' and s.visit_day >= current_date - 90
group by 1
order by 1;

select status, count(*) from public.space_loyalty_programs group by status;
```

QR campaigns and capped check-in codes:

```sql
select count(distinct cq.challenge_id) as campaigns,
       count(*)                        as enrolled_codes,
       count(*) filter (where q.active and (q.valid_until is null or q.valid_until > now())) as codes_still_valid
from public.challenge_qr_codes cq
join public.qr_codes q on q.id = cq.qr_code_id;

select count(*) as scans_last_90_days, max(sc.scanned_at) as last_scan
from public.qr_scans sc
join public.challenge_qr_codes cq on cq.qr_code_id = sc.qr_code_id
where sc.scanned_at >= now() - interval '90 days';

select count(*) as capped_codes from public.nodes where max_claims is not null;
```

### What a retirement proposal must hold before anyone schedules one

1. The dated results of every query above, from production.
2. For each Space still owing a reward: how it is honoured or closed out, agreed with that Space's owner.
3. Every live hunt's end date, and a rule that no path is retired inside a live window.
4. What printed codes and shared links do afterwards. A printed `/hunts/<slug>` link or door code must still open something sensible.
5. The owner's decision, recorded as an ADR.

## Next steps

| Step | Owner | Row |
|---|---|---|
| Run the first pilot and write the dated cohort results section into this page | Product and release | FH-048S |
| Give each expansion that is chosen its own switch and its own event dimension before it is turned on | Product and release, then Game systems | FH-048T |
| Run the legacy inventory on production | Owner or the database owner | Part of FH-048S |
| Sign the open approvals named in each section | The role named there | The rows named there |
