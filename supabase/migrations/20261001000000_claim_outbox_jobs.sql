-- Phase C3: close the outbox double-send race with an atomic claim RPC.
--
-- processQueue (lib/queue/outbox.ts) SELECTed due 'pending' jobs WITHOUT claiming them, so two
-- overlapping drains -- a cron run overlapping the previous one, or the manual "send now" Studio
-- action racing the cron -- both read the same rows and both ran the handler => double email /
-- push / SMS. This RPC flips up to _limit due jobs to 'processing' atomically under FOR UPDATE
-- SKIP LOCKED: each row is claimed by exactly one drain; concurrent drains skip locked rows and
-- claim disjoint sets. It also reclaims jobs stuck in 'processing' for > 5 min (a drain that
-- crashed after claiming but before writing a terminal state) so nothing strands -- at-least-once.
-- Sub-second sends stay well under the 5-min window, so the reclaim never re-fires a live handler.
--
-- Preserves due semantics: only run_after <= now() rows are claimed (future backoff retries aren't
-- pulled early), ordered run_after asc (matching notification_queue_due_idx (status, run_after)).
-- FOR UPDATE SKIP LOCKED is the queue-claim primitive; no advisory lock (that would serialize
-- drains). 'processing' is a new transient status; the column has no CHECK, so no DDL needed.
-- SECURITY DEFINER, pinned search_path, service_role only.

create or replace function public.claim_outbox_jobs(_limit int default 25)
returns setof public.notification_queue
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.notification_queue q
     set status = 'processing',
         updated_at = now()
   where q.id in (
     select id
       from public.notification_queue
      where run_after <= now()
        and (
          status = 'pending'
          or (status = 'processing' and updated_at < now() - interval '5 minutes')
        )
      order by run_after asc
      for update skip locked
      limit greatest(coalesce(_limit, 25), 0)
   )
  returning q.*;
end;
$$;

-- Supabase default-grants EXECUTE to anon + authenticated on new public functions, so revoke
-- from those explicitly (not just public).
revoke all on function public.claim_outbox_jobs(int) from public, anon, authenticated;
grant execute on function public.claim_outbox_jobs(int) to service_role;
