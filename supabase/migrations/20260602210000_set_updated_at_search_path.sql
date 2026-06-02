-- set_updated_at search_path hardening.
--
-- From the 2026-06-02 maintenance sweep (docs/maintenance/2026-06-02.md), applied to
-- prod 2026-06-02. The function body is only `NEW.updated_at = now()` (now() lives in
-- pg_catalog, always on the path), so pinning search_path to '' is safe and clears the
-- `function_search_path_mutable` advisor finding without affecting any trigger.

ALTER FUNCTION public.set_updated_at() SET search_path = '';
