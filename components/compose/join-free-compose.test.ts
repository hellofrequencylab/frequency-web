import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// LIVE-409: remaining compose wrappers must not swap a signed-in member onto
// CrewGateButton. circle.create / practice.create are already granted to every
// signed-in profile (lib/core/capabilities.ts). The wrappers were dormant
// paywall wiring of the same class LIVE-266 removed from NewCircleCompose.
// Circle Join in the Circle layout is a membership act, not compose, and is
// not this suite.

const root = join(__dirname, '..', '..')
const FILES = [
  'components/channels/start-chapter-button.tsx',
  'components/studio/practice/new-practice-button.tsx',
  'components/circles/starter-claim.tsx',
  'components/circles/builder/remix-button.tsx',
  'components/compose/new-circle-compose.tsx',
] as const

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('LIVE-409: compose paths do not CrewGate a signed-in member', () => {
  it.each(FILES)('%s has no CrewGateButton in code', (rel) => {
    const src = stripComments(readFileSync(join(root, rel), 'utf8'))
    expect(src).not.toContain('CrewGateButton')
    expect(src).not.toContain('reason="create-circle"')
    expect(src).not.toContain("reason='create-circle'")
    expect(src).not.toContain('reason="create-practice"')
  })

  it('Starter Claim and Remix still name the verb Remix (NAMING.md)', () => {
    const claim = readFileSync(join(root, 'components/circles/starter-claim.tsx'), 'utf8')
    const remix = readFileSync(join(root, 'components/circles/builder/remix-button.tsx'), 'utf8')
    expect(claim).toContain("'Remix'")
    expect(remix).toContain("'Remix'")
    expect(claim).toContain('Claim this circle, or make it your own.')
    expect(remix).toContain('Claim this circle, or make it your own.')
  })

  it('a Chapter is still a Circle: Start a Chapter still calls startChapterAction', () => {
    const src = readFileSync(join(root, 'components/channels/start-chapter-button.tsx'), 'utf8')
    expect(src).toContain('startChapterAction')
    expect(src).toContain('Start a Chapter')
  })

  it('upgrade copy no longer sells compose as a Crew door', () => {
    const code = stripComments(readFileSync(join(root, 'components/crew/upgrade-lightbox.tsx'), 'utf8'))
    expect(code).not.toMatch(/['"]create-circle['"]\s*:/)
    expect(code).not.toMatch(/['"]create-practice['"]\s*:/)
    expect(code).not.toContain('Start a circle with Crew')
    expect(code).not.toContain('Share practices with Crew')
  })
})
