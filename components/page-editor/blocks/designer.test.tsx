import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { designerComponents, DESIGNER_CATEGORY_COMPONENTS } from './designer'
import { designerHomeBlocks, designerSitePages } from '@/lib/sites/designer-home'
import { websiteTemplateSections } from '@/lib/sites/editor/templates'
import { planMensworkPage } from '@/lib/sites/menswork-page'
import { config } from '@/lib/page-editor/config'
import { categoryKeysForSurface } from '@/lib/page-editor/palette-scope'
import { editorBlockMeta } from '@/lib/sites/editor/block-meta'

const links = { origin: 'https://frequency.example', slug: 'studio', siteBase: '', pages: ['home'], contactHref: '/contact', bookHref: null, email: null }

function draw(type: string, props: Record<string, unknown>, metadata: Record<string, unknown>) {
  const el = (designerComponents[type].render as (p: Record<string, unknown>) => React.ReactNode)({ ...designerComponents[type].defaultProps, ...props, puck: { metadata } })
  return renderToStaticMarkup(<>{el}</>)
}

// The design's thirteen sections: every one is an editor block.
const DESIGN_BLOCKS = ['Hero', 'Statement', 'Portfolio', 'Steps', 'Services', 'Testimonials', 'Founder', 'Band', 'FAQ', 'Quote', 'Gallery', 'Closing', 'Inquiry']

describe('the Designer block family', () => {
  it('has one registered editor block for each of the design\'s thirteen sections', () => {
    expect(DESIGNER_CATEGORY_COMPONENTS).toEqual(DESIGN_BLOCKS.map((b) => `Designer${b}`))
    for (const type of DESIGNER_CATEGORY_COMPONENTS) expect((config.components as Record<string, { label?: string }>)[type]?.label, type).toBeTruthy()
  })

  it('puts the family on the website palette, in the Sections group', () => {
    expect(categoryKeysForSurface('website')).toContain('designer')
    expect(categoryKeysForSurface('space')).not.toContain('designer')
    for (const type of DESIGNER_CATEGORY_COMPONENTS) expect(editorBlockMeta(config, type).group, type).toMatch(/^(Sections|Live)$/)
  })

  it('draws every block on its own defaults with no raw colour', () => {
    for (const type of DESIGNER_CATEGORY_COMPONENTS) {
      const html = draw(type, {}, { space: {}, links })
      if (html) expect(html, type).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i)
    }
    expect(draw('DesignerHero', {}, { links })).toContain('data-dz="hero"')
    expect(draw('DesignerInquiry', {}, { links })).toContain('Services of interest')
  })

  it('is planned as own renders, the hero first, and opens the Designer Program template on the Home', () => {
    const plan = planMensworkPage(designerHomeBlocks())
    expect(plan.every((p) => p.kind === 'own')).toBe(true)
    expect(plan.map((p) => ('hero' in p ? p.hero : false))[0]).toBe(true)
    expect(websiteTemplateSections('Designer', 'Program').map((b) => b.type)).toEqual(designerHomeBlocks().map((b) => b.type))
  })

  it('shows every design block somewhere in the page set', () => {
    const used = new Set(designerSitePages().flatMap((p) => p.blocks.map((b) => b.type)))
    for (const type of DESIGNER_CATEGORY_COMPONENTS) expect(used.has(type) || type === 'DesignerGallery', type).toBe(true)
  })

  it('links through the site map and reads the Space\'s own questions before the cards', () => {
    const html = draw('DesignerHero', { primaryLabel: 'Start', primaryHref: '~/contact', strip: [] }, { links: { ...links, pages: ['home', 'contact'] } })
    expect(html).toContain('href="')
    const faq = draw('DesignerFAQ', {}, { links, space: { faqs: [{ id: '1', question: 'Own question?', answer: 'Own answer.' }] } })
    expect(faq).toContain('Own question?')
    expect(faq).not.toContain('How early should we bring you in?')
  })

  it('draws the portfolio as the large-and-stacked mosaic, or as the design\'s cards, every project numbered', () => {
    const projects = [1, 2, 3, 4].map((n) => ({ title: `Project ${n}`, location: 'Place', year: '2025', href: '~/portfolio' }))
    const mosaic = draw('DesignerPortfolio', { projects }, { links })
    expect(mosaic).toContain('dz-mosaic')
    expect(mosaic).not.toContain('dz-tiles')
    const cards = draw('DesignerPortfolio', { display: 'cards', projects }, { links })
    expect(cards).toContain('dz-tiles')
    expect(cards).not.toContain('dz-mosaic')
    expect(cards.match(/class="dz-tile"/g)).toHaveLength(4)
    expect(cards).toContain('<i>01</i>')
    expect(cards).toContain('<i>04</i>')
  })

  it('does not set an em dash in the sample copy', () => {
    const copy = JSON.stringify([designerSitePages(), ...DESIGNER_CATEGORY_COMPONENTS.map((t) => designerComponents[t].defaultProps)])
    expect(copy).not.toMatch(/—/)
  })
})
