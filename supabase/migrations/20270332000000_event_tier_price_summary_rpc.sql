-- The /events card's "From $X" stops depending on a read that can silently truncate (SCAN-211).
--
-- 🔴 THE DEFECT, AND IT IS THE FIFTH OF ITS CLASS. app/(main)/events/index-data.ts reads every
-- ACTIVE ticket tier for the whole listing in one `.in('event_id', eventIds)` with no bound, purely
-- to resolve one short string per card. PostgREST caps every response at `max_rows` (1,000 —
-- supabase/config.toml) SERVER-SIDE: `service_role` does not escape it and `.limit()` does not raise
-- it. The listing carries up to 3 x SERIES_WIDE_READ = 1,500 events and tiers scale as
-- events x tiers, so the read is bounded by neither. Past 1,000 rows the trailing events lose their
-- price label with no error to notice: a ticketed event silently renders "Free".
--
-- Same class as ADR-962 (CRM import dedupe), ADR-969 (QR capture counts) and SCAN-303 (the going
-- tally, closed by 20270329000000_event_going_counts_rpc.sql).
--
-- ⚠️ MEASURED BEFORE BUILDING, because a latent bug and a live one deserve different urgency:
-- production on 2026-08-25 carries 2 active tiers, on 1 event, against 60 published events. Nothing
-- is truncating today. This closes the class before it fires rather than after — the opposite of the
-- four occurrences above, every one of which was found by its consequence.
--
-- 🔴 WHY CHUNKING THE INPUT IS NOT ENOUGH HERE, and why this is an AGGREGATE. SCAN-303's fix chunked
-- ids at 500 and that was sufficient *because its RPC returns at most one row per id*. Tiers are
-- many-per-event, so chunking the INPUT does not bound the RESPONSE: 500 ids at 5 tiers each is
-- 2,500 rows and truncates just the same. The response has to be bounded at the source, so this
-- function returns exactly ONE ROW PER EVENT that has any active tier.
--
-- WHAT IT RETURNS, and it is precisely what `eventPriceLabel` consumes — no more:
--   tier_count        how many active tiers (>1 means the buyer chooses, so the label says "From")
--   min_priced_cents  the cheapest tier that actually costs something, or NULL when they are all
--                     free. Mirrors the TS exactly: 'free' mode counts as 0, every other mode takes
--                     coalesce(price_cents, min_cents, suggested_cents, 0), and only values > 0 are
--                     candidates. NULL therefore means "has tiers, all free" — which is why
--                     tier_count is returned separately and NOT inferred from the price.
--   has_flexible      any tier whose mode is not 'fixed' — a floor, so the label says "From"
--
-- The event's own flat `price_cents` is deliberately NOT read here: it lives on `events`, the
-- listing already has it, and folding it in would make this function's answer depend on a row it
-- does not otherwise need.
--
-- SECURITY DEFINER + a fixed search_path, matching event_going_counts. It reads only
-- event_ticket_types and returns aggregates, never a tier's identity, name or inventory.
--
-- ROLLBACK: drop the function. lib/events/tier-prices.ts already falls back to a PAGED read when it
-- is absent, so dropping it degrades to correct-but-chattier rather than to broken.

begin;

create or replace function public.event_tier_price_summary(p_event_ids uuid[])
returns table (
  event_id uuid,
  tier_count integer,
  min_priced_cents integer,
  has_flexible boolean
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select t.event_id,
         count(*)::int as tier_count,
         nullif(min(
           case
             when t.pricing_mode = 'free' then null
             when coalesce(t.price_cents, t.min_cents, t.suggested_cents, 0) > 0
               then coalesce(t.price_cents, t.min_cents, t.suggested_cents, 0)
             else null
           end
         ), 0)::int as min_priced_cents,
         bool_or(t.pricing_mode <> 'fixed') as has_flexible
  from   public.event_ticket_types t
  where  t.active
    and  t.event_id = any(p_event_ids)
  group by t.event_id;
$function$;

-- SERVICE_ROLE ONLY, matching event_going_counts / node_capture_counts / qr_stats_summary. The
-- only caller is the listing loader, which reads through createAdminClient(); no browser session
-- ever needs this.
--
-- 🔴 AND `revoke all ... from public` ALONE WAS NOT ENOUGH — the privilege block below caught it.
-- The first version revoked from PUBLIC and granted to `authenticated, service_role`, and the
-- assertion "anon cannot execute this" FAILED, aborting the apply. Supabase's
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public (ADR-959) grants EXECUTE to anon and authenticated
-- DIRECTLY, as named roles — dropping PUBLIC's grant leaves both of theirs untouched. anon and
-- authenticated must therefore be named in the revoke. This is the ADR-964 shape one level over:
-- there it was column grants nobody narrowed, here it is a function grant that arrives pre-opened.
revoke execute on function public.event_tier_price_summary(uuid[]) from public, anon, authenticated;
grant execute on function public.event_tier_price_summary(uuid[]) to service_role;

-- PROVE IT AGAINST THE TYPESCRIPT IT REPLACES, on synthetic rows, in this transaction and undone.
--
-- ⚠️ THE ROWS ARE CREATED HERE, SO EVERY ASSERTION IS UNCONDITIONAL. `db-tests` replays every
-- migration against a FRESH database, so a check that needed pre-existing rows would abort there —
-- the lesson 20270330000000 and 20270331000000 both learned the hard way when their first versions
-- required a populated table and turned that job red. These rows exist because this block makes
-- them, so the proof holds on an empty database and a populated one alike.
--
-- 🔴 AND EVERY READ CHECKS `found` FIRST. `select ... into r` leaves the record ALL NULL when
-- nothing matched, `null <> 2` is NULL, and `if NULL then` does not fire — so a version without
-- these guards would pass by finding nothing, which is the exact defect this whole family of
-- migrations keeps being about. Asserting the row exists is what makes the value assertions mean
-- anything.
--
-- The synthetic rows are rolled back by the EXCEPTION clause: a PL/pgSQL block with a handler runs
-- in a subtransaction, so catching the sentinel undoes every insert above it. events carries only
-- two BEFORE INSERT triggers (default_space_id_to_root, sync_event_scope_arc), both pure column
-- defaulting with no external effect, so nothing escapes the rollback.
do $$
declare
  v_ev   uuid := gen_random_uuid();
  v_free uuid := gen_random_uuid();
  r record;
begin
  insert into public.events (id, title, slug, scope_id, scope_type, starts_at)
  values (v_ev,   'tier probe', 'tier-probe-' || replace(v_ev::text, '-', ''),
          gen_random_uuid(), 'public', now() + interval '30 days'),
         (v_free, 'free probe', 'free-probe-' || replace(v_free::text, '-', ''),
          gen_random_uuid(), 'public', now() + interval '30 days');

  -- A paid event: a fixed $25 tier and a sliding-scale tier with a $10 floor.
  -- ⚠️ 'sliding_scale', not 'sliding'. The first version of this block used the short name, and
  -- event_ticket_types_pricing_mode_check REFUSED IT — the apply failed atomically, leaving no
  -- function, no ledger row and no probe rows behind. Recorded because that is the block doing its
  -- job: a fixture built on a mode the schema does not allow would otherwise have been a fixture
  -- that silently tested nothing. The five legal modes are fixed, free, pwyc, sliding_scale,
  -- donation, and only 'fixed' is non-flexible.
  insert into public.event_ticket_types (event_id, name, pricing_mode, price_cents, active)
  values (v_ev, 'General', 'fixed', 2500, true);
  insert into public.event_ticket_types (event_id, name, pricing_mode, min_cents, active)
  values (v_ev, 'Sliding', 'sliding_scale', 1000, true);
  -- An INACTIVE tier, cheaper than both, which must not lower the floor or raise the count.
  insert into public.event_ticket_types (event_id, name, pricing_mode, price_cents, active)
  values (v_ev, 'Comp', 'fixed', 1, false);
  -- An event whose only tier is free: tier_count 1, min_priced_cents NULL.
  insert into public.event_ticket_types (event_id, name, pricing_mode, active)
  values (v_free, 'Free', 'free', true);

  select * into r from public.event_tier_price_summary(array[v_ev]) limit 1;
  if not found then
    raise exception 'the summary returned NO ROW for an event with two active tiers';
  end if;
  if r.tier_count is distinct from 2 then
    raise exception 'tier_count was %, expected 2 (the inactive tier must not be counted)', r.tier_count;
  end if;
  if r.min_priced_cents is distinct from 1000 then
    raise exception 'min_priced_cents was %, expected 1000 (the sliding floor, never the inactive 1c)',
      r.min_priced_cents;
  end if;
  if r.has_flexible is distinct from true then
    raise exception 'has_flexible was %, but a sliding tier is present', r.has_flexible;
  end if;

  select * into r from public.event_tier_price_summary(array[v_free]) limit 1;
  if not found then
    raise exception 'the summary returned NO ROW for an event whose only tier is free';
  end if;
  if r.tier_count is distinct from 1 or r.min_priced_cents is not null then
    raise exception 'an all-free event must report tier_count 1 and a NULL floor, got % / %',
      r.tier_count, r.min_priced_cents;
  end if;

  -- NEGATIVE: an event with no active tier returns NO ROW AT ALL. That is how the caller separates
  -- "no tiers, use the event's flat price" from "tiers, all free" — two different labels.
  if exists (select 1 from public.event_tier_price_summary(array[gen_random_uuid()])) then
    raise exception 'an event with no tiers must return no row at all';
  end if;

  raise exception 'frequency:probe-ok';
exception when others then
  -- Anything that is NOT the sentinel is a real failure and must take the migration with it.
  if sqlerrm <> 'frequency:probe-ok' then
    raise;
  end if;
  raise notice 'event_tier_price_summary: two-tier floor, all-free NULL, and empty-set cases all hold';
end $$;

-- The privilege half, which needs no rows and so is never conditional.
do $$
begin
  if not has_function_privilege('service_role', 'public.event_tier_price_summary(uuid[])', 'EXECUTE') then
    raise exception 'service_role cannot execute the summary, so the listing would fall back forever';
  end if;
  if has_function_privilege('anon', 'public.event_tier_price_summary(uuid[])', 'EXECUTE') then
    raise exception 'anon can execute the summary; the revoke did not name it';
  end if;
  if has_function_privilege('authenticated', 'public.event_tier_price_summary(uuid[])', 'EXECUTE') then
    raise exception 'authenticated can execute the summary; the revoke did not name it';
  end if;
end $$;

commit;
