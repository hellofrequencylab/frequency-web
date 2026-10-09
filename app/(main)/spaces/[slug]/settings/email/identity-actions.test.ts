import {beforeEach,describe,expect,it,vi} from 'vitest'
const owner=vi.hoisted(()=>vi.fn())
const operations=vi.hoisted(()=>({prepare:vi.fn(),provision:vi.fn(),check:vi.fn(),save:vi.fn(),reset:vi.fn()}))
vi.mock('@/lib/spaces/email-identity-registry',()=>({requireSpaceEmailIdentityOwner:(...a:unknown[])=>owner(...a)}))
vi.mock('@/lib/spaces/email-domain-onboarding',()=>({prepareEmailDomainSetup:(...a:unknown[])=>operations.prepare(...a),runSpaceEmailDomainProvisioning:(...a:unknown[])=>operations.provision(...a),checkEmailDomainSetup:(...a:unknown[])=>operations.check(...a),chooseEmailDomainSender:(...a:unknown[])=>operations.save(...a),useFrequencyEmailSender:(...a:unknown[])=>operations.reset(...a)}))
import {prepareEmailIdentity,provisionEmailIdentity,checkEmailIdentity,saveEmailIdentity,resetEmailIdentity} from './identity-actions'
beforeEach(()=>{owner.mockReset();Object.values(operations).forEach(fn=>fn.mockReset())})
describe('public email identity action authorization',()=>{
 it('refuses every public action before delegated setup/provider mutations when current owner authority is absent',async()=>{owner.mockRejectedValue(new Error('Only the current owner'));for(const run of [()=>prepareEmailIdentity('s1','example.test'),()=>provisionEmailIdentity('s1','example.test','proof'),()=>checkEmailIdentity('s1','d1'),()=>saveEmailIdentity('s1','d1','hello','Example','marketing'),()=>resetEmailIdentity('s1','marketing')])expect(await run()).toEqual({error:'Only the current owner'});Object.values(operations).forEach(fn=>expect(fn).not.toHaveBeenCalled())})
 it('requires paid owner authority for setup but allows explicit Frequency reset after downgrade',async()=>{owner.mockResolvedValue({id:'s1'});operations.prepare.mockResolvedValue({domain:'example.test'});expect(await prepareEmailIdentity('s1','example.test')).toEqual({data:{domain:'example.test'}});expect(owner).toHaveBeenLastCalledWith('s1',true);expect(operations.prepare).toHaveBeenCalledWith('s1','example.test');expect(await resetEmailIdentity('s1','marketing')).toEqual({data:undefined});expect(owner).toHaveBeenLastCalledWith('s1',false);expect(operations.reset).toHaveBeenCalledWith('s1','marketing')})
})
