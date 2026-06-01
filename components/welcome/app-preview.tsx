// A calm, non-interactive mock of the app shell. It sits behind the conversation
// and is revealed from the interior out as the funnel progresses — the world
// assembling itself around the new member. Prototype stand-in for the real /feed.

import { Home, Users, Compass, Calendar, Sparkles, Store, Zap, Flame, Gem } from 'lucide-react'

const NAV = [
  { icon: Home, label: 'Feed' },
  { icon: Users, label: 'Circles' },
  { icon: Sparkles, label: 'Interests' },
  { icon: Calendar, label: 'Events' },
  { icon: Compass, label: 'Practices' },
  { icon: Store, label: 'Partners' },
]

const POSTS = [
  { who: 'North Park Run Club', when: '2h', body: 'Sunrise 5k tomorrow — 12 of us going. Pancakes after, obviously.' },
  { who: 'La Jolla Cove Swim', when: '5h', body: 'Water was a perfect 64° this morning. Who’s in this weekend?' },
  { who: 'Montrose Makers', when: '1d', body: 'New ceramics night added. Three spots left — drop a 🌀 to grab one.' },
]

export function AppPreview() {
  return (
    <div aria-hidden className="flex h-full w-full select-none bg-canvas text-text">
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col gap-1 border-r border-border bg-surface px-4 py-6 lg:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="h-7 w-7 rounded-lg bg-primary" />
          <span className="font-display text-lg uppercase tracking-tight">Frequency</span>
        </div>
        {NAV.map(({ icon: Icon, label }, i) => (
          <div
            key={label}
            className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium ${
              i === 0 ? 'bg-primary-bg text-primary-strong' : 'text-muted'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </div>
        ))}
      </aside>

      {/* Main column */}
      <main className="flex-1 overflow-hidden px-6 py-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-bold">Your feed</h2>
          <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface px-4 py-2 shadow-sm">
            <span className="flex items-center gap-1 text-sm font-bold"><Zap className="h-4 w-4 fill-current text-primary" />0</span>
            <span className="flex items-center gap-1 text-sm font-bold"><Gem className="h-4 w-4 text-primary" />0</span>
            <span className="flex items-center gap-1 text-sm font-bold"><Flame className="h-4 w-4 text-primary" />0w</span>
          </div>
        </div>
        <div className="space-y-3">
          {POSTS.map((p) => (
            <div key={p.who} className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <div className="mb-2 flex items-center gap-2">
                <div className="h-9 w-9 rounded-full bg-primary-bg" />
                <div>
                  <div className="text-sm font-semibold">{p.who}</div>
                  <div className="text-xs text-subtle">{p.when} ago</div>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-muted">{p.body}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
