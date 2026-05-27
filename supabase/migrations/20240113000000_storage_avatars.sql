-- Create public avatars bucket for profile photos.
-- Files are stored at {auth_user_id}/avatar.jpg
-- Bucket is public so avatar_url links work without auth.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,  -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Drop any previously applied versions of these policies before recreating
DROP POLICY IF EXISTS "avatars: public read"        ON storage.objects;
DROP POLICY IF EXISTS "avatars: owner insert"       ON storage.objects;
DROP POLICY IF EXISTS "avatars: owner update"       ON storage.objects;
DROP POLICY IF EXISTS "avatars: owner delete"       ON storage.objects;

-- Public read (needed for <img src="...public-url..."> to work)
CREATE POLICY "avatars: public read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'avatars');

-- Authenticated users can upload/replace their own avatar.
-- Use split_part instead of storage.foldername for broader compatibility.
CREATE POLICY "avatars: owner insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

CREATE POLICY "avatars: owner update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'avatars' AND split_part(name, '/', 1) = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND split_part(name, '/', 1) = auth.uid()::text);

CREATE POLICY "avatars: owner delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'avatars' AND split_part(name, '/', 1) = auth.uid()::text);
