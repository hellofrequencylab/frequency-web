-- The stored take_rate row speaks rungs (ADR-1709 §4, LIVE-754).
--
-- Production still carried the plan-named vector seeded by 20270203000000:
--   network_bps = {"free":1000,"business":500,"collective":300,"nonprofit":0,"independent":0}
-- The code reads rungs (lib/billing/pricing-keys.ts takeRateRungForPlan): free (default-deny only),
-- paid (Business, Independent), collective, nonprofit (Non Profit, Non Profit Collective). A plan-named
-- row was normalised on read, which hid the real numbers from /admin/pricing. This writes the ladder
-- itself: Business 5%, Collective 3%, Non Profit 0%. 0% on a Space's own audience and on tips is a rule
-- in code and is not stored.
--
-- network_bps is REPLACED whole (the plan-named keys go); every other key already stored survives
-- (`||` keeps the legacy flat trio and anything an operator set). The personal rungs stay as
-- default-deny values: personal selling is off (LIVE-753), so they never charge.
--
-- Upsert on the primary key, so a database without the row gets it complete. Idempotent: re-running
-- writes the same value.

insert into public.pricing_settings (key, value)
values (
  'take_rate',
  '{
    "network_bps": {"free": 1000, "paid": 500, "collective": 300, "nonprofit": 0},
    "member_free_bps": 1000,
    "member_bps": 800,
    "free_bps": 500,
    "business_bps": 300,
    "nonprofit_bps": 300
  }'::jsonb
)
on conflict (key) do update
set value = (public.pricing_settings.value - 'network_bps')
            || jsonb_build_object('network_bps', excluded.value -> 'network_bps'),
    updated_at = now();
