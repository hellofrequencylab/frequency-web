-- ADR-127: the operations roles on the staff axis.
--
-- team_members.role was free text, documented as analyst|marketer|admin|owner.
-- Add the new functional roles (operations, accounting, support) and enforce the
-- full set with a CHECK constraint. Additive + safe: every existing value is in the
-- new set, so this never rejects current rows. The capability matrix that gives each
-- role its access lives in code (lib/core/staff-roles.ts).

alter table public.team_members
  drop constraint if exists team_members_role_check;

alter table public.team_members
  add constraint team_members_role_check
  check (role in ('owner', 'admin', 'operations', 'marketer', 'accounting', 'support', 'analyst'));
