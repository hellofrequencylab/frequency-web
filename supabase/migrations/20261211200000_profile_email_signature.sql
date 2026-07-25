-- Per-sender email signature for outbound conversation replies. NULL = use the auto-generated default
-- ("<display name> · frequencylocal.com"); a set value is the operator's edited, saved signature. Appended
-- to the EMAIL body only (the in-app chat thread keeps the clean message). Stored on the profile so it is
-- the sender's own, editable in Settings.

alter table public.profiles
  add column if not exists email_signature text;
