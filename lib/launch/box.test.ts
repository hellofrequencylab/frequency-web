import { beforeEach, expect, it, vi } from 'vitest'

const enabled = vi.hoisted(() => ({ on: true }))
const auth = vi.hoisted(() => ({ id: 'p1' as string | null }))
const store = vi.hoisted(() => ({ launch: null as unknown }))
const published = vi.hoisted(() => ({ list: null as unknown }))

vi.mock('@/lib/auth', () => ({ getMyProfileId: async () => auth.id }))
vi.mock('./enabled', () => ({ launchSystemEnabled: () => enabled.on }))
vi.mock('./store', () => ({ getActiveLaunch: async () => store.launch }))
vi.mock('./get-started-io', () => ({ loadPostPublishList: async () => published.list }))
vi.mock('./box-state', () => ({ boxView: () => ({ stage: 'running' }) }))

import { launchOwnsNextSteps } from './box'

beforeEach(() => {
  enabled.on = true
  auth.id = 'p1'
  store.launch = { id: 'l1' }
  published.list = null
})

it('takes the Get Started list over while a launch runs', async () => {
  expect(await launchOwnsNextSteps()).toBe(true)
})

it('leaves Get Started alone with no launch, signed out, or the launch switched off', async () => {
  store.launch = null
  expect(await launchOwnsNextSteps()).toBe(false)
  store.launch = { id: 'l1' }
  auth.id = null
  expect(await launchOwnsNextSteps()).toBe(false)
  auth.id = 'p1'
  enabled.on = false
  expect(await launchOwnsNextSteps()).toBe(false)
})

it('hands the list to the launch overview once the Spotlight is published', async () => {
  published.list = [{ id: 'spotlight' }]
  expect(await launchOwnsNextSteps()).toBe(false)
})
