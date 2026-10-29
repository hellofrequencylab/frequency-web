-- Launch consent evidence survives deletion of its Launch or source (LIVE-1773).
--
-- 20270346026000_vera_launch made launch_list_attestations.launch_id NOT NULL ON DELETE CASCADE, so
-- deleting a Launch (or its owner's profile) erased the consent evidence for an imported list. This
-- forward repair keeps the minimal evidence: wording version, answer, time, and the pseudonymous
-- original ids (launch_ref, source_ref). It does not recover evidence deleted before it is applied.
--
-- 1. launch_ref / source_ref: plain uuids with no foreign key, stamped from launch_id / source_id.
-- 2. launch_id becomes nullable and its FK becomes ON DELETE SET NULL (source_id already is).
-- 3. A source must belong to the Launch it is attested under, and the refs are stamped by a trigger.
-- 4. Evidence fields are immutable; the only legal UPDATE is the FK detach (launch_id / source_id to null).
-- 5. DELETE and TRUNCATE are refused; service_role loses UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES.
--    A privileged owner (postgres) can still bypass this; a purge is a deliberate, audited operation
--    that needs a retention decision first and is not built here.
--
-- Additive and idempotent. The table is empty in production when this was written.
-- ROLLBACK (restores the old cascade; refs and the guard are dropped, evidence rows stay):
--   drop trigger if exists launch_list_attestations_guard_insert on public.launch_list_attestations;
--   drop trigger if exists launch_list_attestations_guard_update on public.launch_list_attestations;
--   drop trigger if exists launch_list_attestations_guard_delete on public.launch_list_attestations;
--   drop function if exists private.launch_attestation_guard();
--   -- then re-add NOT NULL / ON DELETE CASCADE only after deleting rows whose launch_id is null.

begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

alter table public.launch_list_attestations add column if not exists launch_ref uuid;
alter table public.launch_list_attestations add column if not exists source_ref uuid;

-- Historical rows: the refs are the ids they point at today.
update public.launch_list_attestations
   set launch_ref = coalesce(launch_ref, launch_id),
       source_ref = coalesce(source_ref, source_id)
 where launch_ref is null or (source_ref is null and source_id is not null);

alter table public.launch_list_attestations alter column launch_id drop not null;
alter table public.launch_list_attestations drop constraint if exists launch_list_attestations_launch_id_fkey;
alter table public.launch_list_attestations
  add constraint launch_list_attestations_launch_id_fkey
  foreign key (launch_id) references public.space_launch(id) on delete set null;

alter table public.launch_list_attestations drop constraint if exists launch_list_attestations_launch_ref_set;
alter table public.launch_list_attestations
  add constraint launch_list_attestations_launch_ref_set check (launch_ref is not null) not valid;
alter table public.launch_list_attestations validate constraint launch_list_attestations_launch_ref_set;

create or replace function private.launch_attestation_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    if new.launch_id is null then
      raise exception 'a consent attestation needs a launch' using errcode = '23514';
    end if;
    if new.source_id is not null and not exists (
      select 1 from public.launch_sources s where s.id = new.source_id and s.launch_id = new.launch_id
    ) then
      raise exception 'the source does not belong to this launch' using errcode = '23514';
    end if;
    -- A supplied ref that disagrees is corrected, never trusted.
    new.launch_ref := new.launch_id;
    new.source_ref := new.source_id;
    return new;
  elsif tg_op = 'UPDATE' then
    -- The only legal change is the foreign key detaching: launch_id or source_id going from a value to null.
    if new.id is distinct from old.id
       or new.wording_version is distinct from old.wording_version
       or new.answer is distinct from old.answer
       or new.attested_at is distinct from old.attested_at
       or new.launch_ref is distinct from old.launch_ref
       or new.source_ref is distinct from old.source_ref
       or (new.launch_id is distinct from old.launch_id and new.launch_id is not null)
       or (new.source_id is distinct from old.source_id and new.source_id is not null) then
      raise exception 'consent evidence cannot be edited' using errcode = '42501';
    end if;
    return new;
  end if;
  raise exception 'consent evidence cannot be deleted' using errcode = '42501';
end;
$$;
revoke all on function private.launch_attestation_guard() from public, anon, authenticated;

drop trigger if exists launch_list_attestations_guard_insert on public.launch_list_attestations;
create trigger launch_list_attestations_guard_insert
  before insert on public.launch_list_attestations
  for each row execute function private.launch_attestation_guard();
drop trigger if exists launch_list_attestations_guard_update on public.launch_list_attestations;
create trigger launch_list_attestations_guard_update
  before update on public.launch_list_attestations
  for each row execute function private.launch_attestation_guard();
drop trigger if exists launch_list_attestations_guard_delete on public.launch_list_attestations;
create trigger launch_list_attestations_guard_delete
  before delete on public.launch_list_attestations
  for each row execute function private.launch_attestation_guard();

revoke update, delete, truncate, trigger, references on table public.launch_list_attestations from service_role;
revoke all on table public.launch_list_attestations from anon, authenticated;
grant select, insert on table public.launch_list_attestations to authenticated;
grant select, insert on table public.launch_list_attestations to service_role;

comment on table public.launch_list_attestations is 'Append-only consent evidence: wording version, answer, time and the pseudonymous original launch_ref / source_ref. Survives deletion of its Launch or source (launch_id / source_id detach to null); the owner reads only while attached. Never edited or deleted by any API role.';
commit;
