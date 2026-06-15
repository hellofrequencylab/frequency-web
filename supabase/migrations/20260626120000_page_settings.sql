-- Per-route PAGE SETTINGS: operator-managed page-level metadata, keyed by route. Powers
-- the on-page "Page" settings panel (docs/EMBEDDED-ADMIN.md): SEO/meta now (ADR-268), with
-- status/visibility + layout columns reserved for the follow-on shifts so they share one
-- store. Like page_chrome_overrides, this is an additive, FAIL-SAFE DB layer — the reader
-- (lib/page-settings/store.ts) returns null on any error/missing row, so the app degrades to
-- its code defaults (no SEO override) until this migration is applied.
--
-- House style: additive + idempotent, RLS on. Applied to production via the Supabase SQL
-- Editor (the repo migration-history baseline predates `db push` being safe — docs/WORKFLOW.md).
-- lib/database.types.ts is regenerated separately; readers/writers cast + are fail-safe until then.

create table if not exists public.page_settings (
  -- A safe app path string (e.g. '/feed'); validated app-side (isSafeRoute) before write.
  route           text primary key,
  -- SEO / meta (ADR-268) — applied by the (main) layout's generateMetadata.
  seo_title       text,
  seo_description text,
  og_image_url    text,
  -- Reserved for the Status & Layout shifts (unused by the SEO shift):
  status          text not null default 'published' check (status in ('draft', 'published')),
  visibility_role text,
  layout          jsonb,
  updated_by      uuid references public.profiles(id) on delete set null,
  updated_at      timestamptz not null default now()
);
comment on table public.page_settings is
  'Per-route page-level settings (SEO/meta now; status/visibility + layout reserved). Surfaced on the on-page Page panel; merged over code defaults. docs/EMBEDDED-ADMIN.md, ADR-268.';

alter table public.page_settings enable row level security;

-- World-readable: SEO/metadata is non-sensitive presentation data, read per request by the
-- (main) layout's generateMetadata regardless of the caller's auth context (same rationale as
-- page_chrome_overrides / menu_config / themes). Writes go EXCLUSIVELY through the service-role
-- admin client in a staff-gated server action; there is intentionally no client write policy.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'page_settings'
      and policyname = 'page_settings_read_all'
  ) then
    create policy page_settings_read_all on public.page_settings for select using (true);
  end if;
end $$;
