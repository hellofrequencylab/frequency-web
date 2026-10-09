-- EMAIL-003 draft, CLI-created 20261009003246 then dependency-renumbered. Not applied.
-- Acceptance is independent of queue completion. Unknown acceptance never resets its safety clock.
create table public.email_provider_attempts (
 -- Durable key survives routine queue cleanup; prepare validates an existing claimed job.
 queue_job_id uuid primary key,
 idempotency_key text not null unique,
 frozen_payload jsonb not null,
 first_attempt_at timestamptz not null default now(),
 state text not null check(state in ('dispatching','retryable','uncertain','accepted','failed','held')),
 prior_unknown boolean not null default false,
 provider_id text unique,
 accepted_at timestamptz,
 attempt_nonce uuid not null,
 last_error text,
 updated_at timestamptz not null default now(),
 check ((state='accepted')=(provider_id is not null))
);
alter table public.email_provider_attempts enable row level security;
revoke all on public.email_provider_attempts from public,anon,authenticated;
grant select,insert,update,delete on public.email_provider_attempts to service_role;

create function public.prepare_email_provider_attempt(p_queue_job_id uuid,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare q public.notification_queue%rowtype; a public.email_provider_attempts%rowtype;
begin
 select * into q from public.notification_queue where id=p_queue_job_id for update;
 if not found or q.kind not in ('email','space-campaign-email') or q.status<>'processing' then
  raise exception 'Provider acceptance requires a currently claimed email job' using errcode='42501';
 end if;
 -- Sticky per-job consumer marker keeps rollback from routing unresolved jobs into the legacy sender.
 update public.notification_queue set payload=payload||jsonb_build_object('__providerAcceptanceRequired',true) where id=p_queue_job_id;
 if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Invalid provider payload' using errcode='22023'; end if;
 select * into a from public.email_provider_attempts where queue_job_id=p_queue_job_id for update;
 if found then
  if a.frozen_payload<>p_payload then raise exception 'Provider payload changed on retry' using errcode='22023'; end if;
  if a.state='accepted' then return jsonb_build_object('state','accepted','providerId',a.provider_id); end if;
  if a.state in ('failed','held') then return jsonb_build_object('state',a.state); end if;
  if (a.state in ('dispatching','uncertain') or a.prior_unknown) and a.first_attempt_at <= now()-interval '23 hours' then
   update public.email_provider_attempts set state='held',last_error='uncertain acceptance beyond safe provider retention window',updated_at=now() where queue_job_id=p_queue_job_id;
   return jsonb_build_object('state','held');
  end if;
  update public.email_provider_attempts set prior_unknown=(prior_unknown or state in ('dispatching','uncertain')),
   state='dispatching',attempt_nonce=gen_random_uuid(),updated_at=now() where queue_job_id=p_queue_job_id returning * into a;
 else
  insert into public.email_provider_attempts(queue_job_id,idempotency_key,frozen_payload,state,attempt_nonce)
   values(p_queue_job_id,'frequency/email/'||p_queue_job_id::text,p_payload,'dispatching',gen_random_uuid()) returning * into a;
 end if;
 return jsonb_build_object('state','dispatching','idempotencyKey',a.idempotency_key,'nonce',a.attempt_nonce,'payload',a.frozen_payload);
end $$;

create function public.settle_email_provider_attempt(p_queue_job_id uuid,p_nonce uuid,p_outcome text,p_provider_id text,p_error text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare a public.email_provider_attempts%rowtype;
begin
 select * into a from public.email_provider_attempts where queue_job_id=p_queue_job_id for update;
 if not found or p_nonce is null or p_outcome is null or p_outcome not in ('accepted','retryable','uncertain','failed') then raise exception 'Invalid provider settlement' using errcode='22023'; end if;
 if a.state='accepted' then return p_outcome='accepted' and a.provider_id=p_provider_id; end if;
 -- Accepted provider ID resolves even a stale worker/held attempt. Rejections must own the current nonce.
 if p_outcome<>'accepted' and a.attempt_nonce<>p_nonce then return false; end if;
 if p_outcome='accepted' and (p_provider_id is null or length(btrim(p_provider_id))=0) then raise exception 'Acceptance requires provider ID' using errcode='22023'; end if;
 update public.email_provider_attempts set state=p_outcome,
  prior_unknown=case when p_outcome='accepted' then false when p_outcome='uncertain' then true else prior_unknown end,
  provider_id=case when p_outcome='accepted' then p_provider_id else null end,
  accepted_at=case when p_outcome='accepted' then now() else null end,
  last_error=left(p_error,300),updated_at=now() where queue_job_id=p_queue_job_id;
 -- These projections happen in the same transaction as acceptance; provider retry cannot strand linkage.
 if p_outcome in ('accepted','failed') then
  update public.comms_messages m set delivery_status=case when p_outcome='accepted' then 'sent' else 'failed' end
   from public.email_delivery_intents i where i.queue_job_id=p_queue_job_id and i.message_id=m.id and m.delivery_status='queued';
 end if;
 return true;
end $$;
revoke all on function public.prepare_email_provider_attempt(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.settle_email_provider_attempt(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.prepare_email_provider_attempt(uuid,jsonb) to service_role;
grant execute on function public.settle_email_provider_attempt(uuid,uuid,text,text,text) to service_role;
