-- =====================================================================
-- Practices: the North-Star feature. A "practice" is the thing a member
-- actually does. Two paths to a practice, one log:
--   * circle_practices :  a host assigns the circle's current practice.
--   * member_practices  :  a solo member adopts a practice for themselves.
--   * practice_logs     :  logging "I did it" emits practice.verified
--                          (the WAM North-Star event) + zaps + a streak tick.
-- See docs/DEVELOPMENT-MAP.md (Stage A) and lib/practices.ts.
--
-- Authz model matches the repo: writes go through the service-role admin
-- client behind app-code authz (host check for circle assignment, self for
-- personal); RLS gives public read for library/circle data and read-own for
-- a member's personal practices + logs. FK on-delete follows DATABASE.md
-- (authored-by → SET NULL; owned rows → CASCADE).
-- =====================================================================

-- 1. The practice library --------------------------------------------------
create table if not exists practices (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  created_by  uuid references profiles(id) on delete set null,
  is_public   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists practices_public_idx on practices (is_public, created_at desc);

-- 2. Circle's current practice (host-assigned) -----------------------------
create table if not exists circle_practices (
  id          uuid primary key default gen_random_uuid(),
  circle_id   uuid not null references circles(id) on delete cascade,
  practice_id uuid not null references practices(id) on delete cascade,
  set_by      uuid references profiles(id) on delete set null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
-- At most one active practice per circle at a time.
create unique index if not exists circle_practices_one_active
  on circle_practices (circle_id) where active;

-- 3. Member's self-chosen practices ----------------------------------------
create table if not exists member_practices (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  practice_id uuid not null references practices(id) on delete cascade,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (profile_id, practice_id)
);
create index if not exists member_practices_profile_idx
  on member_practices (profile_id, active);

-- 4. Practice logs (the North-Star event source) ---------------------------
create table if not exists practice_logs (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  practice_id uuid references practices(id) on delete set null,
  circle_id   uuid references circles(id) on delete set null,
  logged_for  date not null default current_date,
  created_at  timestamptz not null default now(),
  -- One verified practice per (member, practice, day): the idempotency guard
  -- mirrored by the engagement_events idempotency_key in lib/practices.ts.
  unique (profile_id, practice_id, logged_for)
);
create index if not exists practice_logs_profile_idx
  on practice_logs (profile_id, created_at desc);

-- RLS ----------------------------------------------------------------------
alter table practices        enable row level security;
alter table circle_practices enable row level security;
alter table member_practices enable row level security;
alter table practice_logs    enable row level security;

-- Library + circle assignments are non-sensitive: public read.
create policy "practices: public read"        on practices        for select using (true);
create policy "circle_practices: public read" on circle_practices for select using (true);

-- Personal practices + logs are read-own (writes go via service role).
create policy "member_practices: read own" on member_practices for select using (
  profile_id in (select id from profiles where auth_user_id = auth.uid())
);
create policy "practice_logs: read own" on practice_logs for select using (
  profile_id in (select id from profiles where auth_user_id = auth.uid())
);

-- Seed a small starter library (system-owned, created_by null) -------------
insert into practices (title, description, is_public) values
  ('Daily meditation',     'Sit in stillness for a few minutes and follow the breath.', true),
  ('Morning movement',     'Move your body to start the day: stretch, walk, or flow.', true),
  ('Breathwork',           'A short, intentional breathing practice.', true),
  ('Gratitude journaling', 'Write down a few things you are grateful for.', true),
  ('Cold exposure',        'A cold shower or plunge to build resilience.', true)
on conflict do nothing;
