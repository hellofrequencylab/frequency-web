# Hunts source and release evidence

The [build backlog](../BUILD-BACKLOG.json) is the status record. Use `pnpm ledger:view FH-001` for this row and `pnpm ledger:view LIVE-234` for the current commerce evidence. This document pins what was observed on November 10, 2026.

## Release identity

| Evidence | Observation | What it proves |
|---|---|---|
| Source | [GitHub main at `60c9e5bc10c3891d2eed1dfd68f34fba3146469a`](https://github.com/hellofrequencylab/frequency-web/tree/60c9e5bc10c3891d2eed1dfd68f34fba3146469a). The merged backlog at that commit recorded FH-001 and FH-002 open and FH-003, FH-010, FH-011 and FH-012 done. | Source and ledger state at the reference commit. |
| Reviewed CI | [FH-012 #4814](https://github.com/hellofrequencylab/frequency-web/pull/4814/checks) passed its required checks on reviewed head `1b455b91b6206fe8e1a881388d424abd0c237a3c`. [Packet E's receipt](https://github.com/hellofrequencylab/frequency-web/issues/4306#issuecomment-6777932906) links exact reviewed heads, including #4840, which was squashed as the pinned main SHA. | CI evidence applies to the reviewed heads. The separate [post-merge checks job](https://github.com/hellofrequencylab/frequency-web/actions/runs/42884688966/job/130076741926) on the serving SHA failed during the Git history fetch for `check:shipped-ids`. |
| Live | The `frequencylocal.com` alias pointed to [READY deployment `dpl_4d9xHeE4HYKxfRBBuNYmAyhvsAx1`](https://vercel.com/hellofrequencylab-5611s-projects/frequency-web/4d9xHeE4HYKxfRBBuNYmAyhvsAx1) at `c57d1a977df9df0d2eea2b95080f670f65a8f7a4`. The [pinned main build](https://vercel.com/hellofrequencylab-5611s-projects/frequency-web/BnLeWcE9R75n21UjRKzADJKZ7CJj) was canceled from the Vercel dashboard. Anonymous GETs returned `/` → 200, `/hunts` → 404, `/hunts/new` and `/scan` → 307 to `/`, and `/play` → 404. | Serving artifact and anonymous responses only. Effective flag values, signed-in behavior, scans and claims were outside the live check. |
| Provider | [LIVE-234](../BUILD-BACKLOG.json) records Daniel's November 9 confirmation that the House of Fates ticket payment reached the Space's balance. The [latest LIVE-234 fragment](../ledger/rows/LIVE-234.json) preserves the owner ruling to wait for real customers on the other four paths. | Existing ticket payout evidence. No provider query, fresh payment, refund or payout was performed for this pin. |
| Owner-dependent | LIVE-234 remains open and owner-timed for paid membership, booking deposit, shop order and donation. Device, venue and participant evidence belongs to named operators at the pilot gates. | Human evidence is still required where the ledger calls for it. |

## Engines, routes and controls

| Surface | Routes and authority in the pinned source | Control and owner boundary |
|---|---|---|
| Legacy Regulars Hunts | `/hunts/[slug]` reads `lib/loyalty/hunt-store.ts`. A Space check-in starts at `/n/[nodeId]` and uses `lib/engagement/capture.ts`, `lib/loyalty/visit.ts` and `lib/loyalty/hunts-visit.ts`. Stamps and completion are written through `loyalty_record_visit` and `loyalty_hunt_progress`. | `LOYALTY_ENABLED` defaults off. The host Space manages the Hunt and invited Spaces accept their own stops. The [Regulars runbook](../RUNBOOKS.md#regulars-live-940-adr-1780) owns launch checks and rollback. |
| Legacy QR campaigns | `/q/[slug]` resolves dynamic codes. Signed-in scans use the `qrscan:<code>:<profile>` idempotency key in the engagement ledger and dispatch the existing season challenge evaluator. The campaign uses `season_challenges` and `challenge_qr_codes`. | Campaign eligibility follows its active window and enrolled code set. The [QR Studio actions](../../app/%28main%29/admin/qr/campaign-actions.ts) authorize hosts and QR staff. Referral and scanner controls cover separate functions. |
| New Frequency Hunts | [D1](DECISIONS-D1.md) reserves `/play` and placement subroutes. The pinned source currently has authoring at `/hunts/new` and `/hunts/edit`, and the signed-in player page at `/hunts/[slug]/play`. Treat that difference as a source observation. The [coordination note](https://github.com/hellofrequencylab/frequency-web/issues/4306#issuecomment-6760893475) tracks the protected route-probe decision. | The [Hunts switches](../../lib/hunts/flags.ts) default off. `HUNTS_CLAIMS_ENABLED`, `HUNTS_AUTHORING_ENABLED` and `HUNTS_WORKER_ENABLED` require `HUNTS_ENABLED`. `HUNTS_REWARDS_ENABLED` also requires claims. Ownership and role checks are defined in the [role matrix](ROLE-MATRIX.md). |

## Migration references

| Boundary | Source migrations | Database evidence |
|---|---|---|
| Legacy Regulars | `20270346010200_space_loyalty.sql`, `20270346010300_loyalty_hunts.sql`, `20270346010400_loyalty_regulars_layer.sql` and `20270346010100_claim_loyalty_reward_atomic.sql`. | Source references. No new production ledger or schema read for these legacy migrations. |
| Legacy QR | `20260605010000_qr_codes_dynamic_links.sql` and `20260605030001_qr_campaign_challenges.sql`. | Source references. No real QR scan was made for this pin because the legacy GET can record an event. |
| New Hunts | `20270346031000_hunts_schema.sql`, `20270346032000_hunt_runs.sql`, `20270346036000_hunt_outbox.sql` and `20270346037000_hunt_claim_apply.sql`. | The [dated outbox checkpoint](https://github.com/hellofrequencylab/frequency-web/issues/4306#issuecomment-6770923613) observed migration `20270346036000` and its tables and lease function in Frequency Community. The [claim checkpoint](https://github.com/hellofrequencylab/frequency-web/issues/4306#issuecomment-6772601615) later observed `20270346037000` and `public.hunt_claim_apply`. No migration replay or claim was run for this pin. |

FH-002 uses this baseline to reproduce interruption and retry outcomes in isolation. Keep production payment, signed-in check-in, device and field acceptance with their existing owners and gates.

## Legacy seams in isolation

Observed November 16, 2026 on main at `e2016697d3c000d0d9d39bf3aea9b8618d26aefe`. Use `pnpm ledger:view FH-002` and `pnpm ledger:view FH-002S` for status. One command runs all five seams and exits non-zero when a surviving record differs from the table:

```
node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/probes/hunts/legacy-seams.mjs
```

It runs the shipped orchestrators (`createCampaign`, `recordEngagementEvent`, `captureNode`, `recordLoyaltyVisit`, `applyClaim`, `grantReward`) against the in-memory fixture in `scripts/probes/hunts/legacy-seams-fixture.mjs`. No database, provider or network is used.

| Seam | Injected condition | Records that survive | Adapter boundary |
|---|---|---|---|
| Duplicate QR membership | One code enrolled twice, then scanned twice | Two campaign code rows for three inputs, one progress credit per code, one reward grant and one Zap entry at completion | `qrscan:<code>:<profile>` idempotency key in the engagement ledger |
| Lost post-capture side effect | The Zap award throws after the capture is written | The ledger row and the capture row. No Zap entry, and the retry answers `already_captured`, so the award is never replayed | Hunt credits leave through the durable outbox (`hunt_outbox`), not an inline award |
| Scarcity, cap already reached | Two members scan a code whose cap is spent | The earlier capture only. Both are refused `capacity_reached`, no ledger row, no Zaps | `verifyCapture` count |
| Scarcity, last unit | Two members scan together with one unit left | One capture, one ledger row and one Zap award. The other member is refused `capacity_reached`, and so is anyone arriving afterwards. Before [the claim migration](../../supabase/migrations/20270346084000_node_capture_claim.sql) is applied the caller falls back to the old order and the same race still leaves two of each; the run pins both | `public.node_capture_claim`: the node row lock, the count and both writes in one transaction, called by `lib/engagement/capture.ts` for a node with `max_claims`. The Hunt boundary is `public.hunt_reward_grant` |
| Existing Zap grant | A reward grant already exists when the scan completes the campaign | The original grant and its one Zap entry. Progress still moves | Unique `(rule_key, profile_id)` on `reward_grants` |
| Already checked-in member | Same-day Regulars stamp, then fresh Hunt evidence twice | One stamp and one check-in award. One Hunt claim, replayed on the second call | `hunt_claim_apply` idempotency key and request hash, independent of the stamp |

### What the scarcity result does and does not prove

- **Proven in the fixture.** Given the answers `node_capture_claim` returns when its count and its writes are one step, the shipped caller `captureNode` leaves one capture, one ledger row and one award for the last unit and refuses the other member `capacity_reached`. With the function missing (the state before the migration is applied) it falls back to a count, then an insert, under two different ledger keys, and the last unit still oversells. The fixture stands in for the node row lock; it does not exercise it.
- **Proven by pgTAP, sequentially.** [`supabase/tests/node_capture_claim.test.sql`](../../supabase/tests/node_capture_claim.test.sql): the last unit is taken once, the second member is refused and nothing is written for them, the same member replaying their key spends no unit, and an uncapped node is never refused.
- **Proven with live sessions, off production.** On November 16, 2026 the migration file was loaded into a local Postgres 16 holding only the four tables the function touches (not the full schema, and with stand-ins for the pgTAP functions). Two sessions at the last unit of one: the first claimed, the second waited on the node lock and answered `capacity_reached`, leaving one capture and one ledger row. Forty sessions for forty members against a cap of five: five claimed, thirty-five refused, five captures. Twenty sessions replaying one member's key: one claimed, nineteen `already_captured`. The control, the old count-then-insert order in two sessions, wrote two captures against a cap of one. This is not in CI.
- **Proven in the fixture.** Given the answers `hunt_reward_grant` returns when its check and write are one step, the shipped caller `grantReward` leaves one grant record and tells the other player `sold_out` with the published terms. The fixture stands in for the row lock; it does not exercise it.
- **Proven by pgTAP, sequentially.** [`supabase/tests/hunt_rewards.test.sql`](../../supabase/tests/hunt_rewards.test.sql) grants the last unit to the first qualifying player, answers the second `sold_out` with terms, keeps one grant and a count of one, and shows a direct write cannot push `granted_count` past `stock` (check constraint, `23514`).
- **Not proven here.** No Postgres race was run for the Hunt reward grant. Two live sessions competing for the last reward unit are carried by the reward row lock (`select ... for update` in [the rewards migration](../../supabase/migrations/20270346042000_hunt_rewards.sql)); that test file's header records a by-hand two-session check and says one pgTAP session cannot repeat it. `hunt_claim_apply` has no capacity concept: it serialises one player's evidence, and scarcity belongs to the reward grant.
- **Not proven here.** Nothing was observed on the production database, and no real capped code was scanned.
