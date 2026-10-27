import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ floor: vi.fn(), set: vi.fn(), cookies: vi.fn(), revalidate: vi.fn() }))
vi.mock('@/lib/admin/guard', () => ({ requireAdminFloor: mocks.floor }))
vi.mock('next/headers', () => ({ cookies: mocks.cookies }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
import { setAdminDashOrder } from './dash-order-actions'
beforeEach(() => { vi.clearAllMocks(); mocks.floor.mockResolvedValue({}); mocks.cookies.mockResolvedValue({ set: mocks.set }) })
it('checks the actual admin floor before any cookie mutation', async () => {
  mocks.floor.mockRejectedValue(new Error('denied'))
  await expect(setAdminDashOrder('home', ['vera'])).rejects.toThrow('denied')
  expect(mocks.cookies).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled()
})
it.each([['__proto__', []], ['constructor', []], ['home', [null]], ['home', {}], [null, []], ['home', Array(41).fill('vera')]])('rejects forged runtime arguments %j', async (scope, order) => {
  await expect(setAdminDashOrder(scope as never, order as never)).rejects.toThrow()
  expect(mocks.set).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled()
})
it('sanitizes duplicate and unknown ids, persists complete order, then revalidates', async () => {
  await setAdminDashOrder('home', ['growth', 'unknown', 'growth', 'vera'])
  expect(mocks.set).toHaveBeenCalledWith('admin-dash-order-home', 'growth,vera,community,programs,operations', { path: '/', maxAge: 31536000, sameSite: 'lax' })
  expect(mocks.revalidate).toHaveBeenCalledWith('/admin')
})
it('does not report success/revalidate when cookie writing fails', async () => {
  mocks.set.mockImplementationOnce(() => { throw new Error('write failed') })
  await expect(setAdminDashOrder('home', [])).rejects.toThrow('write failed')
  expect(mocks.revalidate).not.toHaveBeenCalled()
})
