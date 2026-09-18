-- 20270345001200 replaced award_gems_atomic with a 7-argument form
-- (_day_key, _timezone). CREATE OR REPLACE on a new signature is a NEW
-- overload. Postgres grants EXECUTE to PUBLIC on a new function, so the
-- day-key form became callable by anon/authenticated even though the
-- original 5-arg form had been locked to service_role (20260929000000).
--
-- The app only calls this through the service-role admin client
-- (lib/gems.ts). Public catalog RPCs are unrelated and stay as they are.
--
-- Each revoke is guarded: a database that never had the 5-arg overload
-- (or already dropped it) must still apply this file.

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
