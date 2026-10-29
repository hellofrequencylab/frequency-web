# Launch consent evidence: retention policy

Decisions are in [ADR-1926](DECISIONS.md); status of the work is `LIVE-1775` in `docs/BUILD-BACKLOG.json`.

`launch_list_attestations` holds the consent answer a person gave before an email list was imported: wording version, answer, time, and the original `launch_ref` / `source_ref`. It survives deletion of its Launch or source.

## Owner policy (Daniel, 2026-10-28)

- **Retention:** 3 years after the list was imported (`attested_at`).
- **Legal hold:** a flag that only a database owner can set. Held evidence is never purged. The column is not built yet.
- **Subject request:** delete the answer, keep a dated tombstone. The tombstone shape is not built yet.
- **Purge:** only Daniel, by a logged SQL change. No scheduled job.

## What exists and what does not

- No API role can update or delete this table. A database owner (`postgres`) can; that is the only purge path.
- Not built: hold flag, tombstone, purge tooling, access audit. Each needs its own migration and review before use.
- Evidence deleted before migration `20270346027100` cannot be recovered. The production table held 0 rows on 2026-10-28.
