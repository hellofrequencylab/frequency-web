import { beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ role: vi.fn(), caller: vi.fn(), web: vi.fn(), resolve: vi.fn(), set: vi.fn(), del: vi.fn() }))
vi.mock('next/headers', () => ({cookies: async () => ({set:mock.set,delete:mock.del})}))
vi.mock('next/cache', () => ({revalidatePath:vi.fn()}))
vi.mock('@/lib/auth', () => ({getRealCallerRole:mock.role,getCallerProfile:mock.caller,getRealCallerWebRole:mock.web}))
vi.mock('@/lib/spaces/store', () => ({getSpaceById:vi.fn()}))
vi.mock('@/lib/context/resolve-context', () => ({resolveOperatorContext:mock.resolve}))
import { setViewAsRole } from '@/app/(main)/view-as-actions'
import { setOperatorContext } from '@/app/(main)/context-actions'
beforeEach(()=>{vi.clearAllMocks();mock.role.mockResolvedValue('host');mock.caller.mockResolvedValue({id:'viewer'});mock.web.mockResolvedValue('member');mock.resolve.mockResolvedValue({available:[{kind:'personal',label:'Personal',href:'/feed'}]})})
describe('account action authority is rechecked on the server',()=>{
 it('ordinary members cannot set preview cookies',async()=>{mock.role.mockResolvedValue('member');await setViewAsRole('visitor');expect(mock.set).not.toHaveBeenCalled();expect(mock.del).not.toHaveBeenCalled()})
 it('a host may downgrade but a forged higher role clears preview',async()=>{await setViewAsRole('member');expect(mock.set).toHaveBeenCalledWith(expect.any(String),'member',expect.objectContaining({httpOnly:true}));mock.set.mockClear();await setViewAsRole('mentor');expect(mock.set).not.toHaveBeenCalled();expect(mock.del).toHaveBeenCalled()})
 it('an unowned operator target cannot set a context cookie',async()=>{await setOperatorContext('operator:unowned');expect(mock.set).not.toHaveBeenCalled();expect(mock.del).toHaveBeenCalled()})
 it('a server-resolved owned context is accepted without granting a role',async()=>{mock.resolve.mockResolvedValue({available:[{kind:'personal',label:'Personal',href:'/feed'},{kind:'operator',spaceId:'owned',label:'Owned',href:'/spaces/owned'}]});await setOperatorContext('operator:owned');expect(mock.set).toHaveBeenCalledWith(expect.any(String),'operator:owned',expect.objectContaining({httpOnly:true}));expect(mock.role).not.toHaveBeenCalled()})
})
