import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SearchConnectionNotice } from './search-connection-notice'
describe('fixed search callback notices', () => {
  it.each(['provider_invalid_scope', 'missing_state', 'malformed_state', 'rejected_state'])('renders a useful safe notice for %s', outcome => {
    const html = renderToStaticMarkup(<SearchConnectionNotice outcome={outcome} />)
    expect(html).toContain('role="status"')
    expect(html).toContain('No credentials were saved.')
    expect(html).toContain('start a new connection')
    expect(html).not.toContain(outcome)
  })
  it.each([undefined, null, ['missing_state'], 'private-code', '<script>private-token</script>', 'constructor', '__proto__', 'toString'])('does not render arbitrary query input %s', outcome => {
    expect(renderToStaticMarkup(<SearchConnectionNotice outcome={outcome} />)).toBe('')
  })
})
