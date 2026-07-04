import { getCurrentSeason } from '@/lib/seasons'
import { SeasonControl } from '@/app/(main)/admin/gamification/season-control'
import { getJanitor } from '@/lib/page-editor/guard'

// Gamification layout module (LP7): "Season control" — the current season card, with the
// janitor-only "End season & start next" affordance. Self-fetching RSC; the page owns the host +
// community-staff gate, so this never re-gates. The End-season control is gated on the web_role
// janitor axis (getJanitor), which is the SAME axis the endSeasonAction enforces — so the UI
// affordance and the action gate agree. Always renders (the card shows for every operator).
export async function GamificationSeason() {
  const season = await getCurrentSeason()
  const isJanitor = !!(await getJanitor())
  return <SeasonControl season={season} isJanitor={isJanitor} />
}
