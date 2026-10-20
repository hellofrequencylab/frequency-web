// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// LIVE-1032: under Frequency every member index waits on the same kit skeleton (head, find row, chips,
// grid), never a DAWN photo band or tab strip that flashes where the plain header will land.
vi.mock('@/lib/theme/design', async (orig) => ({ ...(await orig<object>()), SITE_DESIGN: 'frequency' }))

const ROUTES: Array<[string, () => Promise<{ default: () => React.ReactNode }>]> = [
  ['Store', () => import('@/app/(main)/(marketplace)/store/loading')],
  ['Housing', () => import('@/app/(main)/(marketplace)/housing/loading')],
  ['Spaces', () => import('@/app/(main)/spaces/directory/loading')],
  ['Around You', () => import('@/app/(main)/nearby/loading')],
  ['Members', () => import('@/app/(main)/network/loading')],
]

describe('Frequency index loading states (LIVE-1032)', () => {
  it.each(ROUTES)('%s waits on the kit skeleton', async (_name, load) => {
    const { default: Loading } = await load()
    const html = renderToStaticMarkup(<>{Loading()}</>)
    expect(html).toContain('fqm-sk-find')
    expect(html).not.toMatch(/h-48|min-h-\[15rem\]|rounded-none/)
  })
})
