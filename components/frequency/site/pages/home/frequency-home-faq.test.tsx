import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
vi.mock('../shared/data', () => ({ getWhatsOn: async () => ({events:[],thisWeek:0}), getRankedSpaces: async () => [], getActiveCircleCount: async () => 0 }))
vi.mock('./home-motion', () => ({ HomeMotion: () => null }))
vi.mock('./weave', () => ({ Weave: () => null }))
import { FrequencyHome } from './frequency-home'
import { homeFaq } from '@/lib/marketing/quick-answers'
import { faqSchema } from '@/lib/jsonld'
it('renders every shared answer visibly with native keyboard disclosure matching FAQPage', async () => {
 const html = renderToStaticMarkup(await FrequencyHome())
 const section = html.slice(html.indexOf('id="questions"'),html.indexOf('</section>',html.indexOf('id="questions"')))
 expect(section).toContain('<details>')
 const schema = faqSchema(homeFaq()) as {mainEntity:{name:string;acceptedAnswer:{text:string}}[]}
 expect(schema.mainEntity).toHaveLength(6)
 const escape = (text:string) => text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#x27;')
 for(const item of schema.mainEntity){
  expect(section).toContain(`<summary>${escape(item.name)}</summary>`)
  expect(section).toContain(`<p>${escape(item.acceptedAnswer.text)}</p>`)
 }
})
