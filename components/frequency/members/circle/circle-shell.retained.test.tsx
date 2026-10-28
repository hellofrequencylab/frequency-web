import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
vi.mock('@/app/themes/active/members-b', () => ({}))
vi.mock('@/app/themes/active/members-community', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: () => { throw new Error('No IO for header fixture') } }))
vi.mock('@/lib/events/going-counts', () => ({ goingCountsByEvent: () => { throw new Error('No IO for header fixture') } }))
import { FqCircleShell } from './circle-shell'
const props = { notices: null, coverImage: null, name: 'Human Circle', subline: '8 members · In person · Vista', invite: null, primary: null, admin: null, sister: null, nextEvent: null, myProfileId: null, tabs: [], tabTools: null, about: 'Human words <script>unsafe()</script>', hostLine: null, memberCount: 8, memberCap: 12, children: 'Circle feed' }
it('renders actual Frequency title metadata and safe human About content after legacy helper retirement', () => {
  const html = renderToStaticMarkup(FqCircleShell(props))
  expect(html).toContain('<h1 class="h1">Human Circle</h1>')
  expect(html).toContain('8 members · In person · Vista')
  expect(html).toContain('Human words &lt;script&gt;unsafe()&lt;/script&gt;')
  expect(html).not.toContain('<script>')
  expect(html).toContain('Circle feed')
})
it('a Space-owned Circle keeps its own cover and h1, with a Part of pill linking to the Space', () => {
  const html = renderToStaticMarkup(FqCircleShell({ ...props, spaceLink: { href: '/spaces/mindless', name: 'Mindless' } }))
  expect(html).toContain('<h1 class="h1">Human Circle</h1>')
  expect(html).not.toContain('<h2')
  expect(html).toContain('href="/spaces/mindless"')
  expect(html).toContain('Part of Mindless')
  expect(html).toContain('fqc-cover')
})

it('the actual Frequency About restores paragraphs, bold, italic and safe links with no raw HTML', () => {
  const about = '**Bold** *care* [safe](/events) [outside](https://example.com)\n\nSecond paragraph [bad](javascript:evil) [data](data:text/html) [remote](//evil.example) <script>unsafe()</script>'
  const html = renderToStaticMarkup(FqCircleShell({ ...props, about }))
  expect(html).toContain('>Bold</strong>')
  expect(html).toContain('>care</em>')
  expect(html).toContain('href="/events"')
  expect(html).toContain('href="https://example.com"')
  expect(html.match(/<p>/g)).toHaveLength(2)
  for (const unsafe of ['href="javascript:', 'href="data:', 'href="//evil', '<script>']) expect(html).not.toContain(unsafe)
  expect(html).toContain('&lt;script&gt;unsafe()&lt;/script&gt;')
})
