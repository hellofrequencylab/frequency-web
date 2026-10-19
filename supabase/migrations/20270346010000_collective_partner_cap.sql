-- SCAN-1010: two invites at once cannot push a Collective past ten live partners.
--
-- THE GAP. invitePartnerSpace counts pending and accepted rows, then inserts.
-- validate_collective_partner (20270346009200) checked consent and share-locked both
-- Spaces, but it never counted and never took an exclusive lock on the hub. Two
-- overlapping invites could both see nine live rows and both insert the tenth,
-- leaving eleven.
--
-- THE FIX. On an INSERT (or an UPDATE that brings a declined/revoked row back to
-- pending or accepted), lock both Space rows FOR UPDATE in id order so two
-- invites serialize, then refuse when ten live rows already exist. Pending and
-- accepted both count, matching COLLECTIVE_PARTNER_CAP. Declined and revoked do
-- not. The app-side count stays as the polite refusal; this is the commit guard.
--
-- Apply with execute_sql, then insert supabase_migrations.schema_migrations at
-- version 20270346010000. Do not apply_migration. Do not db push.
--
-- ROLLBACK:
--   Restore public.validate_collective_partner() from 20270346009200.
--
-- House style: idempotent (create or replace), pinned search_path, revoke by role name.
-- No em or en dashes. pgTAP: supabase/tests/collective_partner_cap.test.sql.

begin;

create or replace function public.validate_collective_partner()
returns trigger language plpgsql security definer set search_path='' as $$
declare hub public.spaces%rowtype; partner public.spaces%rowtype;
begin
  if tg_op='UPDATE' and (new.hub_space_id, new.partner_space_id) is distinct from (old.hub_space_id, old.partner_space_id) then
    raise exception 'partnership binding is immutable';
  end if;
  -- A deleted profile (FK on delete set null) permanently ends the consent it gave.
  if tg_op='UPDATE' and ((old.invited_by is not null and new.invited_by is null)
    or (old.responded_by is not null and new.responded_by is null and old.status='accepted')) then
    new.status='revoked'; new.responded_at=now(); return new;
  end if;
  if tg_op='UPDATE' and new.invited_by is distinct from old.invited_by then
    raise exception 'partnership binding is immutable';
  end if;
  if new.status in ('revoked','declined') then return new; end if;
  -- SCAN-1010: exclusive lock in id order, then the cap, before the consent reads.
  if tg_op='INSERT' or (tg_op='UPDATE' and old.status not in ('pending','accepted')) then
    perform 1 from public.spaces where id in (new.hub_space_id, new.partner_space_id) order by id for update;
    if (select count(*) from public.collective_partners
        where hub_space_id=new.hub_space_id and status in ('pending','accepted')) >= 10 then
      raise exception 'A Collective links up to 10 partner Spaces.';
    end if;
  else
    perform 1 from public.spaces where id in (new.hub_space_id, new.partner_space_id) order by id for share;
  end if;
  select * into hub from public.spaces where id=new.hub_space_id;
  select * into partner from public.spaces where id=new.partner_space_id;
  if hub.id is null or partner.id is null
    or hub.status is distinct from 'active' or hub.type is not distinct from 'root' or hub.parent_id is not null
    or hub.plan not in ('collective','nonprofit_collective') or hub.owner_profile_id is null
    or hub.owner_profile_id is distinct from new.invited_by
    or partner.status is distinct from 'active' or partner.type is not distinct from 'root'
    or partner.visibility is not distinct from 'private' or partner.owner_profile_id is null
    or partner.owner_profile_id = hub.owner_profile_id then
    raise exception 'partnership not available';
  end if;
  if new.status='accepted' and (tg_op='INSERT' or old.status<>'pending' or new.responded_by is distinct from partner.owner_profile_id) then
    raise exception 'partner owner consent required';
  end if;
  return new;
end $$;

comment on function public.validate_collective_partner() is
  'BEFORE INSERT OR UPDATE on collective_partners (SCAN-982, SCAN-1010). Consent: hub owner invites, partner owner accepts, owners differ. Cap: on insert (or a return to pending/accepted) lock both Spaces for update in id order and refuse when 10 pending or accepted rows already exist. Not a PostgREST RPC.';

revoke all on function public.validate_collective_partner() from public, anon, authenticated, service_role;

commit;
