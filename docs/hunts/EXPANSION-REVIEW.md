# Frequency Hunts expansion and legacy retirement review (FH-048)

Status lives in [`docs/BUILD-BACKLOG.json`](../BUILD-BACKLOG.json) (`pnpm ledger:view FH-048`, `pnpm ledger:view FH-048S`). This page records no status. It sets out how each optional expansion would be approved, switched, watched and rolled back, what each one needs measured once pilots run, and what is owed before a legacy path can retire. Whether a pilot, sign-off or build row is done is that row in the backlog, never a sentence here.

**Written 2026-11-16, before any pilot ran.** It holds no cohort numbers, no operational cost and no merchant benefit reading, because there is nothing to read yet. The pilots that would produce them are FH-019 (free Trail), FH-027 (single business), FH-033 (district Passport and rally drill) and FH-034 (regional skate). The owner has paused the Hunts launch to January 31, 2027, and every `HUNTS_*` switch stays blank (off) until then. The comparison itself is FH-048S, and it is done when the readings section at the bottom carries a dated line.

Pilot readings recorded: (blank until FH-048S fills the readings section)

Sources this page leans on: the switch ladder in `lib/hunts/flags.ts` and the [Hunts switch runbook](../RUNBOOKS.md#frequency-hunts-switches), the event registry in `lib/hunts/analytics.ts` (FH-025), route health in `lib/hunts/route-health.ts` (FH-032), the merchant report in `lib/hunts/merchant-report.ts` (FH-026), and the legacy decision in [DECISIONS-D1.md](DECISIONS-D1.md) (FH-003).

## 1. What every expansion shares

**Switches.** There are seven, all read through `envFlag` and all listed blank in `.env.example`:

| Switch | Opens | Needs |
|---|---|---|
| `HUNTS_ENABLED` | browse, entry, the player's own run, event recording | nothing |
| `HUNTS_CLAIMS_ENABLED` | a scan or proof may credit a mission; the staff door | `HUNTS_ENABLED` |
| `HUNTS_REWARDS_ENABLED` | a credit may grant a reward through the outbox | `HUNTS_CLAIMS_ENABLED` |
| `HUNTS_AUTHORING_ENABLED` | creators draft, publish and release | `HUNTS_ENABLED` |
| `HUNTS_WORKER_ENABLED` | the outbox worker leases and delivers rows | `HUNTS_ENABLED` |
| `HUNTS_COMMERCE_ENABLED` | Experience Passes, store-item benefits, donation and sponsor money, the finance view | `HUNTS_ENABLED` |
| `HUNTS_GUEST_ANALYTICS_ENABLED` | a signed-out visitor's Hunt events may leave for Google Analytics | `HUNTS_ENABLED` |

**No expansion has a switch of its own.** Branches and Mystery, editions and the Event finale are turned on per Hunt by what an author publishes (a `choice_group`, an `answer_hash`, a `policy.finale.event_id`, a new edition), on top of the shared rungs. Teams have no per-Hunt gate at all in the FH-043 code: with claims on, a player can form a team on any live Trail (section 2.1). Fundraising and sponsor money ride `HUNTS_COMMERCE_ENABLED` plus a per-Hunt approval stored on the row. That means the rungs cannot launch one expansion while holding another back across the whole site. The per-Hunt data gate can, because no Hunt carries an expansion until someone with publish rights authors it. If the owner wants a site-wide off for one expansion independent of the others, that is a new switch and a new row (FH-048S names this as a decision to take after the readings).

**Monitoring every expansion uses.**

- **Route health**, `/hunts/<slug>/health` (FH-032): runs started, playing, finished and not started; per stop, runs that reached it, the wait after it, and runs stalled 24 hours or more; use of each alternate; open and closed placements; outbox message status. Organiser only, aggregate only.
- **Merchant report**, `/hunts/<slug>/report` and its export (FH-026): per venue, confirmed stops by assurance, distinct runs, held claims, rewards handed over, per-offer counts, separately authorised contacts. Small cross-venue cells are suppressed.
- **Event registry** (FH-025): five events recorded first-party in `engagement_events` (`event_type` is the event name, `context` holds only the allowlisted dimensions). Names and dimensions are in section 3.
- **Outbox**, `hunt_outbox`: `pending`, `leased`, `done`, `dead` per consumer. A rising `dead` count or a `pending` row older than a day is the first sign a delivery path broke.
- **Moderation queue**, `/hunts/moderation` (FH-018S), for reports and pauses on a live Hunt.
- **Finance view**, `/hunts/finance`, and `hunt_reconciliation` for anything that moves money.

**Rollback every expansion shares.** Unset the switch (or the per-Hunt data gate). The runbook rule holds for all of them: no data moves, claims already credited stay credited, granted rewards stay granted, and outbox rows wait for the worker. A Hunt that misbehaves while live is paused through `hunt_moderate` (pause keeps every player's progress) before any switch is touched.

## 2. Each optional expansion

Each block names the approval rows that must be signed (status is the backlog), the switches it needs on, the per-Hunt gate, the extra monitoring, and the rollback with what data stays.

### 2.1 Teams (Expedition)

- **Code:** `lib/hunts/teams.ts`, `lib/hunts/team-store.ts`, tables `hunt_teams`, `hunt_team_members`, `hunt_team_awards`, door `hunt_team_claim_apply` (migration `20270346082000_hunt_teams_editions.sql`).
- **Approval gate:** FH-043 (engine), FH-043S (team screens, scan hand-off, award wiring), FH-043T (real-phone design look, the owner's per-reward rule for a team, and a live two-member check), plus the district drill FH-033 that FH-043 requires and the tenancy wall FH-008. The team reward rule in FH-043T is an owner decision and must be recorded before any team Hunt grants a reward.
- **Switches:** `HUNTS_ENABLED`, `HUNTS_CLAIMS_ENABLED` (every team store call answers `disabled` without it); `HUNTS_REWARDS_ENABLED` only after the FH-043T reward rule is signed.
- **Per-Hunt gate:** none in the FH-043 code. `hunt_team_claim_apply` checks that the Hunt is live and the team's version is current, not that the author allowed teams. Before a team launch can be held apart from solo play, either a per-Hunt opt-in (a `hunt_versions.policy` key the team door checks) or a team switch has to be built. FH-048S carries that decision.
- **Extra monitoring:** `hunt_teams` by `state` (`forming`, `locked`, `disbanded`); team runs in route health (a team is one run, so stall points read the same); held claims from members who left (the claim trigger refuses an outsider or departed member, so a spike is a support signal, not a credit leak).
- **Rollback:** unset `HUNTS_CLAIMS_ENABLED` (which also stops solo claims, the reason a team-only gate is owed) or pause the Hunt. Rosters, team runs, team credits and `hunt_team_awards` stay as written; no member's solo progress is touched. A forming team that never locked simply stops.

### 2.2 Exclusive branches and Mystery answers

- **Code:** `lib/hunts/graph/branches.ts`, `lib/hunts/mystery.ts`; columns `hunt_missions.choice_group`, `fallback_group`, `answer_hash`; publish blockers `BRANCH_DEAD_END`, `CHOICE_LIMIT`, `MYSTERY_NO_FALLBACK`.
- **Approval gate:** FH-042 (engine) and the district drill FH-033 it requires. No legal or finance sign-off: branches move no money and hold no personal data beyond the run.
- **Switches:** `HUNTS_ENABLED`, `HUNTS_CLAIMS_ENABLED`, and `HUNTS_AUTHORING_ENABLED` to publish one.
- **Per-Hunt gate:** a published version that sets a `choice_group` or an `answer_hash`. Validation refuses a Mystery with no staffed fallback.
- **Extra monitoring:** `hunt.stop_claim` with `reason_class` `proof_failed` on Mystery stops (wrong answers), the share of runs that finished through a fallback, and route-health stalls on the stop after a choice. A choice group whose members are never chosen is a design finding, not an incident.
- **Rollback:** publish a new edition without the group (section 2.5), or pause the Hunt. Choices already made stand with their credits; answer attempts stay recorded; a run is never moved to the other branch.

### 2.3 Fundraiser and sponsor

- **Code:** `lib/hunts/donation-ask.ts` (tables `hunt_donation_asks`, `hunt_donation_gifts`), `lib/hunts/sponsor-milestone.ts` and `lib/hunts/graph/sponsor-milestone-math.ts` (tables `hunt_sponsor_agreements`, `hunt_sponsor_snapshots`, `hunt_sponsor_settlements`), `lib/hunts/sponsor-settlement.ts`.
- **Approval gate:** FH-045 (D8 beneficiary and sponsor model, legal and finance), which itself needs FH-035 (D7 funds flow) and FH-041 (Stripe gate). Built pieces: FH-046 (donation ask), FH-047 (sponsor milestone). A chance mechanic fails template review under FH-045.
- **Switches:** `HUNTS_ENABLED` and `HUNTS_COMMERCE_ENABLED` (donation sync and sponsor settlement both read it).
- **Per-Hunt gate:** a donation ask shows only with `enabled` true and a recorded `approved_at` and `approved_by`; a sponsor agreement is inert until `status = 'active'` with an approver. Payee readiness is checked before the ask shows.
- **Extra monitoring:** `hunt_donation_gifts` by `status` (`started`, `settled`, `abandoned`, `refunded`), settled net of refunds only; sponsor snapshots frozen once per agreement and settlements with a provider reference; the three public money lines (raised donations, sponsor pledged, sponsor paid) never merged. Progression must not move on any gift (pinned by test).
- **Rollback:** unset `HUNTS_COMMERCE_ENABLED`, or clear the ask's `enabled`. Settled gifts, refunds and frozen snapshots stay; an unpaid pledge is still not shown as raised. Refunds keep flowing through the Space donation checkout, which is not behind a Hunt switch.

### 2.4 Commerce and the Experience Pass

- **Code:** `lib/hunts/pass-gate.ts`, `pass-binding.ts`, `pass-checkout.ts`, `commerce-hooks.ts`, `commerce-webhook.ts`, `order-hooks.ts`; tables `hunt_entitlements`, `hunt_pass_bindings`, `hunt_store_offers`, `hunt_commerce_intents`, `hunt_commerce_audit`, `hunt_refund_cases`, `hunt_reconciliation`; the kill switch row `hunt_commerce_state.sales_open`.
- **Approval gate:** FH-035 (D7 funds flow, finance and legal), FH-041 (Stripe and progressive-dinner pilot gate, with its runbook checklist), FH-036S (Pass wired into ticket checkout). The runbook gate also asks for a green `hunt_commerce_state` kill switch drill.
- **Switches:** `HUNTS_ENABLED`, `HUNTS_COMMERCE_ENABLED`.
- **Per-Hunt gate:** a Pass binding written through `validateBinding` on a bound ticket tier; sales open only while `hunt_commerce_state.sales_open` is true.
- **Extra monitoring:** the finance view; `hunt_reconciliation` (provider, canonical ticket, benefit, refund and settlement each reconcile independently, per FH-041); `hunt_entitlements` by `state`; `hunt_refund_cases`; outbox `dead` rows on commerce consumers.
- **Rollback:** first set `hunt_commerce_state.sales_open` false (holds new sales, keeps refunds and reconciliation running), then unset `HUNTS_COMMERCE_ENABLED`. Entitlements, tickets, refunds and audit rows stay. A paid player keeps the ticket the Event owns.

### 2.5 Seasonal editions and legacy imports

- **Code:** `lib/hunts/editions.ts`, `lib/hunts/edition-store.ts`; `hunt_versions.status` `superseded`; run pinning trigger and grace window (migrations `20270346082000_hunt_teams_editions.sql`, `20270346085000_hunt_edition_grace.sql`).
- **Approval gate:** FH-044 (engine), FH-044S (screens and the owner's rule for runs in flight at a release), FH-044T (database owner applies the migrations, then an operator walks one pilot Trail through a release with real printed codes).
- **Switches:** `HUNTS_AUTHORING_ENABLED` for release, preview and import; `HUNTS_ENABLED` for a member's earlier-edition record and old grant reads.
- **Per-Hunt gate:** an author releases a new edition. Nothing changes on any Hunt that is not released.
- **Extra monitoring:** codes retired at each release (preview shows the count before the tap); `hunt.placement_scan` with `reason_class` `closed` after a release (a retired sign being scanned); runs still on the outgoing edition inside the grace window.
- **Rollback:** an edition is frozen once published, so rollback is releasing the previous shape as a further edition, not reverting. Pinned runs keep their rules and credits; imports never copied a stamp, completion, scan or reward, so nothing to unwind on the legacy side.

### 2.6 Partner collective and the Event finale

- **Code:** `lib/hunts/partners.ts`, `partner-store.ts` (table `hunt_partners`); `lib/hunts/rally-finale.ts`, `rally-finale-store.ts` (reads `hunt_versions.policy.finale.event_id` and the Events tables, writes nothing).
- **Approval gate:** FH-028S (a real operator walks the partner agreement; partnerships owner, finance and counsel approve `PARTNER-AGREEMENT.md`), FH-029S (pin the approved terms so acceptance opens), FH-029 (invites), FH-031, FH-031S and FH-031T (the finale seat gate on the completion reward and the Event stop), FH-032S (live partner state and finale broadcast in route health), and the district drill FH-033.
- **Switches:** `HUNTS_ENABLED` (finale read), `HUNTS_AUTHORING_ENABLED` (invites, picking the host Event), `HUNTS_CLAIMS_ENABLED` (a stop at a partner venue), `HUNTS_REWARDS_ENABLED` only after FH-031T puts the seat check on the grant.
- **Per-Hunt gate:** an accepted, effective, unrevoked `hunt_partners` row per outside venue (publish and `hunt_claim_apply` both refuse a stop at a venue with none), and a finale Event set at publish.
- **Extra monitoring:** `hunt_partners` by `status`; the merchant report per partner venue; finale access answers (full, no seat, seated); `hunt.staff_verify` with `assurance` `event_door` at the host Event.
- **Rollback:** a venue withdraws or is revoked, which ends new proof there at once and keeps its historic credit; the Event keeps every seat and ticket because the Hunt never wrote one. Unsetting the switches leaves partner rows and audit as written.

## 3. What each expansion needs measured

The registry gives five events. Every one carries only `hunt_id`, `reason_class`, `medium`, `cohort`, `assurance` and `replayed`:

| Event | Means |
|---|---|
| `hunt.placement_scan` | a printed or tapped placement was opened |
| `hunt.stop_claim` | a player asked to confirm a stop |
| `hunt.staff_verify` | a venue checked a player proof at the door |
| `hunt.reward_redeem` | a venue handed over a reward |
| `hunt.reward_void` | a venue cancelled a reward |

Closed values: `reason_class` is one of `opened`, `credited`, `replayed`, `held`, `not_eligible`, `closed`, `proof_failed`, `not_permitted`, `redeemed`, `voided`, `unavailable`; `medium` is `qr`, `nfc`, `staff`, `event`, `typed`; `cohort` is `guest`, `member`, `staff`; `assurance` is `none`, `signed_node`, `staff`, `event_door`.

**The registry's `cohort` is who acted, not which pilot.** There is no experiment or expansion dimension, and adding one would widen the allowlist. A pilot cohort is therefore a set of `hunt_id`s. The readings table names which Hunt was which pilot and which expansions it carried.

### Comparison template

Fill one column per pilot Hunt. The free Trail pilot (FH-019) is the baseline every expansion is read against.

| Measure | Source | Baseline (FH-019) | Pilot Hunt under review |
|---|---|---|---|
| Runs started, finished, finish rate | route health; `hunt_runs` | | |
| Median and worst stall stop, runs stalled 24h+ | route health | | |
| Scans per run, by `medium` | `hunt.placement_scan` | | |
| Claims by `reason_class` (share `credited`, `held`, `proof_failed`, `not_eligible`) | `hunt.stop_claim` | | |
| Replays (`replayed` true) per 100 claims | `hunt.stop_claim` | | |
| Door checks by `assurance` | `hunt.staff_verify` | | |
| Rewards handed over vs voided | `hunt.reward_redeem`, `hunt.reward_void` | | |
| Guest vs member share of scans | `cohort` on `hunt.placement_scan` | | |
| Held claims and time to decision | `hunt_claims`, review audit | | |
| Outbox `dead` and oldest `pending` | `hunt_outbox` | | |
| Per-venue confirmed stops, distinct runs, contacts | merchant report | | |
| Staff minutes per run, support contacts, incidents | pilot lead's field report (not in code) | | |
| Merchant benefit as the venue states it | pilot field report, quoted | | |
| Field risks found and what closed them | pilot field report | | |

Per expansion, add:

- **Teams:** team runs vs solo runs finish rate; `replayed` claims from teammates (one team credit per stop should show as replays, never as two credits); departures after lock.
- **Branches and Mystery:** share of runs per branch; `proof_failed` per Mystery stop; share finishing through the fallback.
- **Fundraiser and sponsor:** gifts started, settled, abandoned, refunded (settled net only); sponsor threshold reached or not; any progression difference between givers and non-givers (must be none).
- **Commerce:** paid runs started vs passes sold; refunds and disputes; reconciliation breaks; staff time at the door for paid vs free.
- **Editions:** retired-sign scans after release; in-flight runs finishing inside grace; support contacts about moved codes.
- **Partners and finale:** stops confirmed per partner venue; withdrawals; finished players turned away because the Event was full or they had no seat.

Example read (SQL text, not run; one Hunt over a pilot window):

```sql
select event_type,
       context->>'reason_class' as reason_class,
       context->>'cohort'       as cohort,
       context->>'assurance'    as assurance,
       count(*)                 as n
from public.engagement_events
where event_type like 'hunt.%'
  and context->>'hunt_id' = :hunt_id
  and created_at between :window_start and :window_end
group by 1, 2, 3, 4
order by 1, 5 desc;
```

## 4. Legacy retirement inventory

D1 keeps three legacy paths exactly as they are. None retires because the new engine exists. Each retires only when every obligation below has reached zero or has an owner, and that retirement is its own row with its own probe. Counting queries are SQL text for the database owner to run read-only; they have not been run.

### 4.1 Regulars Hunts

- **Where:** `lib/loyalty/hunts.ts`, `hunt-store.ts`, `hunt-actions.ts`, `hunts-visit.ts`; the page `app/(main)/hunts/[slug]/page.tsx`; tables `loyalty_hunts`, `loyalty_hunt_stops`, `loyalty_hunt_completions`, `loyalty_stamps` (`kind = 'hunt'`), `loyalty_rewards`; progress written by `loyalty_hunt_progress()` from every check-in capture; gated by `LOYALTY_ENABLED`.
- **Obligations:** printed and shared `/hunts/<slug>` links; live hunts and players part way through one; completion rewards earned and not yet redeemed; the `hunt_complete` Zaps already paid. Note that the new engine's player and organiser pages also live under `/hunts/<slug>/...` while the legacy page owns `/hunts/<slug>` itself, and both tables keep their own unique `slug`; retirement must keep a printed legacy link resolving (a redirect or a closed-hunt page), never a 404 and never a different Hunt.
- **Before it retires:** no `live` hunt with `ends_on` in the future; every completion reward redeemed, expired by the Space's own terms, or carried with an owner; the page answers for every slug that ever went live; `hunts-visit.ts` removed from capture in the same change, with a test that capture still stamps Regulars once per day.

```sql
-- Live or upcoming Regulars Hunts
select status, count(*) from public.loyalty_hunts group by status;
select id, slug, host_space_id, starts_on, ends_on
from public.loyalty_hunts where status = 'live' and ends_on >= current_date;

-- Players part way through a live hunt (a hunt stamp, no completion)
select h.id, count(distinct st.profile_id) as players_in_progress
from public.loyalty_hunts h
join public.loyalty_hunt_stops s on s.hunt_id = h.id and s.status = 'accepted'
join public.loyalty_stamps st on st.space_id = s.space_id and st.kind = 'hunt'
     and st.visit_day between h.starts_on and h.ends_on
left join public.loyalty_hunt_completions c on c.hunt_id = h.id and c.profile_id = st.profile_id
where h.status = 'live' and h.ends_on >= current_date and c.profile_id is null
group by h.id;

-- Completion rewards granted and not redeemed
select count(*)
from public.loyalty_hunt_completions c
join public.loyalty_rewards r on r.id = c.reward_id
where r.redeemed_at is null;

-- Use in the last 90 days
select count(*) from public.loyalty_hunt_completions where created_at > now() - interval '90 days';
```

### 4.2 QR campaigns

- **Where:** `/admin/qr` (`app/(main)/admin/qr/`, including `campaign-actions.ts`), the short link `app/q/[slug]/route.ts` with `record_qr_scan`, tables `qr_codes`, `qr_scans`, `season_challenges` (criteria type `qr_scan`), `challenge_qr_codes`, `challenge_progress`; progress is advanced in `lib/achievements.ts`.
- **Obligations:** every printed `/q/<slug>` code (event, Circle, member and Space codes ride the same table, so most QR codes are not campaigns and never retire with them); campaigns inside their `valid_from` to `valid_until` window; members part way through one; Zaps already paid on completion.
- **Before it retires:** only the campaign half can retire. No `qr_scan` challenge has an open window; no member has partial progress on one, or each has an owner-approved close; a campaign can be cloned to a Passport draft through `loadQrCampaignImport` (FH-044) with no retroactive credit, as D1 requires; `/q/<slug>` keeps redirecting for every code.

```sql
-- Campaigns and their windows
select id, name, valid_from, valid_until
from public.season_challenges
where criteria->>'type' = 'qr_scan'
  and (valid_until is null or valid_until > now());

-- Codes in a campaign that are still live
select count(distinct q.id)
from public.challenge_qr_codes cq
join public.qr_codes q on q.id = cq.qr_code_id
where q.active and (q.valid_until is null or q.valid_until > now());

-- Members part way through a campaign
select p.challenge_id, count(*) as in_progress
from public.challenge_progress p
join public.season_challenges c on c.id = p.challenge_id
where c.criteria->>'type' = 'qr_scan' and p.completed_at is null and p.current > 0
group by p.challenge_id;

-- Campaign scans in the last 90 days
select count(*)
from public.qr_scans s
join public.challenge_qr_codes cq on cq.qr_code_id = s.qr_code_id
where s.scanned_at > now() - interval '90 days';
```

### 4.3 Legacy check-in capture

- **Where:** `lib/engagement/capture.ts` (verify, ledger, capture row, Zaps, Regulars stamp, Regulars hunt progress, plaque offer), the node page `app/(main)/n/[nodeId]`, tables `nodes`, `captures`, `engagement_events`, `partner_offers`, `partner_redemptions`; signed node codes in `lib/qr/node-code.ts`.
- **Obligations:** every printed plaque and NFC tag; the member-day ledger and the check-in Zaps; Regulars stamps; live plaque offers. Codes printed before signing stop claiming at `LEGACY_NODE_CODE_GRACE_ENDS` (2026-12-01 UTC, ADR-1654), so print inventory must be checked before that date whatever happens to Hunts.
- **Before anything here retires:** capture is not a Hunt path and D1 does not plan to retire it. Hunts never write through it. The only retirement in scope is the Regulars hunt projection inside it (section 4.1). The capped-code race in FH-002S is a capture fix, not a retirement.

```sql
-- Active nodes and their recent use
select n.type, count(*) as active_nodes
from public.nodes n
where n.active and (n.valid_until is null or n.valid_until > now())
group by n.type;

select date_trunc('week', captured_at) as week, count(*) as captures
from public.captures
where captured_at > now() - interval '90 days'
group by 1 order by 1;

-- Live plaque offers and their redemptions
select count(*) from public.partner_offers
where active and (valid_until is null or valid_until > now());
select count(*) from public.partner_redemptions where redeemed_at > now() - interval '90 days';
```

## 5. Pilot readings

Empty on purpose. FH-048S fills this section once the pilots it names have run: one comparison table per pilot Hunt from section 3, the field report it quotes, and the owner's call on which expansions launch, which wait and whether any needs its own switch. It then replaces the blank line near the top with `Pilot readings recorded:` followed by the date.
