-- Focal point for the operator page-header hero image (image focal-point picker).
--
-- page_settings.header_image_url holds the wide header/banner an operator sets in the page's
-- Basics panel. Cropped surfaces render that image with object-cover, which crops to CENTER by
-- default, so a face or horizon can get cut off. This adds a companion column storing WHERE the
-- image should sit in the cropped frame, as a CSS object-position string ("x% y%", e.g. "50% 30%").
--
-- Additive + nullable, so reads are harmless before AND after it applies: an unset value means the
-- centered crop that renders today (fully backward compatible). Only a deliberately-moved focal
-- point is ever stored (the save path normalizes the centered default back to NULL).
--
-- NOTE: the event cover focal point does NOT need a column — it rides the existing events.theme
-- jsonb under `coverFocus`. This column exists only because page_settings has no free-form jsonb
-- bag for the header image (its `layout` jsonb is a structured layout config, not a property bag).
ALTER TABLE public.page_settings
  ADD COLUMN IF NOT EXISTS header_image_focal text;

COMMENT ON COLUMN public.page_settings.header_image_focal IS
  'Focal point for header_image_url as a CSS object-position string ("x% y%"). NULL = centered crop (default). Operator-set in the page Basics panel via the image focal-point picker.';
