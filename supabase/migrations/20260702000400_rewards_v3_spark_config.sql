-- Rewards Economy v3 — Spark variable layer config (ADR-305, docs/REWARDS-ECONOMY.md)
--
-- Spark is a light, low-frequency, capped surprise bonus layered ON TOP of the
-- deterministic base payouts (lib/rewards/spark.ts, hooked into the practice log).
-- awardGems gates on an active gem_config row even with an override amount, so the
-- Spark Gem bonus needs this row to pay.

begin;

insert into gem_config (action_type, gems_amount, daily_cap, description, is_active)
values ('spark_bonus', 5, null, 'A Spark — surprise bonus on top of your reward', true)
on conflict (action_type) do update
  set gems_amount = excluded.gems_amount, description = excluded.description, is_active = true;

commit;
