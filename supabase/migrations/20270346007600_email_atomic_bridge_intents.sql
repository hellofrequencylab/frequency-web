-- EMAIL-002 draft. Created with supabase migration new at 20261009000529;
-- renumbered per repository dependency order after the comms spine. No production application.
-- Service-only additive bridge transaction. Provider acceptance/idempotency is a later packet.
-- Observed From equality is address binding, not cryptographic sender authentication;
-- activation also requires authenticated inbound evidence or actor-specific bearer-token controls.
create table public.email_delivery_intents (
  id uuid primary key default gen_random_uuid(),
  space_id uuid references public.spaces(id) on delete cascade,
  conversation_id uuid not null references public.comms_conversations(id) on delete cascade,
  message_id uuid not null unique references public.comms_messages(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  logical_send_key text not null unique,
  payload jsonb not null,
  queue_job_id uuid references public.notification_queue(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.email_delivery_intents enable row level security;
revoke all on public.email_delivery_intents from public, anon, authenticated;
grant select, insert, update, delete on public.email_delivery_intents to service_role;
create index email_delivery_intents_space_idx on public.email_delivery_intents(space_id);

create function public.enqueue_conversation_email_intent(
  p_conversation_id uuid, p_actor_profile_id uuid, p_external_message_id text,
  p_observed_sender text, p_body text, p_payload jsonb
) returns jsonb
-- Privileged narrowly because auth.users is not readable by service_role in a clean Supabase replay.
-- Execute remains service-only; all conversation/actor/tenant/confirmed-email checks precede mutation.
language plpgsql security definer set search_path = '' as $$
declare
  c public.comms_conversations%rowtype;
  s public.spaces%rowtype;
  a public.profiles%rowtype;
  existing public.email_delivery_intents%rowtype;
  observed_message public.comms_messages%rowtype;
  intent_id uuid := gen_random_uuid();
  message_id uuid := gen_random_uuid();
  job_id uuid := gen_random_uuid();
  logical_key text;
  canonical_payload jsonb;
  actor_email text;
begin
  if p_external_message_id is null or length(btrim(p_external_message_id)) not between 1 and 998
    or p_body is null or length(p_body) > 1000000
    or jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'Invalid atomic email intent input' using errcode='22023';
  end if;
  -- Serializes duplicate bridge receives and simultaneous assignment/conversation changes.
  select * into c from public.comms_conversations where id=p_conversation_id for update;
  if not found or c.channel <> 'email' or c.external_email is null
    or coalesce(c.assigned_to,c.owner_profile_id) is distinct from p_actor_profile_id then
    raise exception 'Conversation actor or recipient unavailable' using errcode='42501';
  end if;
  select * into a from public.profiles where id=p_actor_profile_id for share;
  if not found or a.is_active is false or a.suspended_at is not null then
    raise exception 'Actor unavailable' using errcode='42501';
  end if;
  select lower(u.email) into actor_email from auth.users u where u.id=a.auth_user_id and u.email_confirmed_at is not null;
  if actor_email is null or lower(btrim(p_observed_sender)) is distinct from actor_email then
    raise exception 'Bridge sender does not match assigned actor' using errcode='42501';
  end if;
  if c.space_id is not null then
    select * into s from public.spaces where id=c.space_id for share;
    if not found or s.status <> 'active' or not (
      s.owner_profile_id=p_actor_profile_id or exists (
        select 1 from public.space_members m where m.space_id=c.space_id
          and m.profile_id=p_actor_profile_id and m.status='active' and m.role in ('editor','admin')
      )
    ) then raise exception 'Space actor unavailable' using errcode='42501'; end if;
  elsif a.web_role not in ('admin','janitor') and c.kind <> 'leader' then
    raise exception 'Platform actor unavailable' using errcode='42501';
  end if;
  -- Recipient comes from the locked conversation, never from a caller-selected address.
  -- V1 envelope is constructed here, not taken as an authorization claim from the webhook.
  if p_payload ? 'atomicIntentId' or p_payload ? 'deliveryContext'
    or jsonb_typeof(p_payload->'subject') is distinct from 'string'
    or jsonb_typeof(p_payload->'html') is distinct from 'string' then
    raise exception 'Invalid outbound transport payload' using errcode='22023';
  end if;
  logical_key := 'bridge:'||c.id::text||':'||p_external_message_id;
  canonical_payload := p_payload || jsonb_build_object('to',lower(c.external_email));
  select * into existing from public.email_delivery_intents where logical_send_key=logical_key;
  if found then
    select * into observed_message from public.comms_messages where id=existing.message_id;
    if existing.actor_profile_id is distinct from p_actor_profile_id or existing.payload <> canonical_payload
      or observed_message.body <> p_body then
      raise exception 'Conflicting email intent replay' using errcode='22023';
    end if;
    return jsonb_build_object('intentId',existing.id,'messageId',existing.message_id,'jobId',existing.queue_job_id,'duplicate',true);
  end if;
  -- Legacy append-before-enqueue rows lack trustworthy provider outcome. Do not silently resend.
  if exists(select 1 from public.comms_messages where external_message_id=p_external_message_id) then
    raise exception 'Legacy bridge receipt requires reconciliation' using errcode='55000';
  end if;
  insert into public.comms_messages(id,conversation_id,author_id,author_kind,direction,channel,
    body,external_message_id,delivery_status,metadata)
  values(message_id,c.id,p_actor_profile_id,case when c.kind='leader' then 'leader' else 'staff' end,
    'outbound','email',p_body,p_external_message_id,'queued',jsonb_build_object('delivery_intent_id',intent_id));
  insert into public.email_delivery_intents(id,space_id,conversation_id,message_id,actor_profile_id,logical_send_key,payload)
  values(intent_id,c.space_id,c.id,message_id,p_actor_profile_id,logical_key,canonical_payload);
  insert into public.notification_queue(id,kind,payload,dedupe_key)
  values(job_id,'email',canonical_payload || jsonb_build_object('atomicIntentId',intent_id,'deliveryContext',jsonb_build_object(
    'version',1,'logicalSendKey',logical_key,'recipientKey',coalesce(c.member_profile_id,c.contact_id,c.id)::text,
    'spaceId',c.space_id,'purpose','human-reply','topic',null,
    'identity',jsonb_build_object('kind','frequency','identityId',null,'revision',null),
    'source',jsonb_build_object('kind','conversation','id',c.id))),logical_key);
  update public.email_delivery_intents set queue_job_id=job_id where id=intent_id;
  update public.comms_conversations set last_activity_at=now(),last_outbound_at=now(),updated_at=now(),
    status=case when status in ('open','in_progress') then 'waiting' else status end where id=c.id;
  return jsonb_build_object('intentId',intent_id,'messageId',message_id,'jobId',job_id,'duplicate',false);
end;
$$;
revoke all on function public.enqueue_conversation_email_intent(uuid,uuid,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.enqueue_conversation_email_intent(uuid,uuid,text,text,text,jsonb) to service_role;

create index email_delivery_intents_conversation_idx on public.email_delivery_intents(conversation_id);
create index email_delivery_intents_actor_idx on public.email_delivery_intents(actor_profile_id) where actor_profile_id is not null;
create index email_delivery_intents_queue_idx on public.email_delivery_intents(queue_job_id) where queue_job_id is not null;
