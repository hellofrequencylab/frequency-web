-- LIVE-822 (owner ruling 2026-10-06 21:45): "My space should be a Collective account with no limits."
-- Collective still carries counted caps (QR codes 5, operator seats, contacts, sends...). This adds a
-- staff-only override: a Space with limits_waived = true resolves every meter and count cap to
-- unlimited and clears every plan gate at the Collective level (lib/pricing/space-allowance.ts
-- spaceLimitsWaived, read by the meter seam, the seat check, the payments gate and the Space
-- function gates).
--
-- WHO SETS IT: staff, in the SQL editor, for comp accounts. Never the owner. There is no app writer.
--
-- SECURITY POSTURE (mirrors spaces.beta_price_grant, 20270304000100):
--   READ: spaces grants SELECT to anon/authenticated at COLUMN level, so a new column is invisible to
--   both browser roles with no statement needed.
--   WRITE: spaces carries table-level UPDATE for the browser roles, but RLS is on and the only policy
--   is spaces_read_active (FOR SELECT). With no UPDATE policy every browser UPDATE is denied, so an
--   owner cannot flip this. A column-level revoke would change nothing while UPDATE is held at table
--   level, so none is attempted. If an UPDATE policy is ever added to spaces, it must exclude this
--   column (or the table-level grant must be narrowed first).
--
-- Additive and idempotent. NOT NULL DEFAULT FALSE so every existing Space keeps its caps.

begin;

alter table public.spaces add column if not exists limits_waived boolean not null default false;

comment on column public.spaces.limits_waived is
  'Staff-only comp override (LIVE-822): true lifts every meter and count cap and opens every plan gate at the Collective level. Set only by staff in the SQL editor, never by the owner.';

commit;
