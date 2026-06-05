-- Community Library (ADR-109) — unify Practices, Programs, and Journeys as
-- community-created content with one lifecycle: anyone creates → leadership (a
-- circle Host or any Guide+) approves → it enters the shared pool → a best-of
-- algorithm ranks it. Practices = personal real-world activities; Programs =
-- outreach toolkits that help people put an activity together; Journeys = ordered
-- bundles of practices. Practices + Programs both earn ZAPS (real-world).
--
-- The 4 file-based operator playbooks (content/programs/*.md) stay as official
-- guides; this `programs` table is the new member-creatable, approvable type.

-- ── 1. Programs (DB type) + adoptions ───────────────────────────────────────
create table if not exists public.programs (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  title        text not null,
  summary      text,
  body         text,                 -- markdown toolkit / how-to
  author_id    uuid references public.profiles(id) on delete set null,
  pillar       text,                 -- mind | body | spirit | expression (optional)
  cover_image  text,
  status       text not null default 'pending' check (status in ('draft','pending','approved','rejected')),
  reviewed_by  uuid references public.profiles(id) on delete set null,
  reviewed_at  timestamptz,
  review_note  text,
  adopt_count  int  not null default 0,
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists programs_status_idx on public.programs(status);

create table if not exists public.program_adoptions (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references public.programs(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (program_id, profile_id)
);

-- ── 2. Approval columns on the existing content types ───────────────────────
-- Existing rows default to 'approved' (they predate review). New community
-- submissions enter as is_public=false / visibility=private + status='pending', so
-- the existing browse filters hide them until approval flips them public+approved.
alter table public.practices     add column if not exists status text not null default 'approved' check (status in ('draft','pending','approved','rejected'));
alter table public.practices     add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;
alter table public.practices     add column if not exists reviewed_at timestamptz;
alter table public.journey_plans add column if not exists status text not null default 'approved' check (status in ('draft','pending','approved','rejected'));
alter table public.journey_plans add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;
alter table public.journey_plans add column if not exists reviewed_at timestamptz;

-- ── 3. One ratings table across all three types (the love signal) ───────────
create table if not exists public.content_ratings (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  content_type text not null check (content_type in ('practice','program','journey')),
  content_id   uuid not null,
  created_at   timestamptz not null default now(),
  unique (profile_id, content_type, content_id)
);
create index if not exists content_ratings_target_idx on public.content_ratings(content_type, content_id);

alter table public.programs          enable row level security;
alter table public.program_adoptions enable row level security;
alter table public.content_ratings   enable row level security;
-- Public can read approved programs; everything else is service-role behind guards.
drop policy if exists programs_read_approved on public.programs;
create policy programs_read_approved on public.programs for select using (status = 'approved');

-- ── 4. Zaps for running a Program (real-world outreach) ─────────────────────
insert into public.zap_config (action_type, zaps_amount, is_active, description) values
  ('program_run', 30, true, 'Adopted/ran a community Program — real-world outreach.')
on conflict (action_type) do update
  set zaps_amount = excluded.zaps_amount, is_active = excluded.is_active, description = excluded.description;

-- ── 5. The best-of catalog + ranking algorithm ──────────────────────────────
-- Unions the three APPROVED + public content types, scores each from four signals
-- (adoptions · completions/real-world impact · ratings · recency + endorser rank),
-- returns ranked rows for the unified Library. SECURITY DEFINER so it can read the
-- counts; the page calls it through the admin client.
create or replace function public.community_library(
  _type   text default null,   -- 'practice' | 'program' | 'journey' | null (all)
  _pillar text default null,
  _limit  int  default 80
)
returns table (
  content_type text, id uuid, slug text, title text, summary text, pillar text,
  author_id uuid, cover_image text, created_at timestamptz,
  adoptions int, completions int, ratings int, score numeric
)
language sql stable security definer set search_path = public
as $$
  with rows as (
    select 'practice'::text as content_type, p.id, p.id::text as slug, p.title,
           p.description as summary, null::text as pillar, p.created_by as author_id,
           null::text as cover_image, p.created_at, p.reviewed_by,
           (select count(*) from member_practices mp where mp.practice_id = p.id and mp.active)::int as adoptions,
           (select count(*) from practice_logs pl where pl.practice_id = p.id)::int as completions
    from practices p
    where p.status = 'approved' and p.is_public
    union all
    select 'program', pr.id, pr.slug, pr.title, pr.summary, pr.pillar, pr.author_id,
           pr.cover_image, pr.created_at, pr.reviewed_by,
           pr.adopt_count::int,
           (select count(*) from program_adoptions pa where pa.program_id = pr.id)::int
    from programs pr
    where pr.status = 'approved'
    union all
    select 'journey', jp.id, jp.slug, jp.title, jp.summary, null, jp.author_id,
           jp.cover_image, jp.created_at, jp.reviewed_by,
           jp.adopt_count::int,
           (select count(*) from journey_plan_adoptions ja where ja.plan_id = jp.id and ja.active)::int
    from journey_plans jp
    where jp.status = 'approved' and jp.visibility = 'public'
  ),
  scored as (
    select r.content_type, r.id, r.slug, r.title, r.summary, r.pillar, r.author_id,
           r.cover_image, r.created_at, r.adoptions, r.completions,
           (select count(*) from content_ratings cr where cr.content_type = r.content_type and cr.content_id = r.id)::int as ratings,
           -- endorser rank order (1=ghost … 6=luminary), 0 if unreviewed
           case rv.current_season_rank
             when 'luminary' then 6 when 'conduit' then 5 when 'agent' then 4
             when 'operative' then 3 when 'runner' then 2 when 'ghost' then 1 else 0
           end as endorser_order
    from rows r
    left join profiles rv on rv.id = r.reviewed_by
  )
  select content_type, id, slug, title, summary, pillar, author_id, cover_image, created_at,
         adoptions, completions, ratings,
         round(
           3.0 * adoptions
         + 2.0 * completions
         + 4.0 * ratings
         + greatest(0, 14 - (extract(epoch from (now() - created_at)) / 86400.0)) * 0.7  -- recency, 0–~10
         + endorser_order * 0.8                                                           -- endorser rank, 0–~5
         , 2) as score
  from scored
  where (_type is null or content_type = _type)
    and (_pillar is null or pillar = _pillar)
  order by score desc, created_at desc
  limit greatest(1, least(coalesce(_limit, 80), 200));
$$;

revoke all on function public.community_library(text, text, int) from public, anon;
grant execute on function public.community_library(text, text, int) to authenticated, service_role;

comment on table public.programs is
  'Community-created Programs (outreach toolkits). Member-creatable, approved by a Host/Guide+ into the Library (ADR-109). The file playbooks in content/programs stay separate.';
