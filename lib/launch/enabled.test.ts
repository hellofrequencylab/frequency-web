import { describe, it, expect, afterEach, vi } from 'vitest'
import { launchEntryEnabled, launchSystemEnabled } from './enabled'

afterEach(() => vi.unstubAllEnvs())

describe('the launch switches (VLS-30)', () => {
  it('are off when unset or blank', () => {
    expect(launchSystemEnabled()).toBe(false)
    expect(launchEntryEnabled()).toBe(false)
    vi.stubEnv('LAUNCH_SYSTEM_ENABLED', '')
    vi.stubEnv('LAUNCH_ENTRY_ENABLED', '  ')
    expect(launchSystemEnabled()).toBe(false)
    expect(launchEntryEnabled()).toBe(false)
  })

  it('read 1, true and on, and nothing else', () => {
    for (const v of ['1', 'true', 'ON', ' on ']) {
      vi.stubEnv('LAUNCH_SYSTEM_ENABLED', v)
      expect(launchSystemEnabled(), v).toBe(true)
    }
    for (const v of ['0', 'false', 'yes', 'enabled']) {
      vi.stubEnv('LAUNCH_SYSTEM_ENABLED', v)
      expect(launchSystemEnabled(), v).toBe(false)
    }
  })

  it('keep the public doorway shut until the launch itself is on', () => {
    vi.stubEnv('LAUNCH_ENTRY_ENABLED', '1')
    expect(launchEntryEnabled()).toBe(false)
    vi.stubEnv('LAUNCH_SYSTEM_ENABLED', '1')
    expect(launchEntryEnabled()).toBe(true)
    vi.stubEnv('LAUNCH_ENTRY_ENABLED', '')
    expect(launchSystemEnabled()).toBe(true)
    expect(launchEntryEnabled()).toBe(false)
  })
})
