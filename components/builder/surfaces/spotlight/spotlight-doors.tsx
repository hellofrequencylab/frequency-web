'use client'

// THE SPOTLIGHT DOORS (BLD-215). The canvas for the Spotlight surface: the page as its one-column link page, one door per
// role section (lib/builder/surface-view.ts spotlightDoors), under the identity header the live Spotlight draws (logo
// or initials, name). A door is the live page's Door pattern (components/spotlight/new-world-kit-layouts.tsx: tile,
// title, meta, arrow) in the builder's tokens; here it selects the section, on the live page it opens it.

import Image from 'next/image'
import { FqIcon } from '@/components/frequency/icon'
import type { SpotlightDoor } from '@/lib/builder/surface-view'
import styles from './spotlight-doors.module.css'

export function SpotlightDoors({ doors, brandName, logo, selectedId, onSelect }: { doors: SpotlightDoor[]; brandName: string; logo: string | null; selectedId: string | null; onSelect: (id: string) => void }) {
  const initials = brandName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
  return (
    <div className={styles.root} data-lens="spotlight">
      <header className={styles.head}>
        {logo ? <Image className={styles.logo} src={logo} alt="" width={72} height={72} unoptimized /> : <span className={styles.initials} aria-hidden>{initials || '·'}</span>}
        <h2 className={styles.name}>{brandName}</h2>
        <p className={styles.sub}>{doors.length === 1 ? 'One door' : `${doors.length} doors`}</p>
      </header>
      {doors.length === 0 ? (
        <p className={styles.empty}>No doors yet. Every section with a role becomes a door here; Update to new layouts gives an older section its role.</p>
      ) : (
        <ul className={styles.list} aria-label="Spotlight doors">
          {doors.map((d) => (
            <li key={d.id}>
              <button type="button" className={styles.door} aria-pressed={selectedId === d.id} onClick={() => onSelect(d.id)} title={d.href}>
                <span className={styles.tile}><FqIcon name={d.icon} size={18} /></span>
                <span className={styles.text}><b>{d.title}</b><small>{d.meta}</small></span>
                <span className={styles.arrow} aria-hidden>→</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
