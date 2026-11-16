-- FH-002S: make a capped check-in code ("first N win", nodes.max_claims, ADR-112) atomic at its last unit.
--
-- Before this, the cap was a count in lib/engagement/verify.ts and a later insert in
-- lib/engagement/capture.ts. Nothing held the node between the two and each member writes a different
-- ledger key, so two members scanning together at the last unit both passed the count and both were
-- written and paid.
--
-- node_capture_claim is the one writer for a CAPPED node. In one transaction it takes the node row
-- lock, answers a replay of the same ledger key, counts the verified captures, and either refuses
-- (`capacity_reached`, nothing written) or writes the ledger row and the capture row together. Two
-- members racing the last unit take the lock in turn: the first is written, the second reads the new
-- count and is refused. The same member tapping twice takes the lock in turn too: the second tap finds
-- the ledger key and answers `already_captured` without spending a unit.
--
-- An uncapped node never calls this. Its path in lib/engagement/capture.ts is unchanged. Before this
-- file is applied the caller gets "function not found" and falls back to the old count-then-insert
-- path, so merging the code first changes nothing.
--
-- The lock is FOR NO KEY UPDATE: it serialises claims on the node without blocking the foreign-key
-- share lock an ordinary insert into captures takes on the same node row.
--
-- Security invoker, called only by the server's service-role client (the same client that inserts
-- the ledger and capture rows today). Additive and idempotent.

begin;

create or replace function public.node_capture_claim(
  p_node_id uuid,
  p_actor uuid,
  p_idempotency_key text,
  p_source text,
  p_context jsonb
)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  cap integer;
  taken integer;
  event_id uuid;
begin
  if p_node_id is null or p_actor is null or coalesce(p_idempotency_key, '') = '' or coalesce(p_source, '') = '' then
    raise exception 'node_capture_claim needs a node, an actor, a ledger key and a source' using errcode = '22023';
  end if;

  select max_claims into cap from public.nodes where id = p_node_id for no key update;
  if not found then
    return jsonb_build_object('result', 'unknown_node');
  end if;

  -- A retry or a double tap in the same window: the ledger already holds this key. Nothing is written.
  if exists (select 1 from public.engagement_events where idempotency_key = p_idempotency_key) then
    return jsonb_build_object('result', 'already_captured');
  end if;

  if cap is not null and cap > 0 then
    select count(*)::integer into taken from public.captures where node_id = p_node_id and verified;
    if taken >= cap then
      return jsonb_build_object('result', 'capacity_reached');
    end if;
  end if;

  insert into public.engagement_events (idempotency_key, source, event_type, actor_profile_id, context, verified_at)
  values (p_idempotency_key, p_source, 'node_capture', p_actor, coalesce(p_context, '{}'::jsonb), now())
  on conflict (idempotency_key) do nothing
  returning id into event_id;
  -- A writer outside this function took the key between the check and the insert.
  if event_id is null then
    return jsonb_build_object('result', 'already_captured');
  end if;

  insert into public.captures (node_id, actor_profile_id, verified) values (p_node_id, p_actor, true);

  return jsonb_build_object('result', 'claimed', 'event_id', event_id);
end;
$$;

revoke all on function public.node_capture_claim(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.node_capture_claim(uuid, uuid, text, text, jsonb) to service_role;

comment on function public.node_capture_claim(uuid, uuid, text, text, jsonb) is
  'FH-002S: claim one unit of a capped node (nodes.max_claims). Serialised on the node row, so the last unit goes to one member; writes the ledger row and the capture row together or neither. Service role only.';
comment on column public.nodes.max_claims is
  'Total verified-claim cap ("first N win"); null = unlimited. Pre-checked in verifyCapture and enforced atomically by node_capture_claim (ADR-112, FH-002S).';

commit;
