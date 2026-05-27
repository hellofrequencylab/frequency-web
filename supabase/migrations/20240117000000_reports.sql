CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('post', 'dispatch', 'comment', 'member', 'event')),
  target_id UUID NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'harassment', 'inappropriate', 'misinformation', 'other')),
  details TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'actioned', 'dismissed')),
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_reports_target ON reports(target_type, target_id);

-- RLS
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can create a report
CREATE POLICY "Users can create reports"
ON reports FOR INSERT
TO authenticated
WITH CHECK (reporter_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));

-- Only host+ can view reports
CREATE POLICY "Admins can view reports"
ON reports FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE auth_user_id = auth.uid()
    AND community_role IN ('host', 'guide', 'mentor', 'janitor')
  )
);

-- Only host+ can update reports (review/action)
CREATE POLICY "Admins can update reports"
ON reports FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE auth_user_id = auth.uid()
    AND community_role IN ('host', 'guide', 'mentor', 'janitor')
  )
);
