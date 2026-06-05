-- UTM / source passthrough: trace a signup back to the specific code/poster that
-- brought them. Two additive columns:
--   • qr_codes.source_tag — an operator label for a code ("downtown-poster-a"); the
--     /q resolver stamps it into the anonymous first-touch cookie (ADR-095).
--   • profiles.acquisition — the decoded first-touch (utm/source/campaign/code/
--     channel/landing), persisted ONCE at signup so acquisition is queryable, not
--     just a cookie that expires.
-- Both nullable; existing rows unaffected. ADDITIVE.

alter table public.qr_codes  add column if not exists source_tag  text;
alter table public.profiles  add column if not exists acquisition jsonb;

comment on column public.qr_codes.source_tag is 'Operator campaign/source label stamped into first-touch on scan (ADR-107).';
comment on column public.profiles.acquisition is 'First-touch acquisition snapshot captured at signup (utm/source/code/channel). ADR-107.';
