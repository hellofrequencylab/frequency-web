import { describe, expect, it } from 'vitest'
import { UPLOAD_KINDS, UPLOAD_MAX_BYTES, acceptUpload, getUploads, isUploadKind, putUpload } from '@/lib/create-space/uploads'
import { readCarry } from '@/lib/launch/carry'

describe('their own pictures', () => {
  it('accepts the avatars bucket types under its ceiling and names why otherwise', () => {
    expect(acceptUpload({ type: 'image/jpeg', size: 1000 })).toBeNull()
    expect(acceptUpload({ type: 'image/webp', size: UPLOAD_MAX_BYTES })).toBeNull()
    expect(acceptUpload({ type: 'image/svg+xml', size: 1000 })).toContain('JPG')
    expect(acceptUpload({ type: 'image/png', size: UPLOAD_MAX_BYTES + 1 })).toContain('5 MB')
    expect(acceptUpload({ type: 'image/png', size: 0 })).toContain('empty')
  })

  it('has three kinds and no more', () => {
    expect(UPLOAD_KINDS).toEqual(['cover', 'logo', 'profile'])
    expect(isUploadKind('logo')).toBe(true)
    expect(isUploadKind('hero')).toBe(false)
  })

  it('never rides into the launch hold as a picture: the carry keeps only the choice', () => {
    expect(readCarry({ cover: 'blob:https://x/1', logo: 'data:image/png;base64,AAAA', profile: 'up' })).toEqual({ profile: 'up' })
  })

  it('resolves to nothing, never throws, where IndexedDB is missing', async () => {
    expect(await putUpload('cover', new Blob(['x']))).toBe(false)
    expect(await getUploads()).toEqual({})
  })
})
