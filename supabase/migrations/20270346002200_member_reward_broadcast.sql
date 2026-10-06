-- A reward earned on one device shows on the member's other devices without a reload (LIVE-671).
-- See docs/BUILD-BACKLOG.json for status; this file explains the work, it does not track it.
--
-- Zaps and Gems land in two ledgers, public.zap_transactions and public.gem_transactions, and
-- every reward writer in the app (awardZaps, awardGems, award_*_atomic, the RPCs) ends in an
-- INSERT on one of them. So the publish lives HERE, once, on the ledgers, rather than in each
-- writer: an AFTER INSERT trigger sends a Realtime Broadcast to the member's private topic
--     member:<profile_id>
-- and the app shell (components/layout/reward-live.tsx) listens on it and refreshes.
--
-- 1. private.broadcast_member_reward(): SECURITY DEFINER so the insert into realtime.messages
--    runs as the owner whatever role wrote the ledger row; search_path pinned; execute revoked
--    from everyone (a trigger needs no grant). Only positive rows publish: a reversal is not a
--    reward to celebrate. It can never fail a reward write: realtime.send already downgrades
--    its own errors to a WARNING, and the call is wrapped again here.
-- 2. Realtime authorization. realtime.messages has RLS on and no policies, so no private
--    channel could be joined. One SELECT policy lets a signed-in member receive Broadcast on
--    their OWN member topic and nothing else. No INSERT policy: members cannot publish, only the
--    trigger (as owner) can.
--
-- Payload: { kind: 'zaps' | 'gems', amount, action }. Never metadata.
-- Additive and idempotent. ROLLBACK:
--   drop trigger if exists trg_broadcast_zap_reward on public.zap_transactions;
--   drop trigger if exists trg_broadcast_gem_reward on public.gem_transactions;
--   drop function if exists private.broadcast_member_reward();
--   drop policy if exists "realtime: a member receives their own member channel" on realtime.messages;

create or replace function private.broadcast_member_reward()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.amount is null or new.amount <= 0 or new.profile_id is null then
    return new;
  end if;
  begin
    perform realtime.send(
      jsonb_build_object(
        'kind', case when tg_table_name = 'gem_transactions' then 'gems' else 'zaps' end,
        'amount', new.amount,
        'action', new.action_type
      ),
      'reward',
      'member:' || new.profile_id::text,
      true
    );
  exception when others then
    raise warning 'broadcast_member_reward: %', sqlerrm;
  end;
  return new;
end;
$$;

revoke execute on function private.broadcast_member_reward() from public, anon, authenticated;

drop trigger if exists trg_broadcast_zap_reward on public.zap_transactions;
create trigger trg_broadcast_zap_reward
  after insert on public.zap_transactions
  for each row execute function private.broadcast_member_reward();

drop trigger if exists trg_broadcast_gem_reward on public.gem_transactions;
create trigger trg_broadcast_gem_reward
  after insert on public.gem_transactions
  for each row execute function private.broadcast_member_reward();

drop policy if exists "realtime: a member receives their own member channel" on realtime.messages;
create policy "realtime: a member receives their own member channel"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) = 'member:' || (select private.get_my_profile_id())::text
  );
