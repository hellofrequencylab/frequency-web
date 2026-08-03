import React from 'react'

// The Quest season ranks are COMPLETION-based: how many of the season's three
// Journeys you have finished. Ghost (0) → Initiate (1) → Adept (2) → Master (3).
// Ghost is a real status, not a guilt trip, so it gets a real badge in stone.
// Any spectrum color name is also accepted, for Pillar dots and Space accents.
const RANK_COLOR = {
  ghost: 'stone', initiate: 'clay', adept: 'gold', master: 'jade',
  stone: 'stone', clay: 'clay', gold: 'gold', olive: 'olive', jade: 'jade',
  teal: 'teal', slate: 'slate', indigo: 'indigo', plum: 'plum', rose: 'rose',
}

// Journeys finished, for the optional progress read.
const RANK_STEP = { ghost: 0, initiate: 1, adept: 2, master: 3 }

/**
 * RankBadge — the in-app season-rank pill (The Quest). Drives the `.rank-badge`
 * primitive off the three rank CSS vars (core / deep / bright) so it reads
 * correctly in light and dark. Pass a season rank or any spectrum color.
 */
export function RankBadge({ rank = 'adept', showStep = false, children, className = '', style }) {
  const key = String(rank).toLowerCase()
  const c = RANK_COLOR[key] || 'gold'
  const label = children ?? String(rank).charAt(0).toUpperCase() + String(rank).slice(1)
  const step = RANK_STEP[key]
  return (
    <span
      className={`rank-badge ${className}`}
      style={{
        '--rank': `var(--rank-${c})`,
        '--rank-deep': `var(--rank-${c}-deep)`,
        '--rank-bright': `var(--rank-${c}-bright)`,
        ...style,
      }}
    >
      <span className="rank-dot" />
      {label}
      {showStep && step !== undefined ? (
        <span style={{ opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>{step}/3</span>
      ) : null}
    </span>
  )
}
