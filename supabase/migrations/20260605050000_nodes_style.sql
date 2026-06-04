-- Apply the QR styler to check-in codes (backlog #5). `nodes` (the physical
-- check-in registry) gains a `style` jsonb mirroring `qr_codes.style`, so a poster
-- / plaque code can carry the same beautiful design (colors, shapes, logo) as a
-- dynamic link. Nullable-by-default '{}' → existing nodes render with the plain
-- default until styled. ADDITIVE. Regenerate types after.

alter table public.nodes add column if not exists style jsonb not null default '{}'::jsonb;

comment on column public.nodes.style is
  'Visual QR design for this check-in code (lib/qr/style.ts). Parsed by parseStyle. See ADR-090.';
