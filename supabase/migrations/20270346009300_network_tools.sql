-- SCAN-983 (owner spec 2026-10-16, "Network-only tools: chapter leaders, the approval queue and central
-- admins"). A Network is one owner running many chapters. This adds the two records those tools need:
--
-- 1. network_central_admins: up to ten people (NETWORK_PLAN.centralAdmins) the Network owner names on the
--    parent Space. A central admin who is also an active admin of the parent gets admin of every chapter
--    (resolved at read time in lib/collective/network-tools-store.ts). add_network_central_admin locks the
--    parent row and enforces the cap, so two concurrent adds can never make eleven.
-- 2. network_event_approvals: the owner's or a central admin's decision on a chapter event before it shows
--    on the network calendar and home. No row means pending; only `approved` rows are shown network-wide.
--
-- Chapter leaders need no table: a leader is an active `admin` space_members row on one chapter, the same
-- per-Space role every Space team already uses, so a leader of chapter A holds nothing on chapter B or the
-- parent.
--
-- Both records are cleared when the facts they rest on change: a parent's owner changes (its central admins
-- and decisions were the old owner's), or a chapter leaves or joins a parent (its old decisions do not
-- carry over). Service role only, like collective_cross_listings: every read and write is server-mediated.
--
-- Additive and idempotent: create ... if not exists, create or replace, drop trigger if exists.

begin;

create table if not exists public.network_central_admins (
  parent_space_id uuid not null references public.spaces(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (parent_space_id, profile_id)
);
create index if not exists network_central_admins_profile_idx on public.network_central_admins(profile_id);
create index if not exists network_central_admins_added_by_idx on public.network_central_admins(added_by) where added_by is not null;
alter table public.network_central_admins enable row level security;
revoke all on public.network_central_admins from public, anon, authenticated;
grant all on public.network_central_admins to service_role;
comment on table public.network_central_admins is 'SCAN-983. Up to ten central admins per Network parent. Grants admin of every chapter only while the parent is an active Network and the person is an active admin of it. Service role only.';

create table if not exists public.network_event_approvals (
  parent_space_id uuid not null references public.spaces(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  chapter_space_id uuid not null references public.spaces(id) on delete cascade,
  status text not null check (status in ('approved', 'declined')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz not null default now(),
  primary key (parent_space_id, event_id)
);
create index if not exists network_event_approvals_event_idx on public.network_event_approvals(event_id);
create index if not exists network_event_approvals_chapter_idx on public.network_event_approvals(chapter_space_id);
create index if not exists network_event_approvals_decided_by_idx on public.network_event_approvals(decided_by) where decided_by is not null;
alter table public.network_event_approvals enable row level security;
revoke all on public.network_event_approvals from public, anon, authenticated;
grant all on public.network_event_approvals to service_role;
comment on table public.network_event_approvals is 'SCAN-983. A Network owner or central admin decision on a chapter event. No row is pending; only approved events show on the network calendar and home. Service role only.';

create or replace function public.add_network_central_admin(
  p_parent_id uuid, p_profile_id uuid, p_added_by uuid
) returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_parent public.spaces%rowtype;
  v_used bigint;
begin
  if p_parent_id is null or p_profile_id is null or p_added_by is null then raise exception 'network_invalid'; end if;
  select * into v_parent from public.spaces where id = p_parent_id for update;
  if v_parent.id is null or v_parent.owner_profile_id is distinct from p_added_by then raise exception 'network_forbidden'; end if;
  if v_parent.plan is distinct from 'network' or v_parent.status <> 'active' or v_parent.parent_id is not null
    or v_parent.type = 'root' or p_profile_id = v_parent.owner_profile_id then
    raise exception 'network_invalid';
  end if;
  if exists (select 1 from public.network_central_admins where parent_space_id = p_parent_id and profile_id = p_profile_id) then return; end if;
  -- NETWORK_PLAN.centralAdmins (lib/pricing/plans.ts).
  select count(*) into v_used from public.network_central_admins where parent_space_id = p_parent_id;
  if v_used >= 10 then raise exception 'network_central_admins_full'; end if;
  insert into public.network_central_admins (parent_space_id, profile_id, added_by) values (p_parent_id, p_profile_id, p_added_by);
end;
$$;
revoke all on function public.add_network_central_admin(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.add_network_central_admin(uuid, uuid, uuid) to service_role;

create or replace function public.clear_network_tools_on_space_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.owner_profile_id is distinct from old.owner_profile_id then
    delete from public.network_central_admins where parent_space_id = new.id;
    delete from public.network_event_approvals where parent_space_id = new.id;
  end if;
  if new.parent_id is distinct from old.parent_id then
    delete from public.network_event_approvals where chapter_space_id = new.id;
  end if;
  return new;
end $$;
revoke all on function public.clear_network_tools_on_space_change() from public, anon, authenticated;
drop trigger if exists network_tools_space_change on public.spaces;
create trigger network_tools_space_change after update of owner_profile_id, parent_id on public.spaces
for each row execute function public.clear_network_tools_on_space_change();

commit;
