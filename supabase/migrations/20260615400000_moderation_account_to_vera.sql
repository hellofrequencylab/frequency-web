-- Repurpose the system @moderation account as Vera's profile — the AI companion's
-- posting identity. Vera now is the sender of the moderation warnings and the
-- newcomer welcomes that the system account already authored. Code looks the account
-- up by `is_system` (not the handle), so this rename is fully decoupled. Janitors
-- manage Vera via /admin/vera (voice/responses) and the janitor-only profile module
-- (display name, handle, bio).
update public.profiles
set handle = 'vera',
    display_name = 'Vera',
    bio = coalesce(nullif(btrim(bio), ''), 'Your companion here at Frequency. Ask me anything, or find your way.')
where is_system = true and handle = 'moderation';
