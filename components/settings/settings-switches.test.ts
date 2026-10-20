import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// LIVE-1101 (LIVE-938 area 4, Settings). The Settings forms draw the shared Switch, which renders the kit's
// `.sw` under Frequency and DAWN's track under DAWN, instead of a hand-built `role="switch"` whose `bg-primary`
// only read right under Frequency because members-ui.css repainted it.
const FILES = [
  './resonance-matching-toggle.tsx',
  './live-location-toggle.tsx',
  './match-prefs-form.tsx',
  './consent-scopes-form.tsx',
]

describe('Settings switches (LIVE-1101)', () => {
  it.each(FILES)('%s uses the shared Switch', (f) => {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8')
    expect(src).toContain("import { Switch } from '@/components/ui/switch'")
    expect(src).toContain('<Switch ')
    expect(src).not.toContain('role="switch"')
  })
})

describe('Notification switches (LIVE-1101)', () => {
  // The grid keeps its hand-built buttons (lib/notifications/wired.test.ts reads their source); under Frequency they
  // wear the kit's `.sw` class instead of DAWN's `bg-primary` track.
  it('both notification switches draw the kit switch under Frequency', () => {
    const src = readFileSync('app/(main)/settings/notifications/form.tsx', 'utf8')
    expect(src).toContain("const FQ = SITE_DESIGN === 'frequency'")
    expect(src.match(/className=\{FQ \? \([^)]*'sw on' : 'sw'\)/g)?.length).toBe(2)
  })
})
