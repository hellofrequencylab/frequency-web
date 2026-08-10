# Migrations — the two-step protocol

> **The ledger is an exact bijection with this directory as of 2026-08-10: 594 ⇄ 594, zero
> drift in either direction** ([ADR-963](../../docs/DECISIONS.md)). Keeping it that way costs
> one step per migration. Losing it has cost four separate repair passes.

## The rule

**Applying a migration is two steps, not one.** The second one is the one everybody forgets.

1. **Apply** it — `mcp__Supabase__apply_migration`, or `supabase db push` if the ledger is clean.
2. **Repair the ledger** so the row carries the REPO version, not the one the tool minted.

## Why step 2 exists

`apply_migration` mints its own timestamp (`20260810150605`) and records the row under that.
The file in this directory is numbered `20270216000000`. Those are the same apply, recorded
twice under different names, and the consequences compound:

- `supabase db push` sees a repo version above the ledger head and **tries to re-run it**.
  `create policy` and `alter table … add constraint` are not idempotent, so it fails partway
  and leaves the ledger in a third state.
- The orphan row never goes away on its own. Thirteen had accumulated by 2026-08-10.

## The repair

Verify against the live catalog **before** writing — never trust a filename:

```sql
begin;

-- Assert the thing is genuinely applied. Any failure aborts the whole transaction.
do $$
begin
  if to_regclass('public.your_new_table') is null then
    raise exception 'not actually applied, aborting';
  end if;
end $$;

insert into supabase_migrations.schema_migrations (version, name)
values ('20270216000000', 'your_migration_name')
on conflict (version) do nothing;

-- Retire the tool-minted twin.
delete from supabase_migrations.schema_migrations where version = '20260810150605';

commit;
```

## Two traps, both hit for real

**Do not delete a row just because its name is duplicated.** On 2026-08-10 the ledger held
`hierarchy_v3_topical_channels` at both `20240118000000` and `20240201000000`. The second is
that migration. The first is `20240118000000_gamification.sql` wearing a stale label — the
version is correct and applied, and deleting it would have removed a real migration's only
ledger row. **Check for a repo file at that version before deleting anything.** Fix the label
instead.

**A duplicated name can be legitimate.** `fk_covering_indexes` names two genuinely different
files (`20260820000000` and `20261186000000`). Names are not unique; versions are.

## Verifying the bijection

```sql
select version from supabase_migrations.schema_migrations order by version;
```

versus `ls supabase/migrations/*.sql | sed 's|.*/||; s|_.*||' | sort`, then `comm`. Both sides
of the diff must be empty. `pnpm check:migrations` covers the repo half (unique, parseable
versions — a collision silently skips a migration on a fresh apply); the DB half needs
credentials and is checked by hand or by `/maintenance`.
