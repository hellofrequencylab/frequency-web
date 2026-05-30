-- Visual page editor (Puck) — content store for the marketing pages.
-- See docs/PAGE-EDITOR-SPEC.md. Service-role only (Studio writes via staff-gated
-- actions; public render fetches published_data server-side with the admin client).

create table if not exists public.pages (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,                 -- 'home' | 'the-lab' | 'how-it-works' | 'about'
  title           text not null,
  data            jsonb not null default '{}'::jsonb,   -- Puck working DRAFT  { content:[], root:{} }
  published_data  jsonb,                                 -- the LIVE version the public renders
  seo_title       text,
  seo_description text,
  og_image_url    text,
  status          text not null default 'draft',         -- draft | published
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles(id) on delete set null,
  published_at    timestamptz
);

alter table public.pages enable row level security;
-- No policies: service-role only.

comment on table public.pages is
  'Marketing-page content for the Puck visual editor. data=draft, published_data=live. Service-role only; see docs/PAGE-EDITOR-SPEC.md.';

-- Public media bucket for editor image uploads.
insert into storage.buckets (id, name, public)
values ('site-media', 'site-media', true)
on conflict (id) do nothing;
