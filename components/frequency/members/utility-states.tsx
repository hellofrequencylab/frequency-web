import { MembersBody } from '@/components/frequency/members/shared/members-body'

// THE WAIT FOR THE MEMBER UTILITY SCREENS, IN THE KIT (Settings, My orders, Your codes). Under the
// Frequency design these routes' loading.tsx drew DAWN skeletons (a bordered card list under a rule)
// that then reflowed into the kit's `.head` and panels. This paints the page's own head with its real
// title at once, then the kit's pending rows (`.list` of `.mc-bar`s, the shape SettingsBody already
// uses for its own Suspense fallbacks). Server Components with no reads.

function Rows({ rows }: { rows: number }) {
  return (
    <div className="list" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i}>
          <span className="ic" />
          <span className="grow stack mc-gap-6">
            <span className="mc-bar" />
            <span className="mc-bar short" />
          </span>
        </div>
      ))}
    </div>
  )
}

function Head({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="head">
      <div>
        <span className="k">{kicker}</span>
        <h1 className="h1">{title}</h1>
      </div>
    </div>
  )
}

/** A utility page on a cold open: its head, then a panel of pending rows. */
export function FqUtilityLoading({
  kicker = 'You',
  title,
  label,
  rows = 4,
}: {
  kicker?: string
  title: string
  label: string
  rows?: number
}) {
  return (
    <MembersBody>
      <div aria-busy="true">
        <span className="sr-only" role="status">
          {label}
        </span>
        <Head kicker={kicker} title={title} />
        <div className="panel stack">
          <Rows rows={rows} />
        </div>
      </div>
    </MembersBody>
  )
}

const SETTINGS_PANES = [
  'Account',
  'Notifications',
  'Privacy',
  'Location',
  'Feed',
  'Membership',
  'Appearance',
  'Install the app',
] as const

/** Settings on a cold open: the head, the side list of panes (not yet pressable) and the first pane. */
export function FqSettingsLoading() {
  return (
    <MembersBody>
      <div aria-busy="true">
        <span className="sr-only" role="status">
          Loading Settings
        </span>
        <Head kicker="You" title="Settings" />
        <div className="ap-cols l">
          <aside className="side" aria-hidden="true">
            <div className="stack sel mc-gap-2">
              {SETTINGS_PANES.map((label, i) => (
                <span key={label} className={i === 0 ? 'mc-navbtn mu-sk-nav on' : 'mc-navbtn mu-sk-nav'}>
                  {label}
                </span>
              ))}
            </div>
          </aside>
          <div className="panel stack mc-pane">
            <Rows rows={4} />
          </div>
        </div>
      </div>
    </MembersBody>
  )
}
