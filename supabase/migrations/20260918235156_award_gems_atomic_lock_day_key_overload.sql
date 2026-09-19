-- RECOVERED FROM THE LEDGER, NOT AUTHORED HERE.
--
-- `check:migrations` caught this as ledger DRIFT on 2026-09-19: 710 repo files against 711 applied
-- rows, with this version present in production and absent from the tree. Production had run SQL a
-- fresh environment would never reproduce, which is the exact failure that guard exists to name.
-- The statements below are the ledger's own `statements` for version 20260918235156, committed
-- verbatim under the version they were applied as, per the guard's instruction and docs/DATABASE.md.
--
-- ⚠️ The filename version IS the version: the repo sorts and replays by it, so this must never be
-- renamed to something tidier.
--
-- WHAT IT DOES: locks both overloads of `award_gems_atomic` to `service_role`. Awarding Gems is a
-- privileged write, so a role that can reach it from a browser session can mint currency; this
-- revokes it from `public`, `anon` and `authenticated` and grants it to the service role alone.
-- Both overloads are handled because a grant on one signature says nothing about the other, and the
-- whole thing is idempotent: each arm swallows `undefined_function`, so it is safe on an
-- environment where either signature has not been created yet.

do $lock$
begin
  begin
    execute $sql$
      revoke all on function public.award_gems_atomic(uuid, text, integer, integer, jsonb, text, text)
        from public, anon, authenticated
    $sql$;
    execute $sql$
      grant execute on function public.award_gems_atomic(uuid, text, integer, integer, jsonb, text, text)
        to service_role
    $sql$;
  exception
    when undefined_function then
      null;
  end;

  begin
    execute $sql$
      revoke all on function public.award_gems_atomic(uuid, text, integer, integer, jsonb)
        from public, anon, authenticated
    $sql$;
    execute $sql$
      grant execute on function public.award_gems_atomic(uuid, text, integer, integer, jsonb)
        to service_role
    $sql$;
  exception
    when undefined_function then
      null;
  end;
end
$lock$;
