import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { sourceWithoutComments } from '@/test/source-shape'

// LIVE-628 (ADR-1601): deleting an account deletes the member's Stripe customer (ADR-1581), and a
// paid Space checkout reuses its owner's customer, so the delete cancels that Space's plan. The
// dialog names those Spaces BEFORE the confirm, says nothing when there are none, and still warns
// in general terms when the server could not read them.

vi.mock('./actions', () => ({ deleteAccountAction: vi.fn() }))

import { DeleteAccount } from './delete-account'

const html = (paidSpaces?: Parameters<typeof DeleteAccount>[0]['paidSpaces']) =>
  renderToStaticMarkup(<DeleteAccount paidSpaces={paidSpaces} />)
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&rsquo;|’/g, "'").replace(/\s+/g, ' ')

describe('the delete dialog warns about a paid Space plan before the confirm', () => {
  it('names the one Space and its plan, says the Space stays on Free, and sits above the confirm', () => {
    const h = html([{ name: 'Anchor Studio', plan: 'Business' }])
    const t = text(h)
    expect(h).toContain('data-paid-spaces-warning')
    expect(t).toContain('Your account pays for the Business plan on Anchor Studio.')
    expect(t).toContain('cancels it. The Space stays and goes back to Free.')
    expect(h.indexOf('data-paid-spaces-warning')).toBeLessThan(h.indexOf('Type DELETE to confirm'))
  })

  it('lists every Space when there are several', () => {
    const t = text(
      html([
        { name: 'Anchor Studio', plan: 'Business' },
        { name: 'Zinnia Hall', plan: 'Non Profit' },
      ]),
    )
    expect(t).toContain('This also ends paid Space plans')
    expect(t).toContain('Anchor Studio, Business plan')
    expect(t).toContain('Zinnia Hall, Non Profit plan')
    expect(t).toContain('Each Space stays and goes back to Free.')
  })

  it('shows no warning when no paid Space is billed to the member', () => {
    expect(html([])).not.toContain('data-paid-spaces-warning')
    expect(html()).not.toContain('data-paid-spaces-warning')
    expect(text(html([]))).not.toMatch(/Space plan/)
  })

  it('still warns, in general terms, when the read failed (null), rather than claiming there is nothing', () => {
    const t = text(html(null))
    expect(t).toContain("If your account pays for a Space's plan, deleting it cancels that plan too.")
  })

  it('carries no em dash in the member-facing copy', () => {
    for (const h of [html(null), html([{ name: 'A', plan: 'Business' }]), html([{ name: 'A', plan: 'Business' }, { name: 'B', plan: 'Business' }])]) {
      expect(h).not.toContain('—')
    }
  })
})

describe('the account section feeds the dialog from the server read', () => {
  const section = sourceWithoutComments('app/(main)/settings/account/section.tsx', { imports: false })
  it('reads paidSpacesEndedByDelete on the server and passes it to DeleteAccount', () => {
    expect(section).toMatch(/import \{ paidSpacesEndedByDelete \} from '@\/lib\/account'/)
    expect(section).toMatch(/paidSpacesEndedByDelete\(\)/)
    expect(section).toMatch(/<DeleteAccount paidSpaces=\{paidSpaces\} \/>/)
  })
})
