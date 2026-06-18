-- Re-output every personal `connect` code in the STANDARD format (site request 2026-06-18).
--
-- Personal codes were minted with the legacy `sunset` preset (rounded modules + orange gradient).
-- The house standard is DEFAULT_STYLE (lib/qr/style.ts): connected modules, rounded eyes/pupils,
-- a round logo buffer. The member's profile pic is centered at RENDER time (withMemberAvatar), so
-- the stored logo here is just the Frequency-mark fallback for a member with no avatar — never a
-- baked, soon-stale avatar URL. Idempotent: re-running sets the same canonical object.
update public.qr_codes
set style = jsonb_build_object(
  'fg', '#0b0b0c',
  'bg', '#ffffff',
  'gradient', null,
  'moduleShape', 'connected',
  'eyeShape', 'rounded',
  'pupilShape', 'rounded',
  'eyeColor', null,
  'logo', '/icons/icon-512.png',
  'logoShape', 'circle',
  'logoTint', 'none',
  'frameLabel', null,
  'margin', 2
)
where purpose = 'connect';
