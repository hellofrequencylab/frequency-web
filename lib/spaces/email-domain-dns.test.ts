import { describe, expect, it } from 'vitest'
import { emailDomainDnsInstructions } from './email-domain-dns'
describe('manual provider DNS setup', () => {
  it('retains provider values and priorities without changing existing apex MX', () => {
    const result = emailDomainDnsInstructions('example.com',[{ name:'send',type:'MX',value:'provider-region.test',priority:10,status:'pending',record:'SPF' }],false)
    expect(result.records[0]).toMatchObject({ name:'send.example.com',value:'provider-region.test',priority:10 })
    expect(result.automaticDnsAvailable).toBe(false)
    expect(result.sendingReady).toBe(false)
    expect(result.receivingReady).toBe(false)
  })
  it('never calls partial authentication records ready to send', () => {
    expect(emailDomainDnsInstructions('example.com',[{ name:'send',type:'TXT',value:'spf',record:'SPF',status:'verified' }],false).sendingReady).toBe(false)
  })
  it('requires separate receiving subdomain and separate receiving verification', () => {
    expect(emailDomainDnsInstructions('example.com',[],true).receivingAllowed).toBe(false)
    const result=emailDomainDnsInstructions('reply.example.com',[{name:'@',type:'MX',value:'receive.test',status:'verified',record:'Receiving'}],true)
    expect(result.receivingAllowed).toBe(true); expect(result.receivingReady).toBe(true); expect(result.sendingReady).toBe(false)
  })
})
