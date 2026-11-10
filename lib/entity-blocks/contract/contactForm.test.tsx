import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { contactFormBlock as block } from './contactForm'
import { ADOPTED_BLOCKS } from './index'

vi.mock('@/app/(main)/spaces/[slug]/contact-form-actions', () => ({
  submitContactForm: vi.fn(),
}))

describe('the non-money form contract', () => {
  it('uses the Studio fields and reads only authored text', () => {
    expect(ADOPTED_BLOCKS).toContain(block)
    const content = block.content.parse({
      title: 'Get in touch',
      body: 'Tell us <strong>what you need</strong>.',
      showPhone: true,
      submitLabel: 'Send it',
      email: 'submitted@example.test',
    })
    expect(block.fields.map(({ key }) => key)).toEqual(expect.arrayContaining([
      'title', 'body', 'showPhone', 'submitLabel',
    ]))
    expect(block.toText(content)).toBe('Get in touch\nTell us what you need.\nSend it')
    expect(block.render.email).toBeNull()
  })

  it('renders the authored fields with submission disabled in the Studio preview', async () => {
    const renderer = await import('@/components/entity-blocks/blocks/contactForm.web')
    expect(await block.render.web()).toBe(renderer)
    const markup = renderToStaticMarkup(createElement(renderer.default, {
      title: 'Get in touch',
      submitLabel: 'Send it',
      showMessage: false,
    }))

    expect(markup).toContain('Get in touch')
    expect(markup).toMatch(/<button\b(?=[^>]*\bdisabled="")[^>]*>Send it<\/button>/)
    expect(markup).not.toContain('<textarea')
  })
})
