-- Vera's profile foundation. Per owner: keep @moderation as the username, name her
-- Vera, and fill the profile out like a real member (a bio in her voice). Supersedes
-- 20260615400000 (which had set the handle to 'vera'). Code references the system
-- account by is_system, so the handle value is cosmetic and safe to set either way.
-- The vector avatar and the interactive persona (bulletins, comment replies, learning)
-- land in follow-up work.
update public.profiles
set handle = 'moderation',
    display_name = 'Vera',
    bio = 'The heart of this community. I came in from a hard road and chose to take care of people, so I help you find your way here: your circle, your practice, your people. Warm, present, a little dry. Say hi anytime.',
    is_active = true
where is_system = true;
