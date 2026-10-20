import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FrequencyCircleInvite, FrequencyFunnelSplash } from './frequency-join-slug'

describe('/join/[slug] on the Frequency design (SCAN-852)', () => {
  it('draws the funnel splash with the start link on both buttons and an accented statement', () => {
    const html = renderToStaticMarkup(
      <FrequencyFunnelSplash
        splash={{ image: '/x.jpg', eyebrow: 'Breathwork', headline: 'Breathe', body: 'Body', cta: 'Try a round', statement: 'Take one *breath* with us.' }}
        start="/join?seq=breathwork"
      />,
    )
    expect(html.match(/href="\/join\?seq=breathwork"/g)).toHaveLength(2)
    expect(html).toContain('<em>breath</em>')
    expect(html).toContain('Try a round')
  })

  it('draws the invite with its member count, spots left and the action it is given', () => {
    const html = renderToStaticMarkup(
      <FrequencyCircleInvite
        circle={{ name: 'Dawn Run', about: 'Mornings', type: 'public', memberCount: 1, hubName: 'North County' }}
        spotsLeft={3}
        action={<a href="/sign-in">Sign in to join</a>}
      />,
    )
    expect(html).toContain('public circle · North County')
    expect(html).toContain('1 member ·')
    expect(html).toContain('3 spots left')
    expect(html).toContain('Sign in to join')
  })
})
