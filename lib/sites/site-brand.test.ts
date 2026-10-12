import { describe, expect, it } from 'vitest'
import { resolveSiteHeaderBrand } from './site-brand'
import type { WebsiteSnapshot } from '@/lib/sites/editor/state'

const page = { slug: 'home', label: 'Home', doc: { root: {}, content: [] }, seo: { title: '', description: '' }, comments: [] }
const website = (extra: Partial<WebsiteSnapshot>): WebsiteSnapshot => ({ theme: 'Menswork', pages: [page], ...extra })

describe('the website header brand', () => {
  it('wears the stored Space brand, with the Space name when no brand name is set', () => {
    expect(resolveSiteHeaderBrand({ name: 'Heart on Fire', brandName: ' HoF ', brandLogoUrl: '/logo.svg', brandAccent: '#123456' }, null)).toEqual({ name: 'HoF', logo: '/logo.svg', accent: '#123456' })
    expect(resolveSiteHeaderBrand({ name: 'Heart on Fire', brandName: '  ', brandLogoUrl: null, brandAccent: null }, null)).toEqual({ name: 'Heart on Fire', logo: null, accent: null })
    expect(resolveSiteHeaderBrand({ name: '' }, null).name).toBe('Your Space')
  })

  it('lets a published website override the name, logo and accent, and clear the logo on purpose', () => {
    const space = { name: 'Heart on Fire', brandName: 'HoF', brandLogoUrl: '/logo.svg', brandAccent: '#123456' }
    expect(resolveSiteHeaderBrand(space, website({ chrome: { name: 'Heart on Fire Circles' }, brand: { logo: 'https://cdn.example/logo.png', accent: '#abc' } }))).toEqual({ name: 'Heart on Fire Circles', logo: 'https://cdn.example/logo.png', accent: '#abc' })
    // An explicit null clears the stored logo; an absent key inherits it.
    expect(resolveSiteHeaderBrand(space, website({ brand: { logo: null } }))).toEqual({ name: 'HoF', logo: null, accent: '#123456' })
    expect(resolveSiteHeaderBrand(space, website({ brand: { accent: null } }))).toEqual({ name: 'HoF', logo: '/logo.svg', accent: null })
    expect(resolveSiteHeaderBrand(space, website({ chrome: { name: '  ' } })).name).toBe('HoF')
  })
})
