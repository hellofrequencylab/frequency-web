-- EMAIL-042 (owner ruling 2026-10-20: saved email sections live in a shared database table). An operator can keep
-- a block they built (its type and content) and add a copy to any email, from any device, and the whole
-- marketing team sees the same library. Service-role only: the Email Studio actions are the only reader and
-- writer, behind the writer gate; nothing here is reachable from a browser session.
create table public.email_saved_sections (
 id uuid primary key default gen_random_uuid(),
 name text not null check(char_length(btrim(name)) between 1 and 60),
 block_type text not null check(char_length(block_type) between 1 and 64),
 content jsonb not null default '{}'::jsonb check(jsonb_typeof(content)='object' and pg_column_size(content) <= 20000),
 created_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now()
);
create index email_saved_sections_created_by_idx on public.email_saved_sections(created_by) where created_by is not null;
create index email_saved_sections_created_idx on public.email_saved_sections(created_at desc);
comment on table public.email_saved_sections is
 'EMAIL-042: reusable email blocks the marketing team keeps by name (block type plus content). Service-role only; the Email Studio actions read and write it behind the writer gate. Capped at 60 rows by the action.';
alter table public.email_saved_sections enable row level security;
revoke all on public.email_saved_sections from public,anon,authenticated;
grant all on public.email_saved_sections to service_role;
