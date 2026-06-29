-- H0 baseline safe repair — pin the last function with a mutable search_path.
--
-- The advisor sweep (H0-1, 2026-06-29) flagged exactly one remaining
-- function_search_path_mutable: public.practices_touch_updated_at() (the
-- practices updated_at touch trigger), missed by the earlier
-- set_updated_at_search_path / pin_function_search_paths sweeps. Pinning it to
-- the empty search_path matches the house convention for touch triggers
-- (set_updated_at() uses ''). Pure security hygiene, zero behaviour change.

alter function public.practices_touch_updated_at() set search_path = '';
