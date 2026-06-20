-- Per-Space EMAIL: the send backbone (ENTITY-SPACES-BUILD §C Phase 3, "Email / marketing / comms").
-- This adds the per-Space email send pipeline on the EXISTING Resend integration: a space_id tenancy
-- axis on campaigns + email_suppressions, the new outreach_sends ledger (the per-recipient send log
-- the surface + analytics agents read), and a per-Space email KILL-SWITCH on spaces. Anti-spam and
-- fail-closed are the whole point: a Space cannot send until email_enabled is explicitly turned on.
--
-- BACKWARD COMPATIBILITY IS PARAMOUNT. The existing GLOBAL email machinery (the Studio campaigns at
-- app/(main)/admin/marketing/campaigns, the global email_suppressions list checked by sendRawEmail,
-- the global unsubscribe flow, the Resend webhook) must keep working unchanged. To guarantee that:
--   1. space_id is added NULLABLE (never NOT NULL in v1, the interim ADR-321/ADR-331 expand pattern),
--      so no existing INSERT breaks.
--   2. On campaigns, existing rows are BACKFILLED to the ROOT space so a per-space view of campaigns
--      reads them as root-owned; the global Studio tool reads campaigns unscoped so its result set is
--      unchanged.
--   3. On email_suppressions, existing rows are LEFT space_id = NULL, which by definition is a GLOBAL
--      suppression that applies to ALL Spaces (an address that hard-bounced / complained must never be
--      re-mailed by anyone). A per-Space suppression carries a non-NULL space_id and scopes to that one
--      Space (a member who opted out of one Space's email is not suppressed everywhere). The send path
--      (lib/spaces/email.ts) filters recipients against the union of (global OR this-space) suppressions.
--
-- ACCESS MODEL (mirrors space_bookings / space_memberships / crm_space_id_client_notes): every new
-- table / column stays service-role only (RLS enabled, NO client policies) and is reached behind the
-- gated server actions in lib/spaces/email.ts. The server is the authority for "which space" and "what
-- may this caller do here" (P5): the send action gates on canEditProfile, fails closed if the Space's
-- kill-switch is off, enforces a per-Space daily send cap, and filters suppressions, before sending.
--
-- OUT OF SCOPE for this migration (counsel / cost gated, ENTITY-SPACES-BUILD Phase 3): a custom
-- per-Space sender domain with DKIM (sender_domains is NOT created here), SMS / A2P, the AUP/DPA legal
-- copy, and Amazon SES at scale. v1 sends through the existing shared Resend `send.` subdomain.
--
-- House style (matches space_membership.sql / crm_space_id_client_notes.sql): additive + idempotent,
-- applied to production via the Supabase SQL Editor; lib/database.types.ts is regenerated separately and
-- lib/spaces/email.ts reaches these columns/tables with untyped casts until then (ADR-246). This file
-- is the canonical record. SAFE to re-run. No em or en dashes in any copy here.

-- ── 1. campaigns: add the space_id tenancy column (+ scheduled_for if absent) ───────────────────
-- Nullable so no existing global-campaign INSERT breaks; ON DELETE CASCADE so removing a Space removes
-- its campaigns. scheduled_for carries a future send time (the composer schedule); added only if the
-- column does not already exist. We deliberately do NOT set NOT NULL in v1 (the interim expand step).
alter table public.campaigns add column if not exists space_id      uuid references public.spaces(id) on delete cascade;
alter table public.campaigns add column if not exists scheduled_for timestamptz;

comment on column public.campaigns.space_id is
  'Tenancy scope (ENTITY-SPACES-BUILD Phase 3). NULLABLE interim (ADR-321/ADR-331). Backfilled to the root space so a per-space campaign view reads existing rows as root-owned; the GLOBAL Studio campaigns tool queries campaigns unscoped so its result set is unchanged. Never NOT NULL in v1.';
comment on column public.campaigns.scheduled_for is
  'Optional future send time for a scheduled campaign (the composer schedule). NULL = send-now / not scheduled.';

-- Backfill every existing campaign to the ROOT space (idempotent: only NULL rows are stamped). If
-- there is no root space (a fresh DB) the update touches nothing.
update public.campaigns
  set space_id = (select id from public.spaces where type = 'root' limit 1)
  where space_id is null;

-- Per-space read index: a per-space campaign list filters space_id first, newest first. The global
-- tool's existing campaigns_created_idx is untouched and still serves it.
create index if not exists campaigns_space_created_idx on public.campaigns (space_id, created_at desc);

-- ── 2. email_suppressions: add a per-Space scope (NULL space_id = GLOBAL suppression) ───────────
-- The deliverability contract: a row with space_id IS NULL is a GLOBAL suppression that applies to
-- ALL Spaces (a hard bounce / complaint / manual block that no one may ever re-mail). A row with a
-- non-NULL space_id is scoped to that ONE Space (e.g. a recipient who unsubscribed from a single
-- Space's outreach, or a per-Space bounce). Existing rows are LEFT NULL, so every current suppression
-- stays global and the global send path is unchanged.
--
-- The existing PRIMARY KEY is on email alone, which would forbid a per-Space row coexisting with a
-- global row for the same address. Relax it: drop the email-only PK (if present) and add a synthetic
-- uuid id, then a UNIQUE index on (space_id, lower(email)) treating NULL space_id as the global scope.
-- Postgres treats NULLs as distinct in a UNIQUE, so we use COALESCE on space_id to make at most one
-- GLOBAL row per address AND at most one per-(space,address) row.
alter table public.email_suppressions add column if not exists id       uuid not null default gen_random_uuid();
alter table public.email_suppressions add column if not exists space_id uuid references public.spaces(id) on delete cascade;

-- Drop the legacy email-only primary key (named email_suppressions_pkey by default) so an address can
-- be suppressed both globally and per-Space. Guarded so re-running is a no-op.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.email_suppressions'::regclass
      and contype = 'p'
      and conname = 'email_suppressions_pkey'
  ) then
    -- Only drop the email-only PK; if a prior run already moved the PK to id, leave it.
    if exists (
      select 1
      from pg_index i
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
      where i.indrelid = 'public.email_suppressions'::regclass
        and i.indisprimary
        and a.attname = 'email'
    ) then
      alter table public.email_suppressions drop constraint email_suppressions_pkey;
    end if;
  end if;
end $$;

-- Make id the primary key (idempotent: only if the table has no primary key now).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.email_suppressions'::regclass and contype = 'p'
  ) then
    alter table public.email_suppressions add primary key (id);
  end if;
end $$;

comment on column public.email_suppressions.space_id is
  'Suppression scope (ENTITY-SPACES-BUILD Phase 3). NULL = a GLOBAL suppression applying to ALL Spaces (hard bounce / complaint / manual; never re-mail anywhere). A non-NULL space_id scopes the suppression to that ONE Space (a per-Space unsubscribe or per-Space bounce). The send path suppresses a recipient if a GLOBAL row OR a row for THIS Space exists.';
comment on column public.email_suppressions.id is
  'Synthetic primary key, added so an address can be suppressed both globally (space_id NULL) and per-Space (space_id set). The email column is no longer unique on its own; uniqueness is per (scope, email).';

-- At most one suppression per (scope, address): COALESCE folds the NULL global scope to a fixed uuid
-- so the global row is unique per address, and each per-Space row is unique per (space, address). This
-- keeps suppress() idempotent (its upsert targets this key).
create unique index if not exists email_suppressions_scope_email_uniq
  on public.email_suppressions (coalesce(space_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(email));

-- The per-space lookup index: "is this address suppressed for this Space (or globally)". space_id
-- leads; lower(email) matches the normalized address.
create index if not exists email_suppressions_space_email_idx
  on public.email_suppressions (space_id, lower(email));

-- ── 3. outreach_sends: the per-recipient send ledger (the seam other agents read) ───────────────
-- One row per (campaign or one-off) email a Space attempts to send. status tracks the lifecycle from
-- queued through the provider outcome; resend_id links the row to the Resend email so the webhook can
-- update it on bounce / complaint. This is the source of truth for the per-Space daily send cap (count
-- today's rows) and for email analytics (lib/spaces/email-analytics.ts, the analytics agent).
create table if not exists public.outreach_sends (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  contact_id  uuid references public.contacts(id) on delete set null,
  email       text not null,
  status      text not null default 'queued'
                check (status in ('queued', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'suppressed')),
  resend_id   text,
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.outreach_sends is
  'Per-recipient email send ledger for a Space (ENTITY-SPACES-BUILD Phase 3). One row per address a Space attempts to send to. status: queued, sent, delivered, bounced, complained, failed, or suppressed (skipped because the address was on a global or this-space suppression). resend_id links to the Resend email so the webhook updates the row on bounce/complaint. Source of truth for the per-Space daily send cap and email analytics. Service-role only via lib/spaces/email.ts.';
comment on column public.outreach_sends.campaign_id is 'The campaign this send belongs to (NULL for a one-off send). ON DELETE SET NULL so deleting a campaign keeps the send history.';
comment on column public.outreach_sends.contact_id is 'The Space contact this was sent to (NULL when sending to a raw address). ON DELETE SET NULL so erasing a contact keeps the send row but unlinks the person.';
comment on column public.outreach_sends.status is 'queued -> sent (handed to Resend) -> delivered/bounced/complained (from the webhook); or suppressed (skipped, on a suppression list) or failed (provider error).';
comment on column public.outreach_sends.resend_id is 'The Resend email id, set when the send is accepted. The Resend webhook matches on this to update status to delivered/bounced/complained.';

-- Per-space history (the analytics + daily-cap scan): space_id leads, newest first.
create index if not exists outreach_sends_space_created_idx on public.outreach_sends (space_id, created_at desc);
-- Per-space status rollups (the analytics counts).
create index if not exists outreach_sends_space_status_idx  on public.outreach_sends (space_id, status);

-- ── 4. spaces.email_enabled: the per-Space email KILL-SWITCH (fail-closed, default OFF) ─────────
-- A Space cannot send ANY email until an owner explicitly turns this on (after affirming they have
-- permission to email these people and will follow anti-spam rules). Default false is the anti-spam
-- guarantee: a brand-new or unconfigured Space blasts nothing by accident. setSpaceEmailEnabled
-- (lib/spaces/email.ts, gated on canEditProfile + an explicit acknowledgement) is the only flipper.
alter table public.spaces add column if not exists email_enabled boolean not null default false;

comment on column public.spaces.email_enabled is
  'Per-Space email KILL-SWITCH (ENTITY-SPACES-BUILD Phase 3). FAIL-CLOSED: default false, so a Space sends NOTHING until an owner explicitly enables it (affirming permission to email + anti-spam compliance) via setSpaceEmailEnabled. sendSpaceCampaign refuses to send when this is false.';

-- ── 5. RLS: enabled, NO client policies (all access via the service-role admin client) ──────────
-- Exactly like space_bookings / space_memberships / client_notes: enabling RLS with no policy denies
-- ALL direct client access, so the only path to outreach_sends is the gated server actions in
-- lib/spaces/email.ts. campaigns + email_suppressions were already RLS-enabled with no policies
-- (20240223000000_campaigns.sql, 20240220000000_email_events.sql); this re-asserts it idempotently.
alter table public.outreach_sends     enable row level security;
alter table public.campaigns          enable row level security;
alter table public.email_suppressions enable row level security;
