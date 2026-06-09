-- =============================================================================
-- Operator-editable page content (ADR-180)
--
-- A small key→content store for the editable header (title + description) of coded
-- pages, keyed by route. A page reads it and falls back to its hardcoded default
-- when there's no row, so editing is purely additive and a page never breaks if the
-- store is empty. Edited from the page's Settings panel by an operator (admin+);
-- writes go through the service role after an admin capability check.
-- =============================================================================

create table if not exists public.page_content (
  route       text primary key,
  title       text,
  description text,
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now()
);

alter table public.page_content enable row level security;

-- Public read (it's page chrome shown to everyone); all writes go through the
-- service role from the admin-gated save action.
drop policy if exists "page_content public read" on public.page_content;
create policy "page_content public read" on public.page_content
  for select using (true);

comment on table public.page_content is
  'Operator-editable page header content (title/description) keyed by route (ADR-180). Read with fallback to coded defaults; service-role write after an admin check.';
