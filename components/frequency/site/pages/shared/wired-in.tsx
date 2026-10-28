// WHAT IS WIRED IN: the one list of tools a Theme Kit carries, rendered the same way on /system and on every
// kit page, so the promise is identical everywhere (LIVE-1562). Seeded from THEME_TOOLS in lib/themes/library.ts,
// which is PURE data; this component adds only the kit card markup (tg-row, tg-card). Server component.
import { THEME_TOOLS } from '@/lib/themes/library'

export function WiredIn({ columns = 'two' }: { columns?: 'two' | 'three' }) {
  return (
    <div className={`tg-row ${columns}`} data-wired-in>
      {THEME_TOOLS.map((t) => (
        <div className="tg-card" key={t.name}>
          <h3>{t.name}</h3>
          <p>{t.body}</p>
        </div>
      ))}
    </div>
  )
}
