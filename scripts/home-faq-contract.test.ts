import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { homeFaqContract } from './probes/home-faq.mjs'
const route = readFileSync('app/page.tsx','utf8')
const body = readFileSync('components/frequency/site/pages/home/frequency-home.tsx','utf8')
it('accepts the active Frequency home and rejects missing visible or structured answers', () => {
 expect(homeFaqContract(route,body)).toBe(true)
 expect(homeFaqContract(route.replace('<FrequencyHome />',''),body)).toBe(false)
 expect(homeFaqContract(route.replace('faqSchema(homeFaq())','undefined'),body)).toBe(false)
 expect(homeFaqContract(route,body.replace('homeFaq().map','[].map'))).toBe(false)
 expect(homeFaqContract(route,body.replace('<p>{f.a}</p>','<p>unrelated</p>'))).toBe(false)
 expect(homeFaqContract(route,body.replace('<summary>{f.q}</summary>','<summary>unrelated</summary>'))).toBe(false)
 expect(homeFaqContract(route,body.replace('id="questions"','id="removed"'))).toBe(false)
})
