import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// LIVE-1100 (LIVE-938 area 6). Under Frequency the push save-failed note leaves the bottom-left corner, where
// it sat on the You dock and the phone tab bar, for the kit toast's bottom-centre spot; and Start a Circle
// wears the kit's plus, like New event, instead of DAWN's sparkle.
vi.mock('@/lib/theme/design', async (orig) => ({ ...(await orig<object>()), SITE_DESIGN: 'frequency' }))

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')

describe('Frequency area 6 (LIVE-1100)', () => {
  it('moves the push note to bottom centre, clear of the docks', () => {
    expect(read('./registration.tsx')).toContain('className="fq-push-note fixed')
    const css = read('../../app/themes/frequency/members-shell.css')
    expect(css).toMatch(/\.fq-push-note\{left:50%;right:auto;bottom:calc\(76px \+ var\(--fq-foot-lift, 0px\)\)/)
  })

  it('draws the kit plus on Start a Circle', async () => {
    const { NewCircleCompose } = await import('@/components/compose/new-circle-compose')
    const html = renderToStaticMarkup(<NewCircleCompose buttonLabel="Start a Circle" buttonClass="btn pa sm" />)
    expect(html).not.toContain('lucide-sparkles')
    expect(html).toContain('Start a Circle')
    expect(html).toMatch(/<svg/)
  })
})
