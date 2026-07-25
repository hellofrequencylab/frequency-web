-- FLAT-INBOX RETIREMENT, step 0: backfill the OPEN LOOPS onto the comms spine (ADR-820).
--
-- The two legacy flat-inbox surfaces (/admin/crm/inbox + /spaces/[slug]/crm/inbox) are being retired
-- into the Conversations workspace. Their data source (contact_interactions) STAYS the CRM timeline of
-- record — nothing moves wholesale. What must not be lost is the flat inbox's one live signal: a
-- contact whose LATEST email touch is INBOUND is awaiting a reply. This backfill creates ONE spine
-- conversation per such open loop (per contact + lane) carrying the latest inbound as its first
-- message, so every thread that was "awaiting reply" in the old inbox surfaces in Conversations.
--
-- Deliberately NOT backfilled: closed loops (latest touch outbound/internal) and deep history — the
-- per-contact CRM timeline already shows every touch, and flooding the workspace with hundreds of
-- resolved legacy threads would bury the live queue.
--
-- Idempotent: a contact+lane that already has ANY spine conversation is skipped (the spine mirror has
-- been writing contact_interactions since ADR-812, so an active spine thread implies coverage), and
-- re-running skips everything created by the first run. Messages carry metadata.legacy_interaction_id.

with latest as (
  select distinct on (ci.subject_id, ci.space_id)
    ci.subject_id as contact_id,
    ci.space_id,
    ci.direction,
    ci.summary,
    ci.body,
    ci.occurred_at,
    ci.owner_profile_id,
    ci.id as interaction_id
  from public.contact_interactions ci
  where ci.subject_kind = 'contact'
    and ci.channel = 'email'
  order by ci.subject_id, ci.space_id, ci.occurred_at desc
),
open_loops as (
  select l.*, lower(c.email) as email
  from latest l
  join public.contacts c on c.id = l.contact_id
  where l.direction = 'inbound'
    and c.email is not null
    and not exists (
      select 1 from public.comms_conversations cc
      where cc.contact_id = l.contact_id
        and cc.space_id is not distinct from l.space_id
    )
),
ins as (
  insert into public.comms_conversations
    (kind, subject, status, channel, subject_kind, subject_id, contact_id, external_email,
     owner_profile_id, space_id, metadata, last_activity_at, last_inbound_at, created_at)
  select
    'crm',
    coalesce(nullif(trim(o.summary), ''), 'Email from ' || o.email),
    'open',
    'email',
    'contact',
    o.contact_id,
    o.contact_id,
    o.email,
    o.owner_profile_id,
    o.space_id,
    jsonb_build_object('backfilled_from', 'contact_interactions', 'legacy_interaction_id', o.interaction_id),
    o.occurred_at,
    o.occurred_at,
    o.occurred_at
  from open_loops o
  returning id, contact_id, space_id
)
insert into public.comms_messages
  (conversation_id, author_contact_id, author_kind, direction, channel, body, metadata,
   delivery_status, occurred_at, created_at)
select
  i.id,
  o.contact_id,
  'contact',
  'inbound',
  'email',
  coalesce(nullif(o.body, ''), nullif(trim(o.summary), ''), '(no message body)'),
  jsonb_build_object('legacy_interaction_id', o.interaction_id),
  'received',
  o.occurred_at,
  o.occurred_at
from ins i
join open_loops o
  on o.contact_id = i.contact_id and o.space_id is not distinct from i.space_id;
