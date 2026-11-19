// FIXTURE RENDER: the Journey completion moment, written to $RENDER_OUT/journey-trophy-<kind>.html.
// RENDER_KIND=journey draws the Journey finish with its certificate; the default is a finished week.
import { createElement } from 'react'
import { it, vi } from 'vitest'
import { writePage } from './journey-fixture'

vi.mock('@/components/ui/use-dialog-focus-trap', () => ({ useDialogFocusTrap() {} }))

it('renders the completion moment', async () => {
  const kind = process.env.RENDER_KIND === 'journey' ? 'journey' : 'phase'
  const { TrophyCelebration } = await import('@/components/journey/v2/trophy-celebration')
  const milestone =
    kind === 'journey'
      ? { kind, title: 'The Business of Community 101', gems: 50, certificate: true, unit: 'week', stats: ['12 steps', '4 weeks'], homeHref: '#' }
      : { kind, title: 'Week 2 · The Container', gems: 10, unit: 'week', next: 'Week 3 · The Gathering' }
  await writePage(`journey-trophy-${kind}`, createElement(TrophyCelebration, { milestone: milestone as never, onDismiss() {} }))
})
