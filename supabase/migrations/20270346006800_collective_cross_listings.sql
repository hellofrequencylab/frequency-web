-- Generated with Supabase CLI as 20261008185317; renumbered068 after its table dependencies.
-- LIVE-765: consent-based Journey/Circle listings, never ownership or entry grants.
begin;
create table public.collective_cross_listings (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid references public.journey_plans(id) on delete cascade,
  circle_id uuid references public.circles(id) on delete cascade,
  subject_id uuid generated always as (coalesce(journey_id,circle_id)) stored,
  kind text generated always as (case when journey_id is not null then 'journey' else 'circle' end) stored,
  source_space_id uuid not null references public.spaces(id) on delete cascade,
  space_id uuid not null references public.spaces(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  responded_by uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check(status in ('pending','accepted','declined','revoked')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check ((journey_id is null) <> (circle_id is null)),
  check (source_space_id <> space_id)
);
create unique index collective_cross_listings_live_idx on public.collective_cross_listings(kind,subject_id,space_id) where status in ('pending','accepted');
create index collective_cross_listings_journey_idx on public.collective_cross_listings(journey_id) where journey_id is not null;
create index collective_cross_listings_circle_idx on public.collective_cross_listings(circle_id) where circle_id is not null;
create index collective_cross_listings_source_idx on public.collective_cross_listings(source_space_id);
create index collective_cross_listings_space_idx on public.collective_cross_listings(space_id);
create index collective_cross_listings_requester_idx on public.collective_cross_listings(requested_by) where requested_by is not null;
create index collective_cross_listings_responder_idx on public.collective_cross_listings(responded_by) where responded_by is not null;
alter table public.collective_cross_listings enable row level security;
revoke all on public.collective_cross_listings from public, anon, authenticated;
grant all on public.collective_cross_listings to service_role;
comment on table public.collective_cross_listings is 'Consent-based multi-listing for Collective Journeys and Circles. Service role only; accepted listing never grants entry or editing. Readers recheck original visibility and current source ownership.';

-- Consent is historical: transfer away and back must not resurrect it. These
-- triggers run in the SAME transaction as canonical ownership/source writes.
create function public.invalidate_collective_cross_listings()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='spaces' then
    if new.owner_profile_id is distinct from old.owner_profile_id or new.parent_id is distinct from old.parent_id then
      update public.collective_cross_listings set status='revoked',responded_at=now()
      where status in ('pending','accepted') and (source_space_id=new.id or space_id=new.id or source_space_id in (select id from public.spaces where parent_id=new.id) or space_id in (select id from public.spaces where parent_id=new.id));
    end if;
  elsif new.space_id is distinct from old.space_id then
    update public.collective_cross_listings set status='revoked',responded_at=now()
    where status in ('pending','accepted') and
      ((tg_table_name='journey_plans' and journey_id=new.id) or (tg_table_name='circles' and circle_id=new.id));
  end if;
  return new;
end $$;
create trigger collective_listing_owner_transfer after update of owner_profile_id,parent_id on public.spaces
for each row execute function public.invalidate_collective_cross_listings();
create trigger collective_listing_journey_transfer after update of space_id on public.journey_plans
for each row execute function public.invalidate_collective_cross_listings();
create trigger collective_listing_circle_transfer after update of space_id on public.circles
for each row execute function public.invalidate_collective_cross_listings();

create function public.collective_listing_space_live(p_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.spaces s left join public.spaces p on p.id=s.parent_id
 where s.id=p_id and s.type is distinct from 'root' and s.status='active' and s.visibility is distinct from 'private'
 and ((s.parent_id is null and s.plan in ('collective','nonprofit_collective')) or
 (p.type is distinct from 'root' and p.parent_id is null and p.status='active' and p.plan in ('collective','nonprofit_collective') and p.owner_profile_id=s.owner_profile_id)))
$$;

-- The application owner/function gates remain; DB validation makes the final
-- mutation atomic with ownership/source writes. Lock contention can safely abort
-- either transaction; no accepted row is committed from stale authorization.
create function public.validate_collective_cross_listing()
returns trigger language plpgsql security definer set search_path='' as $$
declare source_owner uuid; target_owner uuid; subject_source uuid; subject_visible boolean;
begin
 if new.status in ('revoked','declined') then return new; end if;
 if tg_op='UPDATE' and (new.source_space_id,new.space_id,new.journey_id,new.circle_id,new.requested_by)
 is distinct from (old.source_space_id,old.space_id,old.journey_id,old.circle_id,old.requested_by) then
   raise exception 'listing binding is immutable';
 end if;
 if new.journey_id is not null then
   select space_id,visibility in ('public','unlisted') and status is distinct from 'rejected'
   into subject_source,subject_visible from public.journey_plans where id=new.journey_id for share;
 else
   select space_id,unlisted is distinct from true and status in ('active','forming') and not is_space_primary
   into subject_source,subject_visible from public.circles where id=new.circle_id for share;
 end if;
 -- Lock both participants and their parent plans for the consent commit.
 perform 1 from public.spaces where id in (new.source_space_id,new.space_id)
 or id in (select parent_id from public.spaces where id in (new.source_space_id,new.space_id))
 order by id for share;
 select owner_profile_id into source_owner from public.spaces where id=new.source_space_id;
 select owner_profile_id into target_owner from public.spaces where id=new.space_id;
 if subject_source is distinct from new.source_space_id or subject_visible is distinct from true
 or source_owner is null or source_owner is distinct from new.requested_by
 or not public.collective_listing_space_live(new.source_space_id)
 or not public.collective_listing_space_live(new.space_id) then raise exception 'listing no longer available'; end if;
 if new.status='accepted' and (target_owner is null or target_owner is distinct from new.responded_by
 or tg_op='INSERT' or old.status<>'pending') then raise exception 'receiving owner consent required'; end if;
 return new;
end $$;
create trigger collective_listing_validate before insert or update on public.collective_cross_listings
for each row execute function public.validate_collective_cross_listing();

-- A single snapshot returns the subject that was actually authorized. Readers
-- must not subsequently reload it by ID without source/consent predicates.
create function public.read_collective_cross_listings(p_kind text,p_target uuid,p_pending boolean default false)
returns table(id uuid,subject jsonb) language sql stable security definer set search_path='' as $$
 select l.id,case when l.kind='journey' then (select jsonb_object_agg(entry.key,entry.value) from jsonb_each(to_jsonb(j)) entry where entry.key=any(array['id','slug','title','summary','intro','emoji','accent','author_id','space_id','visibility','fork_of','forked_count','adopt_count','cover_image','cover_focus','logo_image','header_overlay_style','header_overlay_color','created_at','updated_at','published_at','quest_id','official','window_starts_at','window_ends_at','status','page_config','completion_gems','drip_interval_days','ongoing','certificate_enabled','difficulty','category','tags','daily_minutes','enroll_cap','space_tier_id','meeting'])) else (select jsonb_object_agg(entry.key,entry.value) from jsonb_each(to_jsonb(c)) entry where entry.key=any(array['id','slug','name','about','type','member_count','member_cap','status','host_id','space_id','created_at','unlisted','access','image_url','neighborhood','topical_channel_id','is_space_primary'])) end
 from public.collective_cross_listings l
 join public.spaces s on s.id=l.source_space_id
 join public.spaces t on t.id=l.space_id
 left join public.journey_plans j on j.id=l.journey_id
 left join public.circles c on c.id=l.circle_id
 where l.kind=p_kind and l.space_id=p_target and (l.status='accepted' or (p_pending and l.status='pending'))
 and s.owner_profile_id=l.requested_by and (l.status='pending' or t.owner_profile_id=l.responded_by)
 and public.collective_listing_space_live(s.id) and public.collective_listing_space_live(t.id)
 and ((l.kind='journey' and j.space_id=s.id and j.visibility in ('public','unlisted') and j.status is distinct from 'rejected')
 or (l.kind='circle' and c.space_id=s.id and c.status in ('active','forming') and c.unlisted is distinct from true and not c.is_space_primary))
$$;
revoke all on function public.invalidate_collective_cross_listings() from public,anon,authenticated,service_role;
revoke all on function public.validate_collective_cross_listing() from public,anon,authenticated,service_role;
revoke all on function public.collective_listing_space_live(uuid) from public,anon,authenticated;
revoke all on function public.read_collective_cross_listings(text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.collective_listing_space_live(uuid) to service_role;
grant execute on function public.read_collective_cross_listings(text,uuid,boolean) to service_role;

commit;
