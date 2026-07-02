-- pgTAP behavioral guard for apply_membership_event_atomic (migration 20261003000000):
-- the Stripe subscription event-ordering guard. Stripe does not guarantee webhook delivery
-- order, so a delayed customer.subscription.updated(active) created BEFORE a cancel can be
-- DELIVERED after it and re-grant a canceled tier (silent free access). The RPC ignores any
-- event whose created timestamp is <= the last APPLIED one (strict >), atomically under a
-- per-profile advisory lock. This test pins that behavior against a real Postgres.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(9);

-- Seed member profiles (display_name + handle are the only NOT NULL columns without defaults;
-- profiles.id has no auth FK, so a bare uuid is fine).
insert into public.profiles (id, display_name, handle, membership_tier, is_supporter, last_stripe_event_at) values
  ('00000000-0000-0000-0000-0000000000aa', 'A', 'guard_a', 'free', false, null),
  ('00000000-0000-0000-0000-0000000000bb', 'B', 'guard_b', 'free', false, null),
  ('00000000-0000-0000-0000-0000000000cc', 'C', 'guard_c', 'free', false, null),
  ('00000000-0000-0000-0000-0000000000dd', 'D', 'guard_d', 'free', false, null);

-- 1. The exact bug scenario: a CANCEL applies, then a STALE (older) active is rejected.
select is(
  (public.apply_membership_event_atomic(
    '00000000-0000-0000-0000-0000000000aa', '2026-07-02T12:00:10Z', 'free', 'canceled') ->> 'applied'),
  'true',
  'cancel applies first (newer event)'
);
select is(
  (public.apply_membership_event_atomic(
    '00000000-0000-0000-0000-0000000000aa', '2026-07-02T12:00:05Z', 'crew', 'active') ->> 'applied'),
  'false',
  'a stale (older-created) active is rejected'
);
select is(
  (select membership_tier from public.profiles where id = '00000000-0000-0000-0000-0000000000aa'),
  'free',
  'the canceled tier is NOT re-granted by the out-of-order active (the fix)'
);

-- 2. In-order active then a LATER cancel: both apply, final tier is free.
select is(
  (public.apply_membership_event_atomic(
    '00000000-0000-0000-0000-0000000000bb', '2026-07-02T12:00:00Z', 'crew', 'active') ->> 'applied'),
  'true',
  'active applies (in order)'
);
select is(
  (public.apply_membership_event_atomic(
    '00000000-0000-0000-0000-0000000000bb', '2026-07-02T12:00:10Z', 'free', 'canceled') ->> 'applied'),
  'true',
  'a later cancel applies'
);
select is(
  (select membership_tier from public.profiles where id = '00000000-0000-0000-0000-0000000000bb'),
  'free',
  'in-order cancel wins -> tier free'
);

-- 3. Equal timestamp is treated as stale (<=): a same-second active after a cancel is dropped.
do $$ begin
  perform public.apply_membership_event_atomic(
    '00000000-0000-0000-0000-0000000000cc', '2026-07-02T12:00:00Z', 'free', 'canceled');
end $$;
select is(
  (public.apply_membership_event_atomic(
    '00000000-0000-0000-0000-0000000000cc', '2026-07-02T12:00:00Z', 'crew', 'active') ->> 'applied'),
  'false',
  'an equal-timestamp active is stale (strict >) and dropped'
);

-- 4. is_supporter is never cleared: set true once, a later event with _is_supporter=null keeps it.
do $$ begin
  perform public.apply_membership_event_atomic(
    '00000000-0000-0000-0000-0000000000dd', '2026-07-02T12:00:00Z', 'crew', 'active', true);
  perform public.apply_membership_event_atomic(
    '00000000-0000-0000-0000-0000000000dd', '2026-07-02T12:00:10Z', 'crew', 'active', null);
end $$;
select is(
  (select is_supporter from public.profiles where id = '00000000-0000-0000-0000-0000000000dd'),
  true,
  'the is_supporter badge is only ever set true, never cleared'
);

-- 5. service_role-only: anon must not hold EXECUTE on the entitlement RPC.
select is(
  has_function_privilege('anon', 'public.apply_membership_event_atomic(uuid, timestamptz, text, text, boolean, text)', 'execute'),
  false,
  'anon cannot execute the entitlement RPC'
);

select * from finish();
rollback;
