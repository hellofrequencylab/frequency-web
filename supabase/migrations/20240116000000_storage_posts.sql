-- Create public posts bucket for post images.
-- Files are stored at {auth_user_id}/{timestamp}-{filename}
-- Bucket is public so image links work without auth.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'posts',
  'posts',
  true,
  5242880,  -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Drop any previously applied versions of these policies before recreating
DROP POLICY IF EXISTS "posts: public read"        ON storage.objects;
DROP POLICY IF EXISTS "posts: owner insert"       ON storage.objects;
DROP POLICY IF EXISTS "posts: owner update"       ON storage.objects;
DROP POLICY IF EXISTS "posts: owner delete"       ON storage.objects;

-- Public read (needed for <img src="...public-url..."> to work)
CREATE POLICY "posts: public read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'posts');

-- Authenticated users can upload their own post images.
CREATE POLICY "posts: owner insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'posts'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

CREATE POLICY "posts: owner update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'posts' AND split_part(name, '/', 1) = auth.uid()::text)
  WITH CHECK (bucket_id = 'posts' AND split_part(name, '/', 1) = auth.uid()::text);

CREATE POLICY "posts: owner delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'posts' AND split_part(name, '/', 1) = auth.uid()::text);
