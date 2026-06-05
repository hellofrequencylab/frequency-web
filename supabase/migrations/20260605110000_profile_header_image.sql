-- Editable profile header / cover image. The profile page already renders a cover
-- band (a gradient + static hero); this lets a member set their own banner from
-- Settings → Profile (uploaded to the public `avatars` bucket, like the avatar).
alter table public.profiles add column if not exists header_image_url text;

comment on column public.profiles.header_image_url is
  'Member-set profile cover/banner image (public URL in the avatars bucket). Null → the default gradient cover.';
