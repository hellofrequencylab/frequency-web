-- Track whether lifecycle notification emails/notifications have been sent per membership
ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS lifecycle_day1_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lifecycle_day3_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lifecycle_day7_sent boolean NOT NULL DEFAULT false;
