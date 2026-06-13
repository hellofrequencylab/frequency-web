# Database backups

> ⚠️ **Do not commit data snapshots to this folder.** They contain member PII
> (profile UUIDs, post bodies, live storage URLs) and must never enter git history.
> `supabase/backups/*.json` is gitignored to enforce this.

Point-in-time snapshots taken before destructive data operations are **data**, not
schema (schema lives in `supabase/migrations/`). Keep them **outside the repo** — a
secure bucket, an encrypted store, or Supabase's own backups
(Dashboard → Database → Backups) — never in version control.

If you need a snapshot before a destructive op, write it somewhere outside the repo:

```bash
# example: a data-only dump saved OUTSIDE the working tree
supabase db dump --linked --data-only -f ~/secure-backups/snapshot_$(date +%Y%m%d).sql
```

This folder is kept only for this note; no data files belong here.
