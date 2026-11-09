'use client'

// THE PROFILE FRAME (BLD-215). The canvas for the profile surface: the page as the Space page inside Frequency shows it,
// in the member shell's column, wearing the Space's own font set and accent and no site theme (the theme fence). The
// frame around it is the builder's, in the Frequency design system; the page inside wears profileFrame()'s variables.

import type { ReactNode } from 'react'
import styles from './profile-frame.module.css'

export function ProfileFrame({ brandName, children }: { brandName: string; children: ReactNode }) {
  return (
    <div className={styles.root} data-lens="profile" data-kit="members">
      <div className={styles.bar} aria-hidden>
        <span className={styles.mark} />
        <span className={styles.crumb}>Spaces · <b>{brandName}</b></span>
        <span className={styles.tabs}><span className={styles.tabOn}>Page</span><span>What&apos;s Happening</span><span>Circles</span><span>About</span></span>
      </div>
      <div className={styles.column}>{children}</div>
    </div>
  )
}
