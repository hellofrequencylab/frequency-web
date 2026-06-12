-- Operator-authored Walkthroughs (Phase A — data model only).
--
-- A walkthrough is an ordered set of instructional slides shown to a member at a
-- moment that matters: their first day, the day they become a Host, a season or
-- project launch. Each is targeted by a `trigger` (when it fires) and an optional
-- `audience` note, scheduled by a `starts_at`/`ends_at` window, and paced by a
-- `cadence`. The slides live in the `steps` jsonb so the editor can reorder, restyle,
-- and reword them without a schema change.
--
-- Phase A builds the model + the management suite + the slide editor. The in-app
-- triggering and rendering (firing a walkthrough for the right member at the right
-- moment) is Phase B and is intentionally NOT built here.
--
-- Service-role only for writes, like nurture_sequences / area_permissions: RLS is on,
-- authenticated users may SELECT (a future renderer reads its own walkthroughs), and
-- every write goes through the admin client in lib/walkthroughs.ts + the marketing-gated
-- server actions in app/(main)/admin/walkthroughs/actions.ts.

create table if not exists public.walkthrough (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  description text,
  -- When it fires. 'manual' = operator-launched only (Phase B). The role_* triggers
  -- fire when a member crosses onto that rung; season/project fire on a launch.
  trigger     text not null default 'manual'
    check (trigger in (
      'manual', 'new_member', 'role_host', 'role_guide', 'role_mentor',
      'circle_lead', 'season', 'project'
    )),
  -- Optional free target note / role key — narrows the trigger (e.g. a specific season
  -- slug, or a sub-segment of new members). Phase B reads it; Phase A just stores it.
  audience    text,
  active      boolean not null default false,
  -- How often a member sees it once they qualify.
  cadence     text not null default 'once'
    check (cadence in ('once', 'per_session', 'daily', 'until_done')),
  -- Tie-break when more than one walkthrough qualifies (higher wins, Phase B).
  priority    int not null default 0,
  -- Schedule window — a season/project walkthrough only fires inside it. Null = always.
  starts_at   timestamptz,
  ends_at     timestamptz,
  -- Ordered slides. Each step:
  --   { id, title, body, mediaUrl?, icon?, accent, layout, ctaLabel?, ctaHref?, zaps? }
  -- accent is a SEMANTIC TOKEN KEY (e.g. 'primary' | 'signal' | 'broadcast' | 'success'
  --   | 'warning' | 'rank-*'), never a raw hex — the editor picks from app/globals.css.
  -- layout is one of 'centered' | 'media-top' | 'split'.
  steps       jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

comment on table public.walkthrough is
  'Phase A: operator-authored instructional walkthroughs, targeted by role/trigger + schedule. Slides in steps jsonb. Service-role writes; triggering/rendering is Phase B.';

-- The management list + a future renderer query by trigger and active state.
create index if not exists walkthrough_active_idx
  on public.walkthrough (active, trigger);

-- Shared updated_at trigger (public.set_updated_at) — same as the rest of the schema.
create trigger walkthrough_set_updated_at
  before update on public.walkthrough
  for each row execute function public.set_updated_at();

alter table public.walkthrough enable row level security;

-- Any signed-in user may read walkthroughs (the Phase B renderer reads its own).
-- Writes go exclusively through the service role in marketing-gated server actions;
-- there is intentionally no client-facing write policy.
drop policy if exists "walkthrough readable by authenticated" on public.walkthrough;
create policy "walkthrough readable by authenticated"
  on public.walkthrough for select
  to authenticated using (true);
