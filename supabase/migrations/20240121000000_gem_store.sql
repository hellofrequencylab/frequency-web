-- =============================================================================
-- Migration: Gem Store — redeemable rewards, profile cosmetics
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Store item categories
-- ---------------------------------------------------------------------------

CREATE TYPE store_category AS ENUM (
  'cosmetic', 'membership', 'feature', 'title', 'collectible'
);

-- ---------------------------------------------------------------------------
-- 2. Store items catalogue
-- ---------------------------------------------------------------------------

CREATE TABLE store_items (
  id           uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text           UNIQUE NOT NULL,
  name         text           NOT NULL,
  description  text           NOT NULL,
  category     store_category NOT NULL,
  gem_cost     integer        NOT NULL,
  icon         text           NOT NULL DEFAULT 'gift',
  preview      text,
  metadata     jsonb          NOT NULL DEFAULT '{}',
  stock        integer,
  is_active    boolean        NOT NULL DEFAULT true,
  sort_order   integer        NOT NULL DEFAULT 0,
  created_at   timestamptz    NOT NULL DEFAULT now()
);

CREATE INDEX idx_store_items_category ON store_items (category);
CREATE INDEX idx_store_items_active   ON store_items (is_active);

-- ---------------------------------------------------------------------------
-- 3. Redemptions / purchases
-- ---------------------------------------------------------------------------

CREATE TABLE store_redemptions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   uuid        NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  item_id      uuid        NOT NULL REFERENCES store_items (id) ON DELETE CASCADE,
  gems_spent   integer     NOT NULL,
  metadata     jsonb       DEFAULT '{}',
  redeemed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_store_redemptions_profile ON store_redemptions (profile_id);
CREATE INDEX idx_store_redemptions_item    ON store_redemptions (item_id);

-- ---------------------------------------------------------------------------
-- 4. Profile cosmetic fields
-- ---------------------------------------------------------------------------

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS profile_border  text,
  ADD COLUMN IF NOT EXISTS profile_flair   text,
  ADD COLUMN IF NOT EXISTS custom_title    text,
  ADD COLUMN IF NOT EXISTS profile_theme   text DEFAULT 'default';

-- ---------------------------------------------------------------------------
-- 5. RLS policies
-- ---------------------------------------------------------------------------

ALTER TABLE store_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_items: public read"
  ON store_items FOR SELECT USING (true);

CREATE POLICY "store_items: host+ write"
  ON store_items FOR INSERT
  WITH CHECK (get_my_role() >= 'host');

CREATE POLICY "store_items: host+ update"
  ON store_items FOR UPDATE
  USING (get_my_role() >= 'host');

CREATE POLICY "store_redemptions: read own or host reads all"
  ON store_redemptions FOR SELECT
  USING (
    profile_id = get_my_profile_id()
    OR get_my_role() >= 'host'
  );

CREATE POLICY "store_redemptions: self insert"
  ON store_redemptions FOR INSERT
  WITH CHECK (profile_id = get_my_profile_id());

-- ---------------------------------------------------------------------------
-- 6. Trigger: decrement gems on redemption
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION after_store_redemption()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET lifetime_gems = GREATEST(0, lifetime_gems - NEW.gems_spent)
  WHERE id = NEW.profile_id;

  -- Decrement stock if limited
  UPDATE store_items
  SET stock = GREATEST(0, stock - 1)
  WHERE id = NEW.item_id AND stock IS NOT NULL;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_after_store_redemption
  AFTER INSERT ON store_redemptions
  FOR EACH ROW
  EXECUTE FUNCTION after_store_redemption();

-- ---------------------------------------------------------------------------
-- 7. Seed store items
-- ---------------------------------------------------------------------------

INSERT INTO store_items (slug, name, description, category, gem_cost, icon, metadata, sort_order) VALUES
  -- Cosmetics: Profile borders
  ('border-indigo',     'Indigo Aura',        'A glowing indigo border around your avatar',            'cosmetic', 250,   'circle',    '{"type":"border","value":"ring-indigo-500"}',           10),
  ('border-amber',      'Golden Ring',        'A warm golden border for your profile',                 'cosmetic', 250,   'circle',    '{"type":"border","value":"ring-amber-500"}',            20),
  ('border-emerald',    'Emerald Crown',      'A vibrant emerald border that shows your dedication',   'cosmetic', 500,   'circle',    '{"type":"border","value":"ring-emerald-500"}',          30),
  ('border-violet',     'Violet Flame',       'A rare violet border for distinguished members',        'cosmetic', 1000,  'circle',    '{"type":"border","value":"ring-violet-500"}',           40),
  ('border-gradient',   'Prismatic',          'A shifting gradient border — the rarest cosmetic',      'cosmetic', 2500,  'sparkles',  '{"type":"border","value":"ring-gradient"}',             50),

  -- Cosmetics: Profile flair
  ('flair-fire',        'Fire Flair',         'A flame icon next to your name in posts',               'cosmetic', 150,   'flame',     '{"type":"flair","value":"flame"}',                      60),
  ('flair-star',        'Star Flair',         'A star icon next to your name',                         'cosmetic', 150,   'star',      '{"type":"flair","value":"star"}',                       70),
  ('flair-gem',         'Gem Flair',          'A gem icon — show off your community status',           'cosmetic', 300,   'gem',       '{"type":"flair","value":"gem"}',                        80),
  ('flair-crown',       'Crown Flair',        'A crown icon for true community royalty',               'cosmetic', 750,   'crown',     '{"type":"flair","value":"crown"}',                      90),
  ('flair-lightning',   'Lightning Flair',    'A lightning bolt for the most active contributors',     'cosmetic', 500,   'zap',       '{"type":"flair","value":"zap"}',                        100),

  -- Custom titles
  ('title-trailblazer', 'Trailblazer Title',  'Display "Trailblazer" as your custom title',            'title',    500,   'badge',     '{"type":"title","value":"Trailblazer"}',                110),
  ('title-og',          'OG Title',           'Display "OG" — reserved for early believers',           'title',    750,   'badge',     '{"type":"title","value":"OG"}',                         120),
  ('title-legend',      'Legend Title',       'Display "Legend" — earned through dedication',          'title',    2000,  'badge',     '{"type":"title","value":"Legend"}',                      130),
  ('title-architect',   'Architect Title',    'Display "Architect" — community builder extraordinaire','title',    1500,  'badge',     '{"type":"title","value":"Architect"}',                   140),

  -- Membership credits
  ('membership-1mo',    '1 Month Membership', 'Redeem for one month of free Frequency membership',     'membership', 5000,  'credit-card', '{"type":"membership","months":1}',                  200),
  ('membership-3mo',    '3 Month Membership', 'Redeem for three months of free membership',            'membership', 12000, 'credit-card', '{"type":"membership","months":3}',                  210),

  -- Collectibles
  ('badge-pioneer',     'Pioneer Badge',      'A special collectible badge for gem store pioneers',    'collectible', 100, 'award',     '{"type":"collectible","badge":"pioneer"}',              300),
  ('badge-patron',      'Patron Badge',       'Show your support — a badge for generous redeemers',    'collectible', 500, 'heart',     '{"type":"collectible","badge":"patron"}',               310),
  ('badge-benefactor',  'Benefactor Badge',   'The ultimate badge of community investment',            'collectible', 2000,'gem',       '{"type":"collectible","badge":"benefactor"}',            320)
ON CONFLICT (slug) DO NOTHING;
