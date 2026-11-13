import { describe, expect, it } from 'vitest'
import { buildLaunchedEmail } from './launched-email'

const base = { to: 'sam@example.com', firstName: 'Sam', spaceName: 'Harbor Meetups', slug: 'harbor-meetups', baseUrl: 'https://frequencylocal.com/', unsubscribeUrl: 'https://frequencylocal.com/unsubscribe?p=p1&c=lifecycle&t=tok' }

describe('the launched welcome', () => {
  it('names the three addresses from the handle, Spotlight first', () => {
    const text = buildLaunchedEmail(base).text ?? ''
    const at = (s: string) => text.indexOf(s)
    expect(at('Your Spotlight: https://frequencylocal.com/spaces/harbor-meetups/spotlight')).toBeGreaterThan(0)
    expect(at('Your Space: https://frequencylocal.com/spaces/harbor-meetups\n')).toBeGreaterThan(at('Your Spotlight:'))
    expect(at('https://frequencylocal.com/spaces/harbor-meetups/manage')).toBeGreaterThan(at('Your Space:'))
  })

  it('builds html and text that both carry the greeting, the links, the button and the unsubscribe', () => {
    const e = buildLaunchedEmail(base)
    expect(e.to).toBe('sam@example.com')
    expect(e.subject).toBe("You're live. Here's where people find you.")
    for (const out of [e.html, e.text]) {
      expect(out).toContain('Hi Sam,')
      expect(out).toContain('https://frequencylocal.com/spaces/harbor-meetups/spotlight')
      expect(out).toContain('Open your Space')
    }
    expect(e.text).toContain(base.unsubscribeUrl)
    expect(e.html).not.toMatch(/—/)
    expect(e.text).not.toMatch(/—/)
  })

  it('greets plainly without a first name and escapes what it prints', () => {
    const e = buildLaunchedEmail({ ...base, firstName: null, slug: 'a&b' })
    expect(e.text).toContain('Hi,')
    expect(e.html).toContain('a%26b')
    expect(e.html).not.toContain('a&b/')
  })

  it('with no next step, is the same email as before: one Open your Space button, no next up line', () => {
    for (const e of [buildLaunchedEmail(base), buildLaunchedEmail({ ...base, next: null })]) {
      expect(e.text).not.toContain('Next up')
      expect(e.text).toContain('Open your Space: https://frequencylocal.com/spaces/harbor-meetups')
    }
  })

  it('with a next step, adds the line and makes its button the one button', () => {
    const next = { id: 'w-site', label: 'Publish your website', href: '/launch/step/website', why: 'Without one, every link you share points somewhere half-built.' }
    const e = buildLaunchedEmail({ ...base, next })
    for (const out of [e.html, e.text]) expect(out).toContain('Next up: Publish your website. Without one')
    expect(e.text).toContain('Publish your website: https://frequencylocal.com/launch/step/website')
    expect(e.html).toContain('href="https://frequencylocal.com/launch/step/website"')
    expect(e.text).not.toContain('Open your Space:')
    expect(e.text).not.toMatch(/—/)
  })
})
