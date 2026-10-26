import { describe, expect, it } from 'vitest'
import type { Data } from '@/lib/page-editor/types'
import { slotPanelModel } from './slot-panel'

const doc: Data = { root: {}, content: [
  { type: 'PhotoHero', props: { id: 'a', subtitle: '{{tagline|Sample}}' } },
  { type: 'EditorialSection', props: { id: 'b', lead: '{{story|Sample}} and {{tagline}}', cards: [{ body: '{{offer1Title|First}}' }] } },
] }

describe('slotPanelModel', () => {
  const groups = slotPanelModel({ tagline: 'Slow down', story: 'We started small.' }, [doc], 'salt')
  const row = (key: string) => groups.flatMap((g) => g.rows).find((r) => r.key === key)

  it('counts the sections that draw each fact and shows what is saved', () => {
    expect(row('tagline')).toMatchObject({ saved: 'Slow down', uses: 2, label: 'Tagline' })
    expect(row('story')).toMatchObject({ saved: 'We started small.', uses: 1 })
    expect(row('email')).toMatchObject({ saved: null, uses: 0 })
  })
  it('lists an offer only when a section uses it or the Space has it', () => {
    expect(row('offer1Title')).toMatchObject({ saved: null, uses: 1, label: 'Offer 1 title' })
    expect(row('offer2Title')).toBeUndefined()
    expect(groups.find((g) => g.label === 'People')).toBeUndefined()
  })
  it('points each fact at the console page that owns it', () => {
    expect(row('tagline')!.href).toBe('/spaces/salt/manage')
    expect(row('offer1Title')!.href).toBe('/spaces/salt/settings/services')
  })
})
