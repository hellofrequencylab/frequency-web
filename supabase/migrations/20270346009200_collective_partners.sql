-- SCAN-982 (owner spec 2026-10-16): Collective Partners. Collective is many owners working together:
-- a hub Space on a Collective plan links up to ten partner Spaces owned by OTHER people, who opt in.
-- Each partner keeps its own members, payouts and settings. A partnership grants no membership,
-- no editing and no control of the other Space; it only lets the partner cross-list with the
-- Collective (collective_cross_listings, 20270346006800) and appear in the hub's partner directory.
--
-- The ten-partner cap lives in one constant (COLLECTIVE_PARTNER_CAP, lib/collective/partners.ts) and
-- is enforced by the invite action. This file enforces the consent invariants at commit: the hub
-- owner invites, only the partner owner accepts, the two owners differ, and an ownership change
-- revokes the consent (it is historical, like cross-listing consent).
--
-- Additive and idempotent: create table / index if not exists, create or replace functions, triggers
-- dropped and recreated. Service role only, like collective_cross_listings.
begin;

create table if not exists public.collective_partners (
  id uuid primary key default gen_random_uuid(),
  hub_space_id uuid not null references public.spaces(id) on delete cascade,
  partner_space_id uuid not null references public.spaces(id) on delete cascade,
  invited_by uuid references public.profiles(id) on delete set null,
  responded_by uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','accepted','declined','revoked')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (hub_space_id <> partner_space_id)
);
create unique index if not exists collective_partners_live_idx on public.collective_partners(hub_space_id, partner_space_id) where status in ('pending','accepted');
create index if not exists collective_partners_hub_idx on public.collective_partners(hub_space_id);
create index if not exists collective_partners_partner_idx on public.collective_partners(partner_space_id);
create index if not exists collective_partners_inviter_idx on public.collective_partners(invited_by) where invited_by is not null;
create index if not exists collective_partners_responder_idx on public.collective_partners(responded_by) where responded_by is not null;
alter table public.collective_partners enable row level security;
revoke all on public.collective_partners from public, anon, authenticated;
grant all on public.collective_partners to service_role;
comment on table public.collective_partners is 'SCAN-982 Collective Partners: a Collective hub Space and a partner Space owned by someone else, linked after the partner owner accepts. Service role only. Grants no membership, editing or settings on either side.';

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
  perform 1 from public.spaces where id in (new.hub_space_id, new.partner_space_id) order by id for share;
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
drop trigger if exists collective_partner_validate on public.collective_partners;
create trigger collective_partner_validate before insert or update on public.collective_partners
for each row execute function public.validate_collective_partner();

-- Consent is historical: an owner change on either Space revokes it in the same transaction.
create or replace function public.invalidate_collective_partners()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.owner_profile_id is distinct from old.owner_profile_id then
    update public.collective_partners set status='revoked', responded_at=now()
    where status in ('pending','accepted') and (hub_space_id=new.id or partner_space_id=new.id);
  end if;
  return new;
end $$;
drop trigger if exists collective_partner_owner_transfer on public.spaces;
create trigger collective_partner_owner_transfer after update of owner_profile_id on public.spaces
for each row execute function public.invalidate_collective_partners();

-- Cross-listing eligibility: an accepted partner of a live hub lists like a member Space. Same
-- signature, so existing grants and the cross-listing triggers and reader pick it up unchanged.
create or replace function public.collective_listing_space_live(p_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.spaces s left join public.spaces p on p.id=s.parent_id
 where s.id=p_id and s.type is distinct from 'root' and s.status='active' and s.visibility is distinct from 'private'
 and ((s.parent_id is null and s.plan in ('collective','nonprofit_collective')) or
 (p.type is distinct from 'root' and p.parent_id is null and p.status='active' and p.plan in ('collective','nonprofit_collective') and p.owner_profile_id=s.owner_profile_id)))
 or exists(select 1 from public.collective_partners cp
 join public.spaces s on s.id=cp.partner_space_id
 join public.spaces h on h.id=cp.hub_space_id
 where cp.partner_space_id=p_id and cp.status='accepted'
 and s.type is distinct from 'root' and s.status='active' and s.visibility is distinct from 'private'
 and h.type is distinct from 'root' and h.status='active' and h.parent_id is null and h.plan in ('collective','nonprofit_collective')
 and h.owner_profile_id=cp.invited_by and s.owner_profile_id=cp.responded_by and s.owner_profile_id<>h.owner_profile_id)
$$;

revoke all on function public.validate_collective_partner() from public, anon, authenticated, service_role;
revoke all on function public.invalidate_collective_partners() from public, anon, authenticated, service_role;
revoke all on function public.collective_listing_space_live(uuid) from public, anon, authenticated;
grant execute on function public.collective_listing_space_live(uuid) to service_role;

commit;
