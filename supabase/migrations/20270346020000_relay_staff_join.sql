-- CyberUnicorn internet relay: platform staff may drive any relay-enabled device from the staff
-- portal at /admin/cyberunicorn (LIVE-1155 follow-up, docs/LOYALTY.md section 8 "Internet relay").
-- See docs/BUILD-BACKLOG.json for status; this file explains the change, it does not track it.
--
-- private.relay_member_may_join(topic) gains one branch: a member whose web role is admin or janitor
-- may join device:<id> for any ACTIVE device whose relay is ON. The device's own switch still decides
-- whether it is reachable at all. public.relay_manageable_devices is untouched, so the phone's device
-- list (GET /api/v1/me/devices) stays the owner / Space owner / Space admin rule.
--
-- Additive and idempotent. ROLLBACK: re-run the function body from 20270346015500_device_relay.sql.

begin;

create or replace function private.relay_member_may_join(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select private.relay_topic_device(p_topic) is not null
    and (
      exists (
        select 1 from public.relay_manageable_devices(private.get_my_profile_id()) m
        where m.device_id = private.relay_topic_device(p_topic) and m.relay_enabled
      )
      or (
        coalesce(private.get_my_web_role() in ('admin', 'janitor'), false)
        and exists (
          select 1 from public.scanner_devices d
          join public.device_relay_settings r on r.device_id = d.id
          where d.id = private.relay_topic_device(p_topic) and d.active and r.relay_enabled
        )
      )
    );
$$;

revoke execute on function private.relay_member_may_join(text) from public, anon, authenticated;
grant execute on function private.relay_member_may_join(text) to authenticated, service_role;

commit;
