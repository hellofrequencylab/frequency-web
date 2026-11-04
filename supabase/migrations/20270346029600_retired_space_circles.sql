-- RETIRE THE SPACE CIRCLE, PART 1 OF 2: KEEP THE OLD LINKS (ADR-1938, LIVE-2081).
--
-- 20270346029500 archived every Space Circle and stopped making new ones. Before the flag column can
-- go (20270346029700), two things must stop needing it:
--   1. The redirect from an old /circles/<slug> link to /spaces/<slug>/community. Each retired slug is
--      copied to public.retired_space_circles, which lib/circles/retired-space-circle.ts reads.
--   2. The two Collective cross-listing functions, which still name the column. Rewritten without it;
--      an archived Circle is already refused by their status test, so behaviour is unchanged.
--
-- ADDITIVE ONLY: safe to run while the code that still reads is_space_primary is live. Run this,
-- merge the code, wait for the production deploy to be READY, then run 20270346029700.
--
-- Idempotent: every step is guarded, so a second run changes nothing.
-- Rollback: drop table public.retired_space_circles; the functions may stay (both shapes read correctly).

-- ── 1. Where the old links go ───────────────────────────────────────────────────────────────────────
create table if not exists public.retired_space_circles (
  slug       text primary key,
  circle_id  uuid not null unique references public.circles (id) on delete cascade,
  space_id   uuid not null references public.spaces (id) on delete cascade,
  retired_at timestamptz not null default now()
);
create index if not exists retired_space_circles_space_id_idx on public.retired_space_circles (space_id);
alter table public.retired_space_circles enable row level security;
revoke all on public.retired_space_circles from anon, authenticated;
comment on table public.retired_space_circles is
  'Space Circles retired by the Community wall cutover (ADR-1938). Server-only: the redirect from an old Circle link to /spaces/<slug>/community.';

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'circles' and column_name = 'is_space_primary') then
    execute $q$
      insert into public.retired_space_circles (slug, circle_id, space_id)
      select c.slug, c.id, c.space_id from public.circles c
       where c.is_space_primary and c.slug is not null and c.space_id is not null
      on conflict (slug) do nothing
    $q$;
  end if;
end $$;

-- ── 2. Collective cross-listing stops naming the column ─────────────────────────────────────────────
-- Same bodies as live, minus `is_space_primary`. An archived Circle is already refused by the status test.
create or replace function public.read_collective_cross_listings(p_kind text, p_target uuid, p_pending boolean default false)
 returns table(id uuid, subject jsonb)
 language sql
 stable security definer
 set search_path to ''
as $function$
 select l.id,case when l.kind='journey' then (select jsonb_object_agg(entry.key,entry.value) from jsonb_each(to_jsonb(j)) entry where entry.key=any(array['id','slug','title','summary','intro','emoji','accent','author_id','space_id','visibility','fork_of','forked_count','adopt_count','cover_image','cover_focus','logo_image','header_overlay_style','header_overlay_color','created_at','updated_at','published_at','quest_id','official','window_starts_at','window_ends_at','status','page_config','completion_gems','drip_interval_days','ongoing','certificate_enabled','difficulty','category','tags','daily_minutes','enroll_cap','space_tier_id','meeting'])) else (select jsonb_object_agg(entry.key,entry.value) from jsonb_each(to_jsonb(c)) entry where entry.key=any(array['id','slug','name','about','type','member_count','member_cap','status','host_id','space_id','created_at','unlisted','access','image_url','neighborhood','topical_channel_id'])) end
 from public.collective_cross_listings l
 join public.spaces s on s.id=l.source_space_id
 join public.spaces t on t.id=l.space_id
 left join public.journey_plans j on j.id=l.journey_id
 left join public.circles c on c.id=l.circle_id
 where l.kind=p_kind and l.space_id=p_target and (l.status='accepted' or (p_pending and l.status='pending'))
 and s.owner_profile_id=l.requested_by and (l.status='pending' or t.owner_profile_id=l.responded_by)
 and public.collective_listing_space_live(s.id) and public.collective_listing_space_live(t.id)
 and ((l.kind='journey' and j.space_id=s.id and j.visibility in ('public','unlisted') and j.status is distinct from 'rejected')
 or (l.kind='circle' and c.space_id=s.id and c.status in ('active','forming') and c.unlisted is distinct from true))
$function$;

create or replace function public.validate_collective_cross_listing()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare source_owner uuid; target_owner uuid; subject_source uuid; subject_visible boolean;
begin
 if tg_op='UPDATE' and (new.source_space_id,new.space_id,new.journey_id,new.circle_id)
 is distinct from (old.source_space_id,old.space_id,old.journey_id,old.circle_id) then
   raise exception 'listing binding is immutable';
 end if;
 -- FK ON DELETE SET NULL must not obstruct profile deletion. Lost authority
 -- permanently revokes consent, regardless of the order of other FK actions.
 if tg_op='UPDATE' and ((old.requested_by is not null and new.requested_by is null)
 or (old.responded_by is not null and new.responded_by is null)) then
   new.status='revoked';new.responded_at=now();return new;
 end if;
 if tg_op='UPDATE' and new.requested_by is distinct from old.requested_by then
   raise exception 'listing binding is immutable';
 end if;
 if new.status in ('revoked','declined') then return new; end if;
 if new.journey_id is not null then
   select space_id,visibility in ('public','unlisted') and status is distinct from 'rejected'
   into subject_source,subject_visible from public.journey_plans where id=new.journey_id for share;
 else
   select space_id,unlisted is distinct from true and status in ('active','forming')
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
end $function$;

