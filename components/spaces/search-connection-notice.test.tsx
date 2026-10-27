import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SearchConnectionNotice } from './search-connection-notice'
describe('fixed search callback notices', () => {
  it.each(['provider_invalid_scope', 'missing_state', 'malformed_state', 'rejected_state', 'token_exchange_failed', 'property_scope_changed', 'provider_property_unverified', 'provider_auth_failed', 'property_provider_unavailable', 'property_provider_invalid_response', 'property_provider_rate_limited'])('renders a useful safe notice for %s', outcome => {
    const html = renderToStaticMarkup(<SearchConnectionNotice outcome={outcome} />)
    expect(html).toContain('role="status"')
    expect(html).toContain('No credentials were saved.')
    expect(html).toMatch(/connection|provider/)
    expect(html).not.toContain(outcome)
  })
  it('does not claim credentials were unsaved when a storage CAS/postcondition fails', () => {
    const html = renderToStaticMarkup(<SearchConnectionNotice outcome="storage_failed" />)
    expect(html).toContain('could not be saved')
    expect(html).toContain('did not complete')
    expect(html).not.toContain('No credentials were saved')
  })
  it.each([undefined, null, ['missing_state'], 'private-code', '<script>private-token</script>', 'constructor', '__proto__', 'toString'])('does not render arbitrary query input %s', outcome => {
    expect(renderToStaticMarkup(<SearchConnectionNotice outcome={outcome} />)).toBe('')
  })
})
