-- Phase 3 — QR lead-grabs & attribution (docs/CRM-MASTER-BUILD-PLAN.md §Phase 3, CRM-STRATEGY §4).
--
-- The "capture-now, claim-on-join" engine's two new primitives, both SPACE-SEALED (Law 2 of the
-- membrane model, docs/CRM-MASTER-BUILD-PLAN.md §1.3):
--
--   1. lead_entry_points — the IMMUTABLE first-touch "door" a sealed Space lead came through. Set
--      ONCE per contact and NEVER overwritten (best practice: immutable first-touch entry point). A
--      unique (contact_id) plus a BEFORE UPDATE trigger that raises make overwrite impossible at the
--      DB, not just in code, so a re-scan / a later door can never rewrite where a person first came
--      from. One row per sealed lead: kind of door + label + where/when + who captured (staff
--      attribution) + the code scanned.
--   2. lead_touchpoints — the APPEND-ONLY log of every subsequent touch on that lead (re-scan, claim
--      on signup, offer unlock, warm-intro sent/accepted). Insert-only; no UPDATE/DELETE path.
--
-- Both reference contacts(id) (the sealed lead, contacts.space_id set / profile_id null / consent
-- 'unknown') and carry their own space_id for tenant isolation + fast scoped reads.
--
-- RLS (mirrors 20260905000000_crm_rls_convergence.sql for the CRM tables): space owner / active
-- member / platform staff READ; writes flow through the service-role admin client behind the app's
-- lead-capture guards (lib/crm/lead-capture.ts). Defense-in-depth authenticated write policies use
-- can_write_space_content(space_id) WITH CHECK so a session-client write is still tenant-bound.
-- FORCE ROW LEVEL SECURITY so even the table owner is subject to the policies (service_role keeps its
-- BYPASSRLS, so the admin client is unaffected). auth.*() wrapped in (select ...) per ADR-365. Every
-- policy predicate column (space_id, contact_id) is indexed.
--
-- Additive + idempotent (create table/policy if not exists / drop-then-create). SAFE to re-run. No em
-- or en dashes here.

-- ── 1. lead_entry_points — the immutable first-touch door (one per sealed lead) ───────────────────

create table if not exists public.lead_entry_points (
  id                     uuid primary key default gen_random_uuid(),
  space_id               uuid not null references public.spaces(id) on delete cascade,
  -- The sealed lead this door belongs to. UNIQUE so the entry point is set-once per contact.
  contact_id             uuid not null references public.contacts(id) on delete cascade,
  -- The door taxonomy (kept in lock-step with LEAD_DOORS in lib/crm/lead-capture.ts):
  --   space_qr | warm_intro | event | lead_magnet | share_back
  kind                   text not null,
  -- A short human label for the door (the offer name, the event, the campaign).
  label                  text,
  -- Where/when captured — the event/Space/city met-context, stamped once.
  captured_where         text,
  captured_at            timestamptz not null default now(),
  -- Staff attribution: the operator/owner behind the code or intro (nullable for anonymous capture).
  captured_by_profile_id uuid references public.profiles(id) on delete set null,
  -- The QR code scanned, when the door was a scan (nullable).
  code_id                uuid references public.qr_codes(id) on delete set null,
  metadata               jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  unique (contact_id)
);

create index if not exists lead_entry_points_space_idx   on public.lead_entry_points (space_id, created_at desc);
create index if not exists lead_entry_points_contact_idx on public.lead_entry_points (contact_id);
create index if not exists lead_entry_points_code_idx    on public.lead_entry_points (code_id);

comment on table public.lead_entry_points is
  'IMMUTABLE first-touch door for a sealed Space lead (CRM Phase 3). One row per contact; overwrite is blocked by unique(contact_id) + the lead_entry_points_no_overwrite trigger. See lib/crm/lead-capture.ts.';

-- ── 2. lead_touchpoints — the append-only touch log ───────────────────────────────────────────────

create table if not exists public.lead_touchpoints (
  id               uuid primary key default gen_random_uuid(),
  space_id         uuid not null references public.spaces(id) on delete cascade,
  contact_id       uuid not null references public.contacts(id) on delete cascade,
  -- capture | rescan | claim | offer_unlock | intro_sent | intro_accepted (additive; free text kept)
  kind             text not null,
  -- qr | in_person | event | system (how the touch arrived).
  channel          text,
  note             text,
  -- Who, when signed in (the scanner or the acting staff); null for anonymous.
  actor_profile_id uuid references public.profiles(id) on delete set null,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists lead_touchpoints_space_idx   on public.lead_touchpoints (space_id, created_at desc);
create index if not exists lead_touchpoints_contact_idx on public.lead_touchpoints (contact_id, created_at desc);

comment on table public.lead_touchpoints is
  'Append-only touch log for a sealed Space lead (CRM Phase 3): capture / rescan / claim / offer_unlock / intro_*. Insert-only. See lib/crm/lead-capture.ts.';

-- ── 3. Immutability trigger — the entry point NEVER overwrites ─────────────────────────────────────
-- A BEFORE UPDATE guard that rejects any change to the immutable door columns. Combined with the
-- unique(contact_id) + the code's insert-if-absent path, the first door a person came through is
-- permanent (best practice: immutable first-touch entry point).

create or replace function public.lead_entry_points_no_overwrite()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.space_id, new.contact_id, new.kind, coalesce(new.captured_where, ''), coalesce(new.captured_by_profile_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(new.code_id, '00000000-0000-0000-0000-000000000000'::uuid))
     is distinct from
     (old.space_id, old.contact_id, old.kind, coalesce(old.captured_where, ''), coalesce(old.captured_by_profile_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(old.code_id, '00000000-0000-0000-0000-000000000000'::uuid))
  then
    raise exception 'lead_entry_points is immutable: the first-touch door cannot be overwritten (contact_id=%)', old.contact_id;
  end if;
  return new;
end;
$$;

drop trigger if exists lead_entry_points_no_overwrite on public.lead_entry_points;
create trigger lead_entry_points_no_overwrite
  before update on public.lead_entry_points
  for each row execute function public.lead_entry_points_no_overwrite();

-- ── 4. RLS ────────────────────────────────────────────────────────────────────────────────────────

alter table public.lead_entry_points enable row level security;
alter table public.lead_entry_points force row level security;
alter table public.lead_touchpoints  enable row level security;
alter table public.lead_touchpoints  force row level security;

-- lead_entry_points: space member / staff READ; can_write_space_content INSERT (defense-in-depth).
drop policy if exists lead_entry_points_space_read on public.lead_entry_points;
create policy lead_entry_points_space_read on public.lead_entry_points
  for select to authenticated
  using (
    public.is_space_member(space_id)
    or public.get_my_web_role() in ('admin', 'janitor')
  );

drop policy if exists lead_entry_points_space_insert on public.lead_entry_points;
create policy lead_entry_points_space_insert on public.lead_entry_points
  for insert to authenticated
  with check (public.can_write_space_content(space_id));
-- No UPDATE / DELETE policy: the door is immutable (and the trigger blocks overwrite regardless).

-- lead_touchpoints: space member / staff READ; can_write_space_content INSERT. Append-only (no
-- UPDATE / DELETE policy).
drop policy if exists lead_touchpoints_space_read on public.lead_touchpoints;
create policy lead_touchpoints_space_read on public.lead_touchpoints
  for select to authenticated
  using (
    public.is_space_member(space_id)
    or public.get_my_web_role() in ('admin', 'janitor')
  );

drop policy if exists lead_touchpoints_space_insert on public.lead_touchpoints;
create policy lead_touchpoints_space_insert on public.lead_touchpoints
  for insert to authenticated
  with check (public.can_write_space_content(space_id));

-- ── 5. Default space_id to root on insert (tenancy safety net, mirrors 20260714010000) ───────────
-- Reuse the existing BEFORE INSERT trigger so a NULL space_id can never escape tenancy. The engine
-- always stamps space_id, so this is belt-and-suspenders only.
drop trigger if exists lead_entry_points_default_space_id on public.lead_entry_points;
create trigger lead_entry_points_default_space_id
  before insert on public.lead_entry_points
  for each row execute function public.default_space_id_to_root();

drop trigger if exists lead_touchpoints_default_space_id on public.lead_touchpoints;
create trigger lead_touchpoints_default_space_id
  before insert on public.lead_touchpoints
  for each row execute function public.default_space_id_to_root();
