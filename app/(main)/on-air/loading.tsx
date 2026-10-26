import { MindlessLoading } from '@/components/frequency/members/mindless/mindless-loading'

// Route-level loading UI for On Air / Mindless (PAGE-FRAMEWORK §5). The route is
// a no-rail Focus surface (page-chrome 'none'); this paints the centered, narrow
// FocusTemplate shape (eyebrow + title + description over a body card) while the
// member's adopted practices and remembered setup load, so the surface holds its
// place instead of flashing blank before the session mounts (no layout shift).
export default function OnAirLoading() {
  return <MindlessLoading />
}
