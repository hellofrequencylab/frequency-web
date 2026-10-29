import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { member } from './member-profile-modules.fixture'
import { toMemberEntity, resolveMemberBlockData } from '@/lib/entity-blocks/member-adapter'
import { MemberEventsBlock } from './events'

function html(hostedEvents: { id: string; slug: string; title: string; starts_at: string }[]) {
  const m = { ...member(), hostedEvents }
  return renderToStaticMarkup(
    <MemberEventsBlock member={toMemberEntity(m)} data={resolveMemberBlockData(m)} />,
  )
}

describe('MemberEventsBlock', () => {
  it('renders nothing when the member hosts nothing upcoming', () => {
    expect(html([])).toBe('')
  })

  it('lists each upcoming event with a link to its page and a day', () => {
    const out = html([{ id: 'e1', slug: 'full-moon-circle', title: 'Full Moon Circle', starts_at: '2026-11-07T20:00:00.000Z' }])
    expect(out).toContain('href="/events/full-moon-circle"')
    expect(out).toContain('Full Moon Circle')
    expect(out).toContain('Nov 7')
  })
})
