import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SiteAccount } from './site-account'

// The Temple's "Your house" page: the first paint a cached, anonymous render draws (the island asks Frequency
// for the reader's own plan and gatherings after it is up), and the reserved slug that keeps editors off it.
describe('the Temple account page', () => {
  it('paints a quiet loading state with no member data in the cached HTML', () => {
    const html = renderToStaticMarkup(
      <SiteAccount membershipEndpoint="https://f.example/api/sites/royaltemple/membership" rsvpsEndpoint="https://f.example/api/sites/royaltemple/rsvps" signInHref="https://f.example/sign-in" plansHref="https://f.example/spaces/royaltemple/memberships" eventsHref="https://f.example/events" brandName="Royal Temple" />,
    )
    expect(html).toContain('Your house at Royal Temple')
    expect(html).toContain('data-state="loading"')
    expect(html).not.toContain('Welcome home')
    expect(html).not.toMatch(/—/)
  })
})
