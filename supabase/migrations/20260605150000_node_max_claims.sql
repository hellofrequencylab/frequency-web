-- Scarcity / capacity codes: cap how many times a check-in code can be claimed in
-- total ("first N scans win"). Nullable — null = unlimited (today's behavior). The
-- verify pipeline counts verified captures and rejects once the cap is hit. ADDITIVE.

alter table public.nodes add column if not exists max_claims integer;

comment on column public.nodes.max_claims is 'Total verified-claim cap ("first N win"); null = unlimited. Enforced in verifyCapture (ADR-109).';
