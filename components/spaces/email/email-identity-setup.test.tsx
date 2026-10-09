import {describe,it,expect,vi} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
vi.mock('@/app/(main)/spaces/[slug]/settings/email/identity-actions',()=>({prepareEmailIdentity:vi.fn(),provisionEmailIdentity:vi.fn(),checkEmailIdentity:vi.fn(),saveEmailIdentity:vi.fn(),resetEmailIdentity:vi.fn()}))
import {EmailIdentitySetup} from './email-identity-setup'
describe('owner identity settings entry',()=>{
 it('keeps free Frequency identity and purpose selection without paid domain controls',()=>{
  const html=renderToStaticMarkup(<EmailIdentitySetup spaceId="s1" slug="example" domain="example.com" paid={false}/>)
  expect(html).toContain('Use Frequency sender');expect(html).toContain('View Space plans');expect(html).toContain('Campaigns');expect(html).not.toContain('Prepare domain')
 })
 it('does not start provisioning or claim receiving readiness when opening paid setup',()=>{
  const html=renderToStaticMarkup(<EmailIdentitySetup spaceId="s1" slug="example" domain="example.com" paid/>)
  expect(html).toContain('Prepare domain');expect(html).not.toContain('Sending: Verified');expect(html).not.toContain('Use this sender')
 })
})
