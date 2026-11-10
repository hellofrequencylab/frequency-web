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
