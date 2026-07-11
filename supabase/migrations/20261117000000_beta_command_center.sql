-- ============================================================================
-- BETA COMMAND CENTER (Wave 1 - the foundation). The operator dashboard at
-- /admin/beta that runs the Beta launch: the phase plan, the task board, the
-- admission waves, and - above all - the APPROVAL SPINE that gates every
-- outbound object.
-- ============================================================================
--
-- GOVERNING RULE (owner directive, non-negotiable): NOTHING SENDS WITHOUT
-- EXPLICIT APPROVAL. Every approvable outbound object (an admission wave, a
-- campaign, a beta sequence) carries a server-enforced `approval_status`. The
-- send path REFUSES anything that is not `approved` (or `scheduled`).
-- Automation only ever prepares DRAFTS. The guard lives in code
-- (lib/beta/approvals.ts assertApproved); this migration gives every object the
-- column that guard reads.
--
-- ── APPROVAL STATUS: the shared vocabulary (text + check, not a pg enum so a
--    new state needs no type migration; the code owns the transition rules) ──
--
--   draft      the object is being prepared (automation stops here)
--   ready      an operator has finished a draft and marked it ready to review
--   approved   an approver (admin OR janitor web_role) armed it - MAY SEND
--   scheduled  approved AND has a scheduled_for time - MAY SEND at/after it
--   sending    the send is in flight (set by the send path)
--   sent       the send completed (terminal)
--   paused     an approver halted it (reversible back to ready/approved)
--   cancelled  an approver killed it (terminal)
--
-- Only `approved` and `scheduled` clear assertApproved(). Everything else is
-- refused. `draft`/`ready` are the pre-approval states automation and operators
-- write; `paused`/`cancelled` are the operator brakes.
--
-- ── APPROVAL IS PHASE-BY-PHASE (owner directive) ──
-- The operator walks each Beta phase (P0..P4), reviews and edits that phase's
-- drafted content, then ARMS that phase's items to send. So every approvable
-- outbound object carries a nullable `phase_id`: the phase OWNS its outbound
-- content. The spine exposes a phase-scoped review/arm view (lib/beta/approvals
-- listPhaseOutbound / armPhase). Nothing in a phase sends until its items are
-- individually approved (armPhase approves all `ready` items in the phase, each
-- writing its own audit row).
--
-- ── ACCESS MODEL: SERVICE-ROLE ONLY (mirrors business_intake / campaigns) ──
-- Every table here has RLS ENABLED with NO client policies, so the ONLY access
-- path is the gated server code (lib/beta/*, the service-role admin client)
-- behind app-layer authz: reads gate on staffCan(role,'marketing'); ARMING
-- (approve/pause/cancel/markReady) gates on the admin/janitor web_role operator
-- check. RLS-on-no-policy denies all direct anon/authed access (fail-closed).
-- The deliberate service-role-only posture is recorded in
-- scripts/rls-deny-all.txt (beta_phases, beta_tasks, beta_admission_waves,
-- beta_audit_log; campaigns is already listed).
--
-- House style (matches business_intake.sql): additive + idempotent, SAFE to
-- re-run. Applied to production separately (do NOT apply from a worktree);
-- lib/database.types.ts is regenerated separately and the seam reaches these
-- tables with untyped casts until then (ADR-246). No em or en dashes in copy.
-- ============================================================================

-- ── beta_phases: the P0..P4 launch plan. Each phase is a stage with a goal, a
--    status, and an ordered position. ──
create table if not exists public.beta_phases (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,                         -- 'P0'..'P4'
  title       text not null,
  goal        text not null default '',
  summary     text not null default '',
  status      text not null default 'not_started'
              check (status in ('not_started', 'in_progress', 'done')),
  position    integer not null default 0,
  starts_on   date,
  ends_on     date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists beta_phases_position_idx on public.beta_phases (position);

-- ── beta_tasks: the work inside a phase. Each task carries an `acceptance`
--    ("done when...") so a phase's exit criteria are explicit. ──
create table if not exists public.beta_tasks (
  id          uuid primary key default gen_random_uuid(),
  phase_id    uuid not null references public.beta_phases(id) on delete cascade,
  title       text not null,
  detail      text not null default '',
  acceptance  text not null default '',                     -- "done when..."
  status      text not null default 'not_started'
              check (status in ('not_started', 'in_progress', 'done', 'blocked')),
  priority    text not null default 'medium'
              check (priority in ('low', 'medium', 'high')),
  position    integer not null default 0,
  due_on      date,
  owner       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists beta_tasks_phase_idx on public.beta_tasks (phase_id, position);

-- ── beta_admission_waves: the approvable "admit these N" object. An operator
--    proposes a wave (a labelled segment + a count); it stays `draft` until
--    reviewed, `ready` when armed for review, `approved` when an approver arms
--    it. The Wave-2 admit path calls assertApproved() before admitting anyone. ──
create table if not exists public.beta_admission_waves (
  id               uuid primary key default gen_random_uuid(),

  -- The phase this wave belongs to (phase-by-phase approval). Nullable: a wave
  -- can exist before it is filed under a phase.
  phase_id         uuid references public.beta_phases(id) on delete set null,

  label            text not null default '',                -- 'Wave 1 - <City>'
  segment          text not null default '',                -- audience selector (SegmentKey)
  proposed_count   integer not null default 0,

  -- THE APPROVAL SPINE (shared vocabulary above). draft -> ready -> approved ->
  -- scheduled -> sending -> sent, plus paused / cancelled.
  approval_status  text not null default 'draft'
                   check (approval_status in
                     ('draft','ready','approved','scheduled','sending','sent','paused','cancelled')),
  approved_by      uuid references public.profiles(id) on delete set null,
  approved_at      timestamptz,
  scheduled_for    timestamptz,
  sent_at          timestamptz,

  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists beta_admission_waves_phase_idx
  on public.beta_admission_waves (phase_id);
create index if not exists beta_admission_waves_approval_idx
  on public.beta_admission_waves (approval_status, created_at desc);

-- ── APPROVAL COLUMNS ON campaigns (additive; the existing `status`
--    draft|sent stays untouched). Campaigns become approvable outbound objects
--    on the SAME spine, and gain a nullable `phase_id` so a campaign can be
--    owned + armed by a Beta phase. `test_sent_at` records a test send (a test
--    send never counts as the real send and never needs approval). ──
alter table public.campaigns
  add column if not exists approval_status text not null default 'draft'
    check (approval_status in
      ('draft','ready','approved','scheduled','sending','sent','paused','cancelled')),
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists scheduled_for timestamptz,
  add column if not exists test_sent_at timestamptz,
  add column if not exists phase_id uuid references public.beta_phases(id) on delete set null;
create index if not exists campaigns_approval_idx
  on public.campaigns (approval_status, created_at desc);
create index if not exists campaigns_phase_idx on public.campaigns (phase_id);

-- ── beta_audit_log: the immutable trail. Every approval transition (markReady /
--    approve / pause / cancel / recordTestSend / armPhase) writes one row, so
--    "who armed what, when" is answerable. `detail` holds a jsonb snapshot
--    (from/to status, scheduled_for, counts). ──
create table if not exists public.beta_audit_log (
  id                uuid primary key default gen_random_uuid(),
  actor_profile_id  uuid references public.profiles(id) on delete set null,
  action            text not null,                          -- 'approve' | 'pause' | ...
  target_type       text not null,                          -- 'campaign' | 'admission_wave' | 'phase' | ...
  target_id         uuid,
  detail            jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);
create index if not exists beta_audit_log_target_idx
  on public.beta_audit_log (target_type, target_id, created_at desc);
create index if not exists beta_audit_log_created_idx
  on public.beta_audit_log (created_at desc);

-- ── FAIL-CLOSED RLS: enabled, NO policies. Service-role (admin client) only. ──
alter table public.beta_phases           enable row level security;
alter table public.beta_tasks            enable row level security;
alter table public.beta_admission_waves  enable row level security;
alter table public.beta_audit_log        enable row level security;

comment on table public.beta_phases is
  'Beta Command Center: the P0..P4 launch phase plan. Service-role only (RLS enabled, no policies); read/written via lib/beta/phases.ts behind staffCan gates.';
comment on table public.beta_tasks is
  'Beta Command Center: the task board inside each phase, each with an acceptance ("done when...") criterion. Service-role only; via lib/beta/tasks.ts.';
comment on table public.beta_admission_waves is
  'Beta Command Center: the approvable "admit these N" object on the approval spine (draft->ready->approved->scheduled->sending->sent, +paused/cancelled). Nothing admits until assertApproved() clears it. Service-role only; via lib/beta/approvals.ts.';
comment on table public.beta_audit_log is
  'Beta Command Center: the immutable approval trail. One row per approval transition (who armed what, when). Service-role only; via lib/beta/audit.ts.';
comment on column public.campaigns.approval_status is
  'Beta Command Center approval spine. A campaign MAY send only when this is approved|scheduled (assertApproved). Additive to the legacy status draft|sent.';

-- ============================================================================
-- SEED: the P0..P4 phase plan + a well-defined task board per phase, each task
-- with an acceptance ("done when..."). Idempotent (keyed on beta_phases.key /
-- an existing (phase,title) task). SAFE to re-run. This runs when the migration
-- is applied; if the orchestrator needs the data before applying, the same
-- INSERTs can be run standalone.
-- ============================================================================

insert into public.beta_phases (key, title, goal, summary, position) values
  ('P0', 'Ignition',
   'Stand up the invite gate and waitlist, fix the take rate, and seed the first signal so the community is not empty on day one.',
   'Close the doors, open one window. Build the waitlist, seed threads and events, admit Wave 0 friends, and mirror the WhatsApp groups.', 0),
  ('P1', 'First Light',
   'Get the daily content engine running and admit real people by cluster so a solo member activates inside a week.',
   'A living feed every day. Admit waves by cluster, hit solo activation under seven days, and stand up the first Circles.', 1),
  ('P2', 'Proof',
   'Turn lurkers into hosts, launch the paid tiers, and prove a nucleus of about ten active members holds on its own.',
   'From watching to hosting. Wolf-to-host prompts, Founding Members and Founding Businesses launch, a concierge business blitz, and a tracked nucleus.', 2),
  ('P3', 'Replication',
   'Make the engine copy itself: referrals, a Circle-starter contest, and city captains who run their own corner.',
   'It spreads without you. A referral and Circle-starter contest, city captains, and the daily engine still humming.', 3),
  ('P4', 'Anchor & Open',
   'Turn billing on for Founders on September 1, grant founding status, reward the winners, and publish the proof.',
   'Lock it in and open the doors. Billing on and Founders charged, founding status granted, referral winners awarded, and the proof published.', 4)
on conflict (key) do nothing;

-- Tasks. Each references its phase by key. Idempotent: insert only when a task
-- with the same phase + title does not already exist.
insert into public.beta_tasks (phase_id, title, detail, acceptance, priority, position)
select p.id, t.title, t.detail, t.acceptance, t.priority, t.position
from (values
  -- ── P0 Ignition ──
  ('P0', 'Ship the invite gate and waitlist',
   'Close public signup behind an invite gate and stand up the beta waitlist capture so every new interest is a contact with source beta_waitlist.',
   'Done when public signup is gated and a real signup lands as a beta_waitlist contact with double opt-in.', 'high', 0),
  ('P0', 'Fix the waitlist take rate to 3 percent',
   'Diagnose and fix the landing-to-waitlist conversion until at least three of every hundred visitors join the waitlist.',
   'Done when the measured waitlist take rate holds at or above 3 percent over a week.', 'high', 1),
  ('P0', 'Seed 10 threads and events',
   'Pre-load the community so the first admitted members find life, not an empty room: seed at least ten threads and a handful of real events.',
   'Done when at least ten seeded threads and several events are live before Wave 0 is admitted.', 'medium', 2),
  ('P0', 'Admit Wave 0 (friends)',
   'Hand-admit a small Wave 0 of friends and allies to pressure-test the flow end to end.',
   'Done when Wave 0 friends are admitted, have accounts, and have posted at least once.', 'medium', 3),
  ('P0', 'Mirror the WhatsApp groups',
   'Bring the existing WhatsApp group energy onto the platform by mirroring the active groups as Circles or channels.',
   'Done when the active WhatsApp groups have a live mirror on-platform and members know where it is.', 'medium', 4),

  -- ── P1 First Light ──
  ('P1', 'Stand up the daily content engine',
   'Establish a daily content cadence so the feed is never empty: a repeatable engine for prompts, posts, and events.',
   'Done when fresh content posts every day for two straight weeks without a manual scramble.', 'high', 0),
  ('P1', 'Admit waves by cluster',
   'Admit the waitlist in waves grouped by cluster (city or affinity) so each admitted member lands near others like them.',
   'Done when at least two cluster-based waves are admitted through an approved admission wave.', 'high', 1),
  ('P1', 'Solo activation under 7 days',
   'Tune onboarding so a member arriving alone reaches a first meaningful action (post, join a Circle, RSVP) within seven days.',
   'Done when median solo activation time is under seven days across a cohort.', 'high', 2),
  ('P1', 'Keep the feed alive',
   'Guarantee the feed stays lively during admissions: staff prompts, seeded replies, and event nudges cover any quiet day.',
   'Done when no day in the phase goes with an empty or stale feed.', 'medium', 3),
  ('P1', 'Launch the first Circles',
   'Convert the strongest clusters into the first member-run Circles with a named host.',
   'Done when at least three Circles are live, each with a host and recurring activity.', 'medium', 4),

  -- ── P2 Proof ──
  ('P2', 'Wolf-to-host prompts',
   'Prompt the most active lurkers (the wolves) to step up as hosts with a targeted, personal ask.',
   'Done when at least five active members accept a host prompt and start running something.', 'high', 0),
  ('P2', 'Launch Founding Members and Founding Businesses',
   'Open the Founding Members and Founding Businesses tiers so early believers can commit and be recognized.',
   'Done when both founding tiers are live and the first founders have signed up.', 'high', 1),
  ('P2', 'Concierge business blitz',
   'Run a hands-on outreach blitz to seed Founding Businesses, onboarding each one concierge-style.',
   'Done when a target set of founding businesses are onboarded with a live Space.', 'medium', 2),
  ('P2', 'Track the nucleus (about 10 actives)',
   'Instrument and track a core nucleus of roughly ten members who are active without staff prompting.',
   'Done when about ten members show sustained self-driven activity for two weeks.', 'high', 3),

  -- ── P3 Replication ──
  ('P3', 'Referral and Circle-starter contest',
   'Run a contest that rewards referrals and starting new Circles, so growth and hosting compound.',
   'Done when the contest is live, tracked, and driving new referrals and Circles.', 'high', 0),
  ('P3', 'Appoint city captains',
   'Name a captain for each active city to own local growth and Circle health.',
   'Done when every active city has a named captain with a clear remit.', 'medium', 1),
  ('P3', 'Keep the engine running',
   'Sustain the daily content engine and admission cadence through the replication push without regressions.',
   'Done when the daily engine and admissions continue uninterrupted through the phase.', 'medium', 2),

  -- ── P4 Anchor & Open ──
  ('P4', 'Turn billing on and charge Founders (Sept 1)',
   'Switch billing on for the September 1 date and charge the Founders who committed.',
   'Done when billing is live and Founders are charged successfully on September 1.', 'high', 0),
  ('P4', 'Grant founding status',
   'Grant the founding badge and benefits to every qualifying Founding Member and Business.',
   'Done when all qualifying founders hold founding status with its benefits applied.', 'high', 1),
  ('P4', 'Award the referral winners',
   'Award the prizes from the referral and Circle-starter contest to the winners.',
   'Done when contest winners are chosen and their prizes are awarded.', 'medium', 2),
  ('P4', 'Celebrate and publish the proof',
   'Close the Beta with a celebration and publish the proof: the numbers, the stories, and the case for what comes next.',
   'Done when a proof writeup is published and the celebration has happened.', 'medium', 3)
) as t(phase_key, title, detail, acceptance, priority, position)
join public.beta_phases p on p.key = t.phase_key
where not exists (
  select 1 from public.beta_tasks bt
  where bt.phase_id = p.id and bt.title = t.title
);
