import { describe, it, expect } from 'vitest'

// The extraction coercer is the FIRST grounding gate (docs §4.1): a field the model labeled
// 'fact' whose cited snippet is NOT actually in the harvested sources is downgraded to 'inferred'
// (the model cannot launder a guess into a fact by claiming a citation that does not exist).

import {
  coerceExtraction,
  groundField,
  snippetIsGrounded,
  parsePrice,
  coerceKind,
  type RawExtraction,
} from './coerce'
import type { HarvestedSource } from '../intake'

const sources: HarvestedSource[] = [
  {
    id: 's1',
    kind: 'page',
    url: 'https://acme.test/contact',
    fetchedAt: 'now',
    title: 'Contact Acme',
    text: 'Acme Coffee is at 123 Main St, open 9 to 5. Call 555-1212.',
  },
]

describe('snippetIsGrounded', () => {
  it('matches a snippet present in a source (case/space-insensitive)', () => {
    expect(snippetIsGrounded('123 Main St', sources)).toBe(true)
    expect(snippetIsGrounded('123   MAIN st', sources)).toBe(true)
  })
  it('rejects a snippet absent from every source', () => {
    expect(snippetIsGrounded('999 Fake Blvd', sources)).toBe(false)
    expect(snippetIsGrounded('', sources)).toBe(false)
    expect(snippetIsGrounded(undefined, sources)).toBe(false)
  })
})

describe('groundField — the anti-laundering gate', () => {
  it('keeps a fact whose snippet IS grounded', () => {
    const e = groundField({ value: '123 Main St', snippet: '123 Main St', sourceUrl: 'https://acme.test/contact', kind: 'fact', confidence: 0.9 }, sources)
    expect(e.kind).toBe('fact')
    expect(e.confidence).toBe(0.9)
  })

  it('DOWNGRADES a fact whose snippet is NOT grounded, capping confidence', () => {
    const e = groundField({ value: '999 Fake Blvd', snippet: '999 Fake Blvd', kind: 'fact', confidence: 0.95 }, sources)
    expect(e.kind).toBe('inferred')
    expect(e.confidence).toBeLessThanOrEqual(0.4)
  })

  it('downgrades a fact that carries NO snippet and NO sourceUrl', () => {
    const e = groundField({ value: 'x', kind: 'fact', confidence: 0.9 }, sources)
    expect(e.kind).toBe('inferred')
  })

  // REGRESSION (finding #5): a matching sourceUrl is NOT sufficient grounding. A known page url does
  // not prove the specific claim appears on it, so a fact whose snippet is absent must be downgraded
  // even when the url matches a harvested source.
  it('does NOT clear a fact on a matching sourceUrl when the snippet is absent from the source', () => {
    const e = groundField(
      { value: 'Acme Coffee wins Best Cafe 2025', sourceUrl: 'https://acme.test/contact', kind: 'fact', confidence: 0.9 },
      sources,
    )
    expect(e.kind).toBe('inferred') // url match alone never clears
    expect(e.confidence).toBeLessThanOrEqual(0.4)
  })

  it('does NOT clear a fact whose snippet is not in the source even if the snippet field is set', () => {
    // snippet present but absent from any source, sourceUrl matches -> still downgraded.
    const e = groundField(
      { value: 'x', snippet: 'Best Cafe 2025 award', sourceUrl: 'https://acme.test/contact', kind: 'fact', confidence: 0.9 },
      sources,
    )
    expect(e.kind).toBe('inferred')
  })

  it('defaults an unlabeled field to generated (never a fact by omission)', () => {
    expect(coerceKind(undefined)).toBe('generated')
    expect(coerceKind('nonsense')).toBe('generated')
  })
})

describe('coerceExtraction — raw model shape to draft + ledger', () => {
  const raw: RawExtraction = {
    name: { value: 'Acme Coffee', snippet: 'Acme Coffee', sourceUrl: 'https://acme.test/contact', kind: 'fact', confidence: 0.9 },
    type: 'business',
    about: { value: 'A neighborhood cafe.', kind: 'generated', confidence: 0.6 },
    contact: {
      address: { value: '123 Main St', snippet: '123 Main St', sourceUrl: 'https://acme.test/contact', kind: 'fact', confidence: 0.9 },
      phone: { value: '999-0000', snippet: '999-0000', kind: 'fact', confidence: 0.9 }, // NOT in sources -> downgraded
      hours: { value: 'open 9 to 5', snippet: 'open 9 to 5', sourceUrl: 'https://acme.test/contact', kind: 'fact', confidence: 0.8 },
    },
    offerings: [
      { title: { value: 'Latte' }, price: { value: '$5', snippet: '5', kind: 'inferred', confidence: 0.5 } },
    ],
  }

  it('grounds the address (in sources) as a fact but downgrades the phantom phone', () => {
    const { draft, ledger } = coerceExtraction(raw, sources)
    expect(draft.name).toBe('Acme Coffee')
    expect(draft.contact?.address).toBe('123 Main St')
    expect(ledger['contact.address'][0].kind).toBe('fact')
    // The phone snippet '999-0000' is not in any source -> downgraded, never a fact.
    expect(ledger['contact.phone'][0].kind).toBe('inferred')
  })

  it('keys an offering price ledger entry per index and parses the price', () => {
    const { draft, ledger } = coerceExtraction(raw, sources)
    expect(draft.offerings?.[0].price).toBe(5)
    expect(ledger['offerings[0].price']).toBeDefined()
  })

  it('omits generated About rather than retaining a draft with invented wording', () => {
    const { draft, ledger } = coerceExtraction(raw, sources)
    expect(draft.about).toBeUndefined()
    expect(ledger.about).toBeUndefined()
  })

  it('falls back to the name hint when the model returns no name', () => {
    const { draft } = coerceExtraction({ type: 'business' }, sources, 'Hinted Co')
    expect(draft.name).toBe('Hinted Co')
    expect(draft.type).toBe('business')
  })

  it('folds an unknown type to business', () => {
    const { draft } = coerceExtraction({ name: { value: 'X' }, type: 'charity' } as unknown as RawExtraction, sources)
    expect(draft.type).toBe('business')
  })
})

describe('parsePrice', () => {
  it('parses common price strings to major units', () => {
    expect(parsePrice('$45')).toBe(45)
    expect(parsePrice('From 20')).toBe(20)
    expect(parsePrice('19.99')).toBe(19.99)
    expect(parsePrice('1,200')).toBe(1200)
  })
  it('returns null for a price-less string', () => {
    expect(parsePrice('call us')).toBeNull()
  })
})


describe('About/Story source-verbatim gate', () => {
 const quote = 'Our own words.\nWith our punctuation!'
 const page: HarvestedSource = {id:'owner-page',kind:'page',url:'https://owner.test/about',fetchedAt:'now',text:`Intro. ${quote} End.`}
 const field = {value:quote,snippet:quote,sourceUrl:page.url,kind:'fact',confidence:0.9}
 it('keeps exact source words and matching provenance, including owner paste without a URL', () => {
  const result=coerceExtraction({about:field,story:{...field,sourceUrl:undefined}},[page,{id:'paste',kind:'paste',fetchedAt:'now',text:quote}],'Owner')
  expect(result.draft.about).toBe(quote);expect(result.draft.story).toBe(quote)
  expect(result.ledger.about[0]).toMatchObject({kind:'fact',snippet:quote,sourceUrl:page.url})
  expect(result.ledger.story[0].sourceUrl).toBeUndefined()
 })
 it.each([
  {...field,value:'Invented rewriting'}, {...field,kind:'generated'}, {...field,kind:'inferred'}, {...field,kind:undefined},
  {...field,snippet:undefined}, {...field,sourceUrl:'https://foreign.test/about'}, {...field,sourceUrl:undefined},
  {...field,value:quote.toLowerCase()}, {...field,value:'Our own words. With our punctuation!'},
 ])('rejects fabricated, uncited, relabeled or nonverbatim wording: %j', bad => {
  const result=coerceExtraction({about:bad,story:bad},[page],'Owner')
  expect(result.draft.about).toBeUndefined();expect(result.draft.story).toBeUndefined()
  expect(result.ledger.about).toBeUndefined();expect(result.ledger.story).toBeUndefined()
 })
 it('cannot borrow a citation from another source, title alone or search result', () => {
  for(const candidates of [[{...page,text:'Other words',title:quote}],[{...page,kind:'search_result' as const}],[{...page,url:'https://other.test'}]]) {
   expect(coerceExtraction({about:field},candidates,'Owner').draft.about).toBeUndefined()
  }
 })
})

describe('every extracted public prose surface uses the same source quotation gate', () => {
 const text='Our banner. Service detail. Can we meet? Yes, join us. Open studio. Doors open at noon.'
 const source:HarvestedSource={id:'owner',kind:'page',url:'https://owner.test/page',fetchedAt:'now',text}
 const citation={sourceUrl:source.url,snippet:text}
 const field=(value:string)=>({...citation,value,kind:'fact',confidence:0.9})
 const raw=():RawExtraction=>({
  tagline:field('Our banner.'),
  offerings:[{title:{value:'Class'},blurb:field('Service detail.'),price:{value:'25',kind:'inferred'}}],
  faq:[{q:'Can we meet?',a:'Yes, join us.',...citation}],
  events:[{title:'Open studio.',blurb:'Doors open at noon.',startsAt:'2026-11-01T12:00:00Z',...citation}],
 })
 it('keeps exact tagline, offering, FAQ and event words while retaining factual date/price extraction',()=>{
  const {draft,ledger}=coerceExtraction(raw(),[source],'Owner')
  expect(draft.tagline).toBe('Our banner.');expect(draft.offerings?.[0].blurb).toBe('Service detail.')
  expect(draft.offerings?.[0].price).toBe(25)
  expect(draft.faq).toEqual([{q:'Can we meet?',a:'Yes, join us.'}])
  expect(draft.events?.[0]).toMatchObject({title:'Open studio.',blurb:'Doors open at noon.',startsAt:'2026-11-01T12:00:00Z'})
  expect(ledger['faq[0].a'][0]).toMatchObject({kind:'fact',sourceUrl:source.url,snippet:text})
  expect(ledger['events[0].title'][0].kind).toBe('fact')
 })
 it.each(['tagline','offering','faq-question','faq-answer','event-title','event-blurb'])('drops invented %s even with a real unrelated citation',surface=>{
  const input=raw()
  if(surface==='tagline')input.tagline!.value='INVENTED'
  if(surface==='offering')input.offerings![0].blurb!.value='INVENTED'
  if(surface==='faq-question')input.faq![0].q='INVENTED'
  if(surface==='faq-answer')input.faq![0].a='INVENTED'
  if(surface==='event-title')input.events![0].title='INVENTED'
  if(surface==='event-blurb')input.events![0].blurb='INVENTED'
  const result=coerceExtraction(input,[source],'Owner')
  expect(JSON.stringify(result)).not.toContain('INVENTED')
  if(surface.startsWith('faq'))expect(result.draft.faq).toBeUndefined()
  if(surface==='event-title')expect(result.draft.events).toBeUndefined()
  if(surface==='event-blurb')expect(result.draft.events?.[0].blurb).toBeUndefined()
 })
 it.each(['uncited','foreign','search','split-sources'])('rejects %s evidence across every public prose field',mode=>{
  const input=raw();let sources=[source]
  if(mode==='uncited'){
   input.tagline!.snippet=undefined;input.offerings![0].blurb!.snippet=undefined
   input.faq![0].snippet=undefined;input.events![0].snippet=undefined
  }
  if(mode==='foreign')sources=[{...source,url:'https://foreign.test/page'}]
  if(mode==='search')sources=[{...source,kind:'search_result'}]
  if(mode==='split-sources')sources=[{...source,text:'Our banner. Can we meet? Open studio.'},{...source,id:'other',url:'https://other.test',text:'Service detail. Yes, join us. Doors open at noon.'}]
  const {draft}=coerceExtraction(input,sources,'Owner')
  expect(draft.tagline).toBeUndefined();expect(draft.offerings?.[0].blurb).toBeUndefined()
  expect(draft.faq).toBeUndefined();expect(draft.events).toBeUndefined()
 })
 it('accepts quoted FAQ/event words from a supplied owner paste with no fabricated URL',()=>{
  const input=raw();input.faq![0].sourceUrl=undefined;input.events![0].sourceUrl=undefined
  const {draft}=coerceExtraction(input,[{...source,kind:'paste',url:undefined}],'Owner')
  expect(draft.faq?.[0].a).toBe('Yes, join us.');expect(draft.events?.[0].title).toBe('Open studio.')
 })
})
