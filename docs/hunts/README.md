# Frequency Hunts

Status is the ledger, never this file: rows FH-001 to FH-048 in `docs/ledger/rows/` (`pnpm backlog`, `pnpm ledger:view FH-010`). This page only explains the program.

Frequency Hunts lets a resident publish a clue trail, a business turn discovery into a storefront visit, and a group of independent businesses run a shared game that ends in a gathering. All three run on one versioned engine (`lib/hunts/`), separate from the older Regulars Hunts in `lib/loyalty/hunts*.ts` and the QR campaign engine, which keep their routes and history.

Source: the Frequency Hunts Build Plan (9 Nov 2026), kept in the project files under `hunts/` (strategy, repository audit, engine and data model, experience, commerce and privacy, delivery gates, contracts, fixtures).

Tiers, in hard dependency order. Each tier also has a release gate beyond its tasks.

| Tier | Scope | Rows |
|---|---|---|
| 0 Foundation | evidence, roles, schema, graph engine, tenant wall, outbox, apply command, switches | FH-001 to FH-011 |
| 1 Community | free resident Trail, creator editor, QR and NFC placement, player, moderation | FH-012 to FH-019 |
| 2 Business | staff proof, rewards, redemption station, consent ledger, merchant reports | FH-020 to FH-027 |
| 3 Collective | partner Spaces, N-of-M Passport, Event finale, route health | FH-028 to FH-034 |
| 4 Commerce | Experience Pass, ticket entitlements, refunds, reconciliation | FH-035 to FH-041 |
| 5 Advanced | branches, teams, editions, fundraising, sponsor milestones | FH-042 to FH-048 |

Rules that hold across tiers: a GET never credits progress; scarce effects (stock, rewards) happen inside one transaction with a durable outbox; every new capability ships behind an off switch (`envFlag`); migrations go through the serialized gate (docs/DATABASE.md).
