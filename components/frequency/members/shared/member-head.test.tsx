import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemberHead } from './member-head'

describe('MemberHead', () => {
  it('draws the kit head: kicker, title, meta, then the actions', () => {
    const html = renderToStaticMarkup(
      <MemberHead kicker="Community" title={<>Your <span className="serif">Circles.</span></>} meta="The groups you keep." actions={<a className="btn">Go</a>} />,
    )
    expect(html).toBe(
      '<div class="head"><div><span class="k">Community</span><h1 class="h1">Your <span class="serif">Circles.</span></h1><span class="meta">The groups you keep.</span></div><a class="btn">Go</a></div>',
    )
  })

  it('skips an empty meta and takes h2 for a section inside a page', () => {
    const html = renderToStaticMarkup(<MemberHead kicker="You" title="Settings" meta="" as="h2" />)
    expect(html).toBe('<div class="head"><div><span class="k">You</span><h2 class="h1">Settings</h2></div></div>')
  })
})
