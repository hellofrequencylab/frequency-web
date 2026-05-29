-- Phase 6.3: populate `contacts`. Auto-link a CRM contact whenever a profile is
-- created, and backfill contacts for existing members. Email lives in auth.users
-- (profiles don't store it). Idempotent on lower(email). Additive.

create or replace function public.sync_contact_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  select email into v_email from auth.users where id = new.auth_user_id;
  if v_email is not null then
    insert into public.contacts (email, profile_id, display_name, source)
    values (lower(v_email), new.id, new.display_name, 'signup')
    on conflict (lower(email)) do update
      set profile_id   = excluded.profile_id,
          display_name = coalesce(contacts.display_name, excluded.display_name);
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_sync_contact on public.profiles;
create trigger profiles_sync_contact
  after insert on public.profiles
  for each row execute function public.sync_contact_from_profile();

-- Backfill existing members (system/no-email profiles are skipped).
insert into public.contacts (email, profile_id, display_name, source)
select lower(u.email), p.id, p.display_name, 'backfill'
from public.profiles p
join auth.users u on u.id = p.auth_user_id
where u.email is not null
on conflict (lower(email)) do update set profile_id = excluded.profile_id;
