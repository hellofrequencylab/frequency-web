-- ============================================================================
-- SUBSCRIPTION PREFERENCE CENTER (CRM Master Build Plan Phase 6).
--
-- Expands the fixed 4x3 notification grid (channel x category) into a real
-- preference center: topics + per-category frequency, per-Space / per-circle
-- topic mutes, and a contact-keyed (non-member) preference surface. Every piece
-- here is ADDITIVE and backward-compatible: existing rows and the lazy-create
-- default path keep their exact current behaviour (realtime, everything on for
-- email + inapp, push off).
--
-- Three pieces:
--   1. notification_preferences.*_comments + freq_* — a new "comments" topic
--      (replies + mentions on your own posts) added to the channel grid, plus a
--      per-category frequency selector (realtime | daily_digest | weekly_digest).
--   2. subject_topic_preferences — per-member (subject, topic, channel) MUTE rows
--      so a member can quiet one Space or Circle without muting the platform.
--   3. contact_channel_preferences — a contact-keyed (email x space x topic x
--      channel) subscribe/unsubscribe surface so a NON-member reached by a Space
--      can opt down a single topic instead of hard-unsubscribing.
--
-- ACCESS MODEL: ADR-365 RLS hardening on the new tables — ENABLE + FORCE ROW
-- LEVEL SECURITY, policies TO authenticated, WITH CHECK on every write, auth.*()
-- wrapped in (select ...) so it is an initplan (evaluated once per query), every
-- scope column indexed. Transactional/account/security mail is carved out in CODE
-- (lib/comms/send-gate.ts), never here — these tables only govern optional mail.
--
-- House style: additive + idempotent, SAFE to re-run. lib/database.types.ts is
-- regenerated separately; the app reaches the new columns/tables through untyped
-- admin-client casts until then (ADR-246). No em or en dashes in copy.
-- ============================================================================

-- ── 1. notification_preferences: the "comments" topic + per-category frequency ─
-- The comments topic mirrors the existing per-channel grid: email + inapp default
-- ON, push default OFF (push needs an explicit browser-permission grant). Adding a
-- column defaults every existing row to the same behaviour the member has today.
alter table public.notification_preferences
  add column if not exists email_comments boolean not null default true,
  add column if not exists inapp_comments boolean not null default true,
  add column if not exists push_comments  boolean not null default false;

-- Per-category delivery frequency. 'realtime' is the historical behaviour, so every
-- existing row keeps sending on each event. 'daily_digest' / 'weekly_digest' mean
-- the realtime send is DEFERRED (the gate suppresses it; a digest cron batches it —
-- that batching is a follow-up, see lib/comms/send-gate.ts frequencyDeferred seam).
-- Free-text with a check so an unknown value can never widen delivery.
alter table public.notification_preferences
  add column if not exists freq_dispatches text not null default 'realtime'
    check (freq_dispatches in ('realtime', 'daily_digest', 'weekly_digest')),
  add column if not exists freq_events     text not null default 'realtime'
    check (freq_events     in ('realtime', 'daily_digest', 'weekly_digest')),
  add column if not exists freq_mentions   text not null default 'realtime'
    check (freq_mentions   in ('realtime', 'daily_digest', 'weekly_digest')),
  add column if not exists freq_lifecycle  text not null default 'realtime'
    check (freq_lifecycle  in ('realtime', 'daily_digest', 'weekly_digest')),
  add column if not exists freq_comments   text not null default 'realtime'
    check (freq_comments   in ('realtime', 'daily_digest', 'weekly_digest'));

comment on column public.notification_preferences.freq_dispatches is
  'Per-category delivery cadence (CRM Master Build Plan Phase 6): realtime | daily_digest | weekly_digest. realtime = send on each event (historical default). A digest choice DEFERS the realtime send; the gate (lib/comms/send-gate.ts) suppresses it and a digest cron batches it.';

-- ── 2. subject_topic_preferences: per-member per-Space/per-circle topic MUTE ────
-- Models a preference as (subject, topic, channel, muted) so a member can silence
-- ONE Space or Circle for ONE topic on ONE channel without touching their global
-- grid. Absence of a row = not muted (the send path only quiets on an explicit
-- muted=true). This is the storage + the read seam the send path consults; the
-- per-member global grid still lives on notification_preferences.
create table if not exists public.subject_topic_preferences (
  id           uuid primary key default gen_random_uuid(),

  -- The member whose preference this is.
  profile_id   uuid not null references public.profiles(id) on delete cascade,

  -- What is being muted. 'space' = a Business/Non-Profit Space; 'circle' = a Circle.
  -- Free-text, code-gated to the known set so a new subject kind needs no type change.
  subject_type text not null check (subject_type in ('space', 'circle')),

  -- The id of that Space / Circle. Not FK-constrained (subject_type is polymorphic);
  -- the send path passes the id it already holds.
  subject_id   uuid not null,

  -- The topic being muted: dispatches | events | mentions | lifecycle | comments | marketing.
  topic        text not null
    check (topic in ('dispatches', 'events', 'mentions', 'lifecycle', 'comments', 'marketing')),

  -- The channel being muted for this subject+topic.
  channel      text not null check (channel in ('email', 'inapp', 'push')),

  -- The mute flag. A row exists only to record muted=true; toggling back on deletes
  -- the row (or sets false). The send path treats "no row" and "false" identically.
  muted        boolean not null default true,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- One row per (member, subject, topic, channel).
  unique (profile_id, subject_type, subject_id, topic, channel)
);

-- The send path's hot read: "is THIS member's THIS topic on THIS channel muted for
-- THIS subject?" — the full key is the unique index above; this covers subject fan-out.
create index if not exists subject_topic_preferences_profile_idx
  on public.subject_topic_preferences (profile_id);
create index if not exists subject_topic_preferences_subject_idx
  on public.subject_topic_preferences (subject_type, subject_id);

drop trigger if exists subject_topic_preferences_set_updated_at on public.subject_topic_preferences;
create trigger subject_topic_preferences_set_updated_at
  before update on public.subject_topic_preferences
  for each row execute function public.set_updated_at();

-- ── 3. contact_channel_preferences: contact-keyed (non-member) topic prefs ──────
-- notification_preferences is profile-only; a Space also emails CONTACTS who may
-- have no Frequency profile. This surface is keyed on the EMAIL (lowercased) + the
-- Space + topic + channel, so a non-member who lands on the preference center from
-- a per-Space unsubscribe token can opt DOWN a single topic ('unsubscribed')
-- instead of only hard-unsubscribing (which records a Space-scoped suppression).
-- Checked in real time at send time by the Space send path.
create table if not exists public.contact_channel_preferences (
  id           uuid primary key default gen_random_uuid(),

  -- The contact's email, lowercased+trimmed at write time (the natural key for a
  -- person with no profile). The (email, space_id, topic, channel) tuple is unique.
  email        text not null,

  -- The Space this preference is scoped to (a contact is reached BY a Space). NULL
  -- is reserved for a future platform-wide contact preference; today always set.
  space_id     uuid references public.spaces(id) on delete cascade,

  -- The topic this preference governs.
  topic        text not null
    check (topic in ('dispatches', 'events', 'mentions', 'lifecycle', 'comments', 'marketing')),

  -- The channel this preference governs (email today; inapp/push reserved).
  channel      text not null check (channel in ('email', 'inapp', 'push')),

  -- 'subscribed' (default) or 'unsubscribed'. Real-time: the send path denies when
  -- 'unsubscribed'. Absence of a row = subscribed (opt-out model, like the member grid).
  state        text not null default 'subscribed' check (state in ('subscribed', 'unsubscribed')),

  -- The optional linked contact/network_contact id, when the email resolves to one
  -- (attribution only; the email is the key so an unresolved contact still works).
  contact_id   uuid,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  unique (email, space_id, topic, channel)
);

-- The Space send path's hot read: "has THIS email opted down THIS topic for THIS Space?"
create index if not exists contact_channel_preferences_email_idx
  on public.contact_channel_preferences (email);
create index if not exists contact_channel_preferences_space_idx
  on public.contact_channel_preferences (space_id);

drop trigger if exists contact_channel_preferences_set_updated_at on public.contact_channel_preferences;
create trigger contact_channel_preferences_set_updated_at
  before update on public.contact_channel_preferences
  for each row execute function public.set_updated_at();

-- ── RLS (ADR-365 hardening) ─────────────────────────────────────────────────────
alter table public.subject_topic_preferences   enable row level security;
alter table public.subject_topic_preferences   force  row level security;
alter table public.contact_channel_preferences enable row level security;
alter table public.contact_channel_preferences force  row level security;

-- subject_topic_preferences: the member reads + writes their OWN mute rows. Split
-- per-command so every write carries WITH CHECK; auth.uid() wrapped so it is an initplan.
drop policy if exists subject_topic_preferences_select on public.subject_topic_preferences;
create policy subject_topic_preferences_select on public.subject_topic_preferences for select to authenticated using (
  profile_id in (select id from public.profiles where auth_user_id = (select auth.uid()))
);
drop policy if exists subject_topic_preferences_insert on public.subject_topic_preferences;
create policy subject_topic_preferences_insert on public.subject_topic_preferences for insert to authenticated with check (
  profile_id in (select id from public.profiles where auth_user_id = (select auth.uid()))
);
drop policy if exists subject_topic_preferences_update on public.subject_topic_preferences;
create policy subject_topic_preferences_update on public.subject_topic_preferences for update to authenticated using (
  profile_id in (select id from public.profiles where auth_user_id = (select auth.uid()))
) with check (
  profile_id in (select id from public.profiles where auth_user_id = (select auth.uid()))
);
drop policy if exists subject_topic_preferences_delete on public.subject_topic_preferences;
create policy subject_topic_preferences_delete on public.subject_topic_preferences for delete to authenticated using (
  profile_id in (select id from public.profiles where auth_user_id = (select auth.uid()))
);

-- contact_channel_preferences: a contact edits their own row WITHOUT a login (they
-- arrive from an HMAC-signed per-Space unsubscribe token). So there is NO authenticated
-- self-write policy — all writes go through the gated server action on the service-role
-- admin client (which verifies the token first). Authenticated Space operators may READ
-- the preferences for a Space they own/manage, to render the audience state. Writes stay
-- service-role only so a member can never forge another contact's subscription state.
drop policy if exists contact_channel_preferences_select on public.contact_channel_preferences;
create policy contact_channel_preferences_select on public.contact_channel_preferences for select to authenticated using (
  -- The Space owner (spaces.owner_profile_id) ...
  space_id in (
    select id from public.spaces where owner_profile_id = public.get_my_profile_id()
  )
  -- ... or an admin/moderator member of that Space.
  or space_id in (
    select space_id from public.space_members
    where profile_id = public.get_my_profile_id()
      and role in ('admin', 'moderator')
  )
);

-- ── Docs ─────────────────────────────────────────────────────────────────────
comment on table public.subject_topic_preferences is
  'Per-member per-Space/per-Circle topic MUTE (CRM Master Build Plan Phase 6). One row per (profile_id, subject_type, subject_id, topic, channel) recording muted=true. Absence = not muted. Lets a member quiet one Space/Circle for one topic on one channel without touching their global notification_preferences grid. Owner-scoped, RLS forced.';
comment on table public.contact_channel_preferences is
  'Contact-keyed (non-member) topic preferences (CRM Master Build Plan Phase 6). Keyed on lowercased email x space x topic x channel. Lets a contact reached by a Space opt DOWN a single topic (state=unsubscribed) via the preference-center landing on a per-Space unsubscribe token, instead of a hard Space-scoped suppression. Writes are service-role only (token-verified action); Space operators may read. Checked in real time by the Space send path.';

-- =============================================================================
-- VERIFICATION (after apply):
--  A. existing notification_preferences rows -> *_comments present (email/inapp true,
--     push false), freq_* all 'realtime'. No behaviour change.
--  B. update notification_preferences set freq_events='bogus' -> rejected (check).
--  C. insert subject_topic_preferences with subject_type='team' -> rejected (check).
--  D. member SELECT another member's subject_topic_preferences row -> 0 rows (RLS).
--  E. authenticated member INSERT into contact_channel_preferences -> rejected (no
--     authenticated insert policy; writes are service-role only).
--  F. Space owner SELECT contact_channel_preferences for their space -> visible.
-- =============================================================================
</content>
</invoke>
