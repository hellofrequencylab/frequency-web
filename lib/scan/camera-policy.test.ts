import { describe, it, expect } from 'vitest'
import { documentRefusesCamera, shouldReloadForCamera } from './camera-policy'

// LIVE-713: the scanner may be mounted inside a document whose policy was set for another route
// (a <Link> into /scan is a soft navigation). These lock the two decisions it makes before it asks
// for the camera.

const policy = (allowed: string[]) => ({ allowsFeature: (f: string) => allowed.includes(f) })

describe('documentRefusesCamera', () => {
  it('reads the current Permissions Policy API', () => {
    expect(documentRefusesCamera({ permissionsPolicy: policy([]) })).toBe(true)
    expect(documentRefusesCamera({ permissionsPolicy: policy(['camera']) })).toBe(false)
  })

  it('falls back to the older Feature Policy API', () => {
    expect(documentRefusesCamera({ featurePolicy: policy(['geolocation']) })).toBe(true)
    expect(documentRefusesCamera({ featurePolicy: policy(['camera']) })).toBe(false)
  })

  it('answers null where the browser exposes neither, and on a throwing API', () => {
    expect(documentRefusesCamera({})).toBeNull()
    expect(
      documentRefusesCamera({
        permissionsPolicy: {
          allowsFeature: () => {
            throw new Error('nope')
          },
        },
      }),
    ).toBeNull()
  })
})

describe('shouldReloadForCamera', () => {
  it('reloads a scanner that arrived by soft navigation into a camera=() document', () => {
    expect(shouldReloadForCamera(true, 'https://frequencylocal.com/partners/acme', '/scan')).toBe(true)
    expect(shouldReloadForCamera(true, 'https://frequencylocal.com/feed', '/scan')).toBe(true)
  })

  it('never reloads a document that was already served for /scan (the loop guard)', () => {
    expect(shouldReloadForCamera(true, 'https://frequencylocal.com/scan?hint=node', '/scan')).toBe(false)
    expect(shouldReloadForCamera(true, 'https://frequencylocal.com/scan/', '/scan')).toBe(false)
    expect(shouldReloadForCamera(true, 'https://frequencylocal.com/SCAN', '/scan')).toBe(false)
  })

  it('does nothing when the camera is allowed or the browser does not say', () => {
    expect(shouldReloadForCamera(false, 'https://frequencylocal.com/feed', '/scan')).toBe(false)
    expect(shouldReloadForCamera(null, 'https://frequencylocal.com/feed', '/scan')).toBe(false)
  })

  it('does nothing when the load URL is unknown or unparseable', () => {
    expect(shouldReloadForCamera(true, undefined, '/scan')).toBe(false)
    expect(shouldReloadForCamera(true, 'not a url', '/scan')).toBe(false)
  })
})
