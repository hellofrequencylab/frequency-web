// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// LIVE-1103 (LIVE-938 area 4, Vault). The Vault draws its Trophy case in the members kit instead of nesting DAWN's
// bordered card, which only fit because members-ui.css repainted it.
vi.mock('@/lib/theme/design', async (orig) => ({ ...(await orig<object>()), SITE_DESIGN: 'frequency' }))

describe('Vault Trophy case (LIVE-1103)', () => {
  it('the Vault body mounts the kit case, not the DAWN one', () => {
    const src = readFileSync('components/frequency/members/vault/vault-body.tsx', 'utf8')
    expect(src).toContain("import { FqTrophyCase } from './trophy-case'")
    expect(src).not.toContain('components/quest/trophy-case')
  })

  it('draws seasons, the stamped summary and tiles in kit pieces', async () => {
    const { FqTrophyCase } = await import('./trophy-case')
    const html = renderToStaticMarkup(
      <FqTrophyCase
        currentSeason={2}
        totalTrophies={1}
        seasons={[
          {
            season: 1,
            name: 'Shed',
            summary: { season: 1, finalRank: 'initiate', finalZaps: 340, gemsConverted: 12, challengesCompleted: 3 },
            trophies: [
              { id: 't1', title: 'Breathwork 101', slug: 'breathwork-101', emoji: null, pillar: 'Body', rankEarned: 'initiate', completedAt: '2026-09-01T00:00:00Z' },
            ],
          },
        ] as never}
      />,
    )
    expect(html).toContain('Season 1 · Shed')
    expect(html).toContain('class="card row mc-gap-12"')
    expect(html).toContain('href="/journeys/breathwork-101"')
    expect(html).toContain('340 Season Zaps')
    expect(html).not.toContain('rounded-card')
  })
})
