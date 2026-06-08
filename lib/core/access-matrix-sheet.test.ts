// Full-grid conformance test: the resolved access matrix must equal the owner's Roles &
// Permissions sheet (2026-06-08 CSV), cell for cell. Symbols: ⏱️/✋🏼 → 'limited', ✅ →
// 'full', 🚫 → 'none'. Two owner corrections to the literal sheet are encoded here:
//   • Insight/Vera: Host 'limited' but Guide/Mentor 'full' (seniors get the deeper view).
// If a code change drifts the matrix, this test names the exact surface × role that broke.

import { describe, it, expect } from 'vitest'
import { accessTo, type Surface, type MatrixColumn, type Hats, type AccessLevel } from './access-matrix'

const COLS: MatrixColumn[] = [
  'visitor', 'member', 'crew', 'host', 'guide', 'mentor',
  'collaborator', 'practitioner', 'business', 'organization', 'analyst', 'admin', 'janitor',
]

function hatsFor(col: MatrixColumn): Hats {
  if (col === 'visitor') return { loggedIn: false }
  if (col === 'member') return { loggedIn: true }
  if (col === 'crew') return { loggedIn: true, tier: 'crew' }
  if (col === 'host' || col === 'guide' || col === 'mentor' || col === 'admin' || col === 'janitor') {
    return { loggedIn: true, role: col }
  }
  if (col === 'analyst') return { loggedIn: true, staff: 'analyst' }
  return { loggedIn: true, personas: [col as 'collaborator' | 'practitioner' | 'business' | 'organization'] }
}

const _ = 'none' as const
const L = 'limited' as const
const F = 'full' as const

// surface → [visitor, member, crew, host, guide, mentor, collab, prac, biz, org, analyst, admin, janitor]
const SHEET: Record<Surface, AccessLevel[]> = {
  // Community
  feed: [L, F, F, F, F, F, F, F, F, F, F, F, F],
  broadcast: [L, F, F, F, F, F, F, F, F, F, F, F, F],
  circles: [L, F, F, F, F, F, F, F, F, F, F, F, F],
  channels: [L, F, F, F, F, F, F, F, F, F, F, F, F],
  events: [L, F, F, F, F, F, F, F, F, F, F, F, F],
  market: [L, F, F, F, F, F, F, F, F, F, F, F, F],
  messageBoards: [_, F, F, F, F, F, F, F, F, F, F, F, F],
  people: [_, F, F, F, F, F, F, F, F, F, F, F, F],
  // The Quest
  quest: [L, F, F, F, F, F, F, F, F, F, F, F, F],
  journeys: [L, F, F, F, F, F, F, F, F, F, F, F, F],
  practices: [L, F, F, F, F, F, F, F, F, F, F, F, F],
  library: [L, F, F, F, F, F, F, F, F, F, F, F, F],
  vault: [L, L, F, F, F, F, F, F, F, F, F, F, F],
  // Studio
  studioOverview: [L, L, F, F, F, F, F, F, F, F, F, F, F],
  support: [L, L, F, F, F, F, F, F, F, F, F, F, F],
  personalCrm: [_, L, F, F, F, F, F, F, F, F, F, F, F],
  businessCrm: [_, _, _, _, _, _, _, L, F, F, F, F, F],
  website: [_, _, _, _, _, _, _, L, F, F, _, F, F],
  hookNetwork: [_, _, _, _, _, _, _, _, L, F, _, F, F],
  growthStudio: [_, _, _, _, _, _, _, _, F, F, F, F, F],
  earnings: [_, _, _, _, _, _, F, F, F, F, _, F, F],
  qrStudio: [_, L, F, F, F, F, F, F, F, F, F, F, F],
  // Platform
  status: [F, F, F, F, F, F, F, F, F, F, F, F, F],
  insight: [_, _, _, L, F, F, F, L, F, F, F, F, F], // host limited, guide/mentor full (owner correction)
  veraAi: [_, _, _, L, F, F, _, L, F, F, F, F, F], // host limited, guide/mentor full
  platformManage: [_, _, _, _, _, _, _, _, _, _, _, F, F],
  financialDashboard: [_, _, _, _, _, _, _, _, _, _, _, _, F],
  settings: [F, F, F, F, F, F, F, F, F, F, F, F, F],
}

describe('access matrix conforms to the owner sheet (30 surfaces × 13 roles)', () => {
  for (const [surface, expected] of Object.entries(SHEET) as [Surface, AccessLevel[]][]) {
    it(`${surface}`, () => {
      const got = COLS.map((c) => accessTo(surface, hatsFor(c)))
      expect(got).toEqual(expected)
    })
  }
})
