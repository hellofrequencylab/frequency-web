-- LIVE-2340: the personal welcome a staff member sends a new member from the Resonance CRM roster.
--
-- One row per member who has had their personal welcome. The roster reads it to decide which new members still
-- glow (no row and joined inside the welcome window), and the welcome pop-up writes it after the email clears the
-- ordinary gated send (components/admin/crm/welcome-actions.ts). A staff member can also mark someone as already
-- welcomed (a hello sent some other way), which writes a row with no campaign.
--
-- The send is always a person pressing Send. Nothing here schedules or automates a welcome.
-- Service role only: row level security on with no policy, and no grant to a browser role.
-- Additive and idempotent.

begin;

create table if not exists public.member_welcomes (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  sent_by uuid references public.profiles(id) on delete set null,
  sent_at timestamptz not null default now()
);

alter table public.member_welcomes enable row level security;
revoke all on table public.member_welcomes from public, anon, authenticated;
grant all on public.member_welcomes to service_role;

comment on table public.member_welcomes is
  'LIVE-2340: members who have had their personal staff welcome. campaign_id is null when marked welcomed by hand.';

commit;
