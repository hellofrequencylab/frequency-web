-- SHORT SHARE LINKS (LIVE-1960). One short code per (public page, sharer): frequencylocal.com/s/<slug>.
-- It opens the public page with the sharer's ?ref attached, so the existing referral cookie and
-- onboarding credit work unchanged. Only the public path is stored, never a query string or a full URL.
-- Counts are per day and per link, with no visitor data at all (no IP, no user agent, no profile id).
-- ADDITIVE and idempotent. Internal tables: RLS on, no client policy, service role only.

create table if not exists public.share_links (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique check (slug ~ '^[a-z0-9-]{3,48}$'),
  path              text not null check (path ~ '^/[^?#\\]*$' and path not like '//%'),
  sharer_profile_id uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now()
);

-- One link per page per sharer (NULL sharer = the anonymous/site link for that page).
create unique index if not exists share_links_path_sharer_uniq
  on public.share_links (path, coalesce(sharer_profile_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists share_links_sharer_idx on public.share_links (sharer_profile_id);

create table if not exists public.share_link_opens (
  link_id uuid not null references public.share_links(id) on delete cascade,
  day     date not null,
  opens   integer not null default 0,
  primary key (link_id, day)
);

alter table public.share_links enable row level security;
alter table public.share_link_opens enable row level security;
revoke all on public.share_links from anon, authenticated;
revoke all on public.share_link_opens from anon, authenticated;

-- Resolve a slug and count the open in one call. Returns the stored path and sharer, or no row.
create or replace function public.open_share_link(p_slug text, p_count boolean default true)
returns table (path text, sharer_profile_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select l.id, l.path, l.sharer_profile_id into v_id, path, sharer_profile_id
    from public.share_links l where l.slug = p_slug;
  if v_id is null then
    return;
  end if;
  if p_count then
    insert into public.share_link_opens (link_id, day, opens)
    values (v_id, (now() at time zone 'utc')::date, 1)
    on conflict (link_id, day) do update set opens = public.share_link_opens.opens + 1;
  end if;
  return next;
end;
$$;
revoke all on function public.open_share_link(text, boolean) from public, anon, authenticated;
grant execute on function public.open_share_link(text, boolean) to service_role;
