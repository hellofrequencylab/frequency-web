-- GUEST RSVP, PART 1: a seat someone can hold before they have an account.
--
-- WHY THE SEAT LIVES IN event_rsvps AND NOT ITS OWN TABLE. The requirement is that a guest obeys the
-- SAME capacity, waitlist and approval rules as a member. Those rules are not app logic that could be
-- called twice: capacity is `enforce_event_rsvp_capacity()` (20260610030000), a BEFORE INSERT/UPDATE
-- trigger on THIS table that reads only NEW.event_id and NEW.status and silently coerces `going` ->
-- `waitlist` at capacity. It is already identity-blind. Put the guest row here and the rule applies for
-- free, forever, with no second implementation to drift. A separate table would have meant rewriting
-- that trigger to count across two tables and re-sorting two waitlists by created_at, which is exactly
-- how "the same rules" becomes "two rules that were the same once".
--
-- ── THE DANGEROUS LINE, NAMED ────────────────────────────────────────────────────────────────────
-- `UNIQUE (event_id, profile_id)` must become a PARTIAL unique index. Postgres treats NULLs as
-- distinct in a unique constraint, so the moment profile_id is nullable that constraint silently stops
-- enforcing one-seat-per-member: it would accept unlimited (event, NULL) rows AND keep looking correct
-- in \d output. Dropping it without replacing it is a data-integrity regression that no test would
-- catch, because every existing row still satisfies it.
--
-- Verified against the LIVE database before writing (repo⇄ledger divergence has landed three times,
-- see docs/DATABASE.md): the constraint is `event_rsvps_event_id_profile_id_key`, profile_id is NOT
-- NULL, approval_status already exists defaulting to 'none'. No drift.
--
-- ── WHAT THIS DELIBERATELY DOES NOT TOUCH: THE RLS POLICIES ──────────────────────────────────────
-- Reading the live policies rather than assuming, they already do the right thing under NULL:
--
--   SELECT `(profile_id = get_my_profile_id()) OR (get_my_role() >= 'host' AND event_id IN (…))`
--     The host branch never mentions profile_id. For a guest row the first operand is NULL, and
--     `NULL OR TRUE` is TRUE, so a host sees guest rows on their own events with no change. For a
--     non-host member it is `NULL OR FALSE` = NULL, which is not TRUE, so the row stays hidden.
--     Correct in both directions already.
--
--   INSERT/UPDATE/DELETE  all key on `profile_id = get_my_profile_id()`, which is NULL for a guest
--     row and therefore never TRUE. A caller-role client already cannot write, steal or delete a
--     guest seat. The `profile_id IS NOT NULL` clauses added below do not change behaviour; they say
--     out loud what the NULL semantics were doing implicitly, so nobody later "fixes" the policy by
--     removing a comparison they think is redundant.
--
-- Guest rows are written ONLY by the SECURITY DEFINER function in part 2 (20270303000100), which is
-- the single door and carries the anti-enumeration shape from capture_signup_lead (20270215000000).

begin;

-- ── 1. The identity columns ──────────────────────────────────────────────────────────────────────

alter table public.event_rsvps
  alter column profile_id drop not null,
  add column if not exists guest_email      text,
  add column if not exists guest_name       text,
  -- Stamped when the guest later signs in and the seat becomes theirs. Kept as its own column rather
  -- than inferred, so "was this seat once a guest seat" survives the conversion and a host's roster
  -- can still say how someone arrived.
  add column if not exists guest_claimed_by uuid references public.profiles(id) on delete set null,
  add column if not exists guest_claimed_at timestamptz;

-- Exactly one identity. Without this a row could carry both (ambiguous: which one owns the seat?) or
-- neither (an anonymous seat nobody can ever claim, notify or remove).
alter table public.event_rsvps drop constraint if exists event_rsvps_identity_check;
alter table public.event_rsvps
  add constraint event_rsvps_identity_check
  check (
    (profile_id is not null and guest_email is null)
    or
    (profile_id is null and guest_email is not null)
  );

comment on column public.event_rsvps.guest_email is
  'The address a signed-out guest RSVP''d with, lowercased and trimmed by capture_guest_rsvp. Mutually exclusive with profile_id (event_rsvps_identity_check). An UNPROVEN address: anyone can type anything here, so it may address a confirmation email but must NEVER gate anything a member would have to sign in for (ADR-854). Cleared when the seat is claimed.';

-- ── 2. The uniqueness swap ───────────────────────────────────────────────────────────────────────
-- Two partial indexes, because one plain constraint cannot express "unique per member OR per address"
-- once half the rows have a NULL in the member column.

alter table public.event_rsvps drop constraint if exists event_rsvps_event_id_profile_id_key;

create unique index if not exists event_rsvps_event_profile_uniq
  on public.event_rsvps (event_id, profile_id)
  where profile_id is not null;

-- lower() on the address for the same reason signup_leads does it: this repo has no citext, so
-- case-insensitivity is carried by the normaliser plus the index, not by the column type.
create unique index if not exists event_rsvps_event_guest_email_uniq
  on public.event_rsvps (event_id, lower(guest_email))
  where guest_email is not null;

-- The claim lookup: every unclaimed guest seat for one address, across events.
create index if not exists event_rsvps_unclaimed_guest_idx
  on public.event_rsvps (lower(guest_email))
  where guest_email is not null and guest_claimed_by is null;

-- ── 3. Say the NULL semantics out loud in the write policies ─────────────────────────────────────
-- Behaviour-neutral (see the header). Recreated with the LIVE definitions, which differ from the
-- original migration: they call private.get_my_profile_id() / private.get_my_role(), and the insert
-- floor is 'member', not the 'crew' the 20240101000001 file was written with.

drop policy if exists "event_rsvps: crew+ insert own" on public.event_rsvps;
create policy "event_rsvps: crew+ insert own" on public.event_rsvps
  for insert with check (
    private.get_my_role() >= 'member'::community_role
    and profile_id is not null
    and profile_id = private.get_my_profile_id()
  );

drop policy if exists "event_rsvps: crew+ update own" on public.event_rsvps;
create policy "event_rsvps: crew+ update own" on public.event_rsvps
  for update
  using (profile_id is not null and profile_id = private.get_my_profile_id())
  with check (profile_id is not null and profile_id = private.get_my_profile_id());

drop policy if exists "event_rsvps: crew+ delete own" on public.event_rsvps;
create policy "event_rsvps: crew+ delete own" on public.event_rsvps
  for delete using (profile_id is not null and profile_id = private.get_my_profile_id());

-- ── 4. Approval becomes a rule that exists ───────────────────────────────────────────────────────
-- `event_rsvps.approval_status` has shipped since 20260625020000, the host's approve action and the
-- pending queue are built, and components/events/rsvp-controls.tsx accepts a `requiresApproval` prop.
-- Nothing ever set it: there is no column on `events` to derive it from, no caller passes true, and
-- the host's queue is therefore permanently empty. So "a guest waits for approval when the host
-- requires it" was a rule about nothing, and shipping it guest-side alone would have held guests to a
-- stricter bar than members. This is the missing half.
--
-- Defaults false: every existing event keeps today's behaviour exactly.
alter table public.events
  add column if not exists rsvp_requires_approval boolean not null default false;

comment on column public.events.rsvp_requires_approval is
  'When true, an RSVP lands as approval_status = ''pending'' and the host admits it from the manage console. Applies identically to members and to signed-out guests. Default false, which is what every event did before this column existed.';

commit;
