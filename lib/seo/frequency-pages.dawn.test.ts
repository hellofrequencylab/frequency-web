import { describe, it, expect, vi } from 'vitest'
import snapshot from './dawn-metadata.snapshot.json'

// A DAWN BUILD'S METADATA IS BYTE-IDENTICAL. dawn-metadata.snapshot.json was written from these two
// routes' `metadata` exports BEFORE the Frequency branch was added (2026-10-13), so this pins that the
// switch changed nothing a DAWN deploy serves. The Frequency half is frequency-pages.test.ts.

vi.mock('@/lib/theme/design', async (orig) => ({ ...(await orig<object>()), SITE_DESIGN: 'dawn' }))

describe('DAWN metadata is unchanged by the Frequency branch', () => {
  it('/spaces', async () => {
    const { metadata } = await import('@/app/(marketing)/spaces/page')
    expect(JSON.parse(JSON.stringify(metadata))).toEqual(snapshot.spaces)
  })

  it('/the-community', async () => {
    const { metadata } = await import('@/app/(marketing)/the-community/page')
    expect(JSON.parse(JSON.stringify(metadata))).toEqual(snapshot.community)
  })
})
