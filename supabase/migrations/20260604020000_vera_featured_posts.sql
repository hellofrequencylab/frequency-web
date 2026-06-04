-- Vera-curated splash feed: posts Vera auto-features ("showing up for each other").
-- Additive: featured_at flag + a public, security-definer RPC mirroring public_posts.
-- Applied via MCP. See ADR-080 / the "People showing up for each other" splash section.
alter table public.posts add column if not exists featured_at timestamptz;
create index if not exists idx_posts_featured_at on public.posts (featured_at desc) where featured_at is not null;

create or replace function public.public_featured_posts(_limit integer default 6)
returns table(id uuid, body text, created_at timestamptz, featured_at timestamptz, media_urls text[], author_display_name text, author_handle text, author_avatar_url text)
language sql stable security definer set search_path to 'public'
as $$
  select p.id, p.body, p.created_at, p.featured_at, p.media_urls,
         pr.display_name, pr.handle, pr.avatar_url
  from   posts p
  left join profiles pr on pr.id = p.author_id
  where  p.visibility = 'public'
    and  p.parent_id is null
    and  p.hidden_at is null
    and  p.featured_at is not null
  order by p.featured_at desc
  limit  greatest(1, least(_limit, 50));
$$;
grant execute on function public.public_featured_posts(integer) to anon, authenticated, service_role;
