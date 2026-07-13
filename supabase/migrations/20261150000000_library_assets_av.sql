-- Airwaves P0 — widen The Loom to AUDIO + VIDEO (ADR-608, proposed).
--
-- The Loom (library_assets) is image/parametric-only today. Airwaves makes it the single upload
-- sink for audio + video too: every uploaded Recording file is a library_assets row (kind='audio'
-- | 'video') that a `recordings` row references by loom_asset_id, exactly as event photos land via
-- copyImageToLoom. This migration does TWO additive things and nothing else:
--   1. widen the library_assets_kind_check constraint with 'audio' + 'video' (same drop/re-add
--      shape as 20260925000000 + 20261010000001 — no existing kind dropped, no row touched);
--   2. add a dedicated `recordings-media` storage bucket for large A/V (audio/* + video/*), with a
--      ceiling well above the 20 MB image cap. Image behavior on `library-media` is byte-identical.
--
-- ADDITIVE + IDEMPOTENT, safe to re-run. WRITTEN, NOT APPLIED. RLS is unchanged: library_assets is
-- already service-role-only (RLS on, no policy; allowlisted in scripts/rls-deny-all.txt), and buckets
-- carry their own storage policies. See docs/MEDIA-PLATFORM-PLAN.md §5c, docs/PODCAST-AUDIO-STRATEGY.md §5.

-- 1. Widen the kind allowlist with the two A/V lanes. Re-add carries the FULL current set so the
--    constraint is self-contained (mirrors the two prior wideners).
alter table public.library_assets
  drop constraint if exists library_assets_kind_check;

alter table public.library_assets
  add constraint library_assets_kind_check
    check (kind in (
      -- existing kinds (unchanged, from 20260919000000 + 20260925000000 + 20261010000001)
      'image', 'icon', 'element', 'template', 'flow', 'theme', 'app_asset',
      'app', 'font', 'token', 'copy', 'sequence',
      -- Airwaves P0 (ADR-608, proposed): audio + video media atoms, referenced by recordings.loom_asset_id
      'audio', 'video'
    ));

comment on constraint library_assets_kind_check on public.library_assets is
  'Loom asset kinds. Original: image|icon|element|template|flow|theme|app_asset. '
  'Widened by 20260925000000 (app|font|token|copy), 20261010000001 (sequence), and '
  '20261150000000 (audio|video, Airwaves P0 / ADR-608). A/V rows carry storage_*/url like images and '
  'are referenced by recordings.loom_asset_id. See docs/MEDIA-PLATFORM-PLAN.md §5c.';

-- 2. The A/V storage bucket. Public like library-media, so a stored file is CDN-served; writes go
--    through the operator-gated server actions (copyRecordingToLoom / the widened uploaders). Ceiling
--    is 500 MB per file (well above the 20 MB image cap) so a full-length MP3 or MP4 fits. The mime
--    allowlist stays tight (enumerated audio/video containers) per the strategy doc's guardrail.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recordings-media',
  'recordings-media',
  true,
  524288000, -- 500 MB
  array[
    'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/opus',
    'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/flac', 'audio/x-m4a',
    'video/mp4', 'video/quicktime', 'video/webm', 'video/ogg', 'video/x-m4v'
  ]
)
on conflict (id) do nothing;

-- ROLLBACK (manual):
--   delete from storage.buckets where id = 'recordings-media';
--   alter table public.library_assets drop constraint if exists library_assets_kind_check;
--   alter table public.library_assets add constraint library_assets_kind_check
--     check (kind in ('image','icon','element','template','flow','theme','app_asset','app','font','token','copy','sequence'));
