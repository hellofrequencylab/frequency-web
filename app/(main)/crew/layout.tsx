import type { ReactNode } from 'react'
import { QuestTabs } from '@/components/crew/quest-tabs'

// The Quest area reads as one tabbed dashboard (build §10.1) — the shared sub-nav
// sits above every /crew page so the game's pieces (dashboard · quests · achievements
// · challenges · leaderboard · streaks · store) are one tap apart, not scattered.
export default function QuestLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="mx-auto w-full max-w-5xl px-4 pt-3 sm:px-6">
        <QuestTabs />
      </div>
      {children}
    </>
  )
}
