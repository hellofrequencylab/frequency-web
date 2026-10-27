import { describe, it, expect } from 'vitest'
import { SPACE_AUTOMATION_TEMPLATES, fillTemplateLinks } from './automation-types'

const links = { space_url: 'https://frequencylocal.com/spaces/river', spotlight_url: 'https://frequencylocal.com/settings/profile/spotlight' }

describe('the Theme Kit welcome (LIVE-1538)', () => {
  const tpl = SPACE_AUTOMATION_TEMPLATES.find((t) => t.id === 'kit-welcome')!

  it('is a member.joined sequence that names the Theme Kit and links the Space and the Spotlight', () => {
    expect(tpl.triggerEvent).toBe('member.joined')
    expect(tpl.title).toContain('Theme Kit')
    const body = tpl.steps[0]!.body
    expect(body).toContain('{{space_url}}')
    expect(body).toContain('{{spotlight_url}}')
  })

  it('fills both links with the Space\'s own pages', () => {
    const out = fillTemplateLinks(tpl.steps[0]!.body, links)
    expect(out).toContain(links.space_url)
    expect(out).toContain(links.spotlight_url)
    expect(out).not.toContain('{{')
  })

  it('drops a link line it has no value for, never leaving a bare token', () => {
    const out = fillTemplateLinks(tpl.steps[0]!.body, { space_url: links.space_url })
    expect(out).toContain(links.space_url)
    expect(out).not.toContain('{{')
    expect(out).not.toContain('Spotlight')
  })
})
