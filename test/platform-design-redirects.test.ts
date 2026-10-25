import {describe,it,expect,vi,afterEach} from 'vitest'
afterEach(()=>{vi.unstubAllEnvs();vi.resetModules()})
describe('redirects follow the canonical platform design',()=>{
  for(const raw of [undefined,'','unknown','dawn','frequency'])it(`matches resolved ${String(raw)}`,async()=>{
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_SITE_DESIGN',raw)
    const {resolveDesign}=await import('../lib/theme/design')
    const {default:config}=await import('../next.config')
    const rules=await config.redirects!()
    const frequency=resolveDesign(raw)==='frequency'
    for(const [source,destination]of [['/practice',frequency?'/features#f-zaps':'/help/the-quest'],['/the-quest',frequency?'/features#f-zaps':'/help/the-quest'],['/the-lab',frequency?'/vision':'/about']]){
      expect(rules.find(rule=>rule.source===source)).toMatchObject({source,destination,permanent:frequency})
    }
  })
})
