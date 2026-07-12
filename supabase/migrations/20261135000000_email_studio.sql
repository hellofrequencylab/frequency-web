-- Email Studio (2026) Phase 1 - the data spine for a block-based email editor. Additive + idempotent, safe
-- to re-run. House style matches campaigns.sql / space_email_templates.sql: the operator marketing tables
-- stay SERVICE-ROLE ONLY (RLS enabled, NO client policies), reached only through the gated Studio server
-- actions behind requireStaff(). lib/database.types.ts is regenerated separately, so the seam reaches these
-- columns with untyped casts until then (ADR-246). This file is the canonical record. No em or en dashes.

-- ── 1. Extend the shared campaigns table with the block-based email fields ────────────────────────────────
-- A campaign can now carry a block-editor document (block_json, an EntityLayout with kind 'email') as the
-- SOURCE OF TRUTH for its body, a preheader (the inbox preview text), and a compiled_html cache written at
-- schedule / send time (so the exact bytes sent are recorded and re-render is not needed per recipient).
-- All nullable + additive: existing plain-text campaigns (body) keep working unchanged.
alter table public.campaigns add column if not exists block_json    jsonb;
alter table public.campaigns add column if not exists preheader     text;
alter table public.campaigns add column if not exists compiled_html text;

comment on column public.campaigns.block_json is
  'The block-editor email document (an entity-blocks EntityLayout, kind email) that is the source of truth for the body when present. Null for a legacy plain-text (body) campaign. See lib/email-studio.';
comment on column public.campaigns.preheader is
  'The inbox preview / preheader text shown beside the subject. Plain text, may be null.';
comment on column public.campaigns.compiled_html is
  'The compiled, send-ready HTML cached at schedule / send time (rendered from block_json via lib/email-studio). Null until compiled.';

-- ── 2. Reusable EMAIL TEMPLATES (operator-curated starting points) ───────────────────────────────────────
-- A named, reusable email document an operator can start a campaign from. block_json is the template body
-- (an EntityLayout, kind 'email'); subject + preheader seed the composer. Loading a template only prefills a
-- fresh draft, it never sends.
create table if not exists public.email_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  category    text,
  block_json  jsonb not null,
  subject     text,
  preheader   text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);

create index if not exists email_templates_created_idx on public.email_templates (created_at desc);
create index if not exists email_templates_category_idx on public.email_templates (category);

comment on table public.email_templates is
  'Reusable, operator-curated email TEMPLATES for Email Studio (2026). block_json is the template body (an entity-blocks EntityLayout, kind email); subject + preheader seed the composer. Loading a template prefills a draft, it never sends. Service-role only: RLS is ENABLED with NO client policies, so the ONLY access path is the gated Studio server actions behind requireStaff() (mirrors public.campaigns). Never exposed to the browser client.';
comment on column public.email_templates.block_json is 'The template body: an entity-blocks EntityLayout (kind email). Rendered by lib/email-studio/render.ts.';
comment on column public.email_templates.category is 'Optional grouping label for the template picker (for example newsletter, announcement, welcome).';
comment on column public.email_templates.updated_at is 'Set by the app on update (house convention: no trigger, matches space_email_templates). Null until first edit.';

-- RLS: enabled, NO client policies (all access via the service-role admin client behind requireStaff()).
-- Enabling RLS with no SELECT/INSERT/UPDATE/DELETE policy denies ALL direct client access, exactly like
-- public.campaigns. Operator-only by construction.
alter table public.email_templates enable row level security;

-- ── ROLLBACK ─────────────────────────────────────────────────────────────────────────────────────────────
-- drop table if exists public.email_templates;  -- drops its indexes + RLS with it.
-- alter table public.campaigns drop column if exists block_json;
-- alter table public.campaigns drop column if exists preheader;
-- alter table public.campaigns drop column if exists compiled_html;
