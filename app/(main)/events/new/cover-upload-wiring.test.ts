import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// THE CREATE-EVENT COVER MUST UPLOAD THROUGH THE SERVER (LIVE-072).
//
// On 2026-08-20 a member could not add a cover photo while creating an event: the edge log shows
// `POST 400 /storage/v1/object/event-media/<uid>/event-covers/1787259085047.png` from Safari and
// postgres logs `new row violates row-level security policy for table "objects"` two seconds later
// (an identical pair 50 minutes earlier). The path carried her uid, so the bucket's INSERT policy
// (`split_part(name,'/',1) = auth.uid()`) was satisfied — the request simply reached Storage with
// no session and was denied as `anon`. The cover control had no `uploadFn`, so it fell through to
// the direct browser upload in image-upload.tsx. Two sibling call sites had already hit and fixed
// exactly this by routing server-side.
//
// Every assertion here fails on the pre-fix tree: the cover mount carried no uploadFn, the
// create-time action did not exist, and the uploadFn branch wrote `${res.url}?t=…` regardless of
// mode (so wiring it without the seam fix would have stored "undefined?t=…" in cover_image_path).

const FORM = 'app/(main)/events/new/event-form.tsx'
const ACTIONS = 'app/(main)/events/admin-actions.ts'
const CONTROL = 'components/ui/image-upload.tsx'
const CREATE = 'app/(main)/events/actions.ts'

const form = readFileSync(FORM, 'utf8')
const actions = readFileSync(ACTIONS, 'utf8')
const control = readFileSync(CONTROL, 'utf8')

/** The props of the mount whose opening tag starts at `tag` — e.g. the ONE `<ImageUpload` in the form. */
function mountProps(source: string, tag: string): string {
  const start = source.indexOf(tag)
  expect(start, `${tag} is no longer mounted`).toBeGreaterThan(-1)
  const end = source.indexOf('/>', start)
  expect(end, `${tag} has no closing />`).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe('the create form routes its photos through the gated action', () => {
  it('imports the server action', () => {
    expect(form).toContain("import { uploadNewEventImage } from '@/app/(main)/events/admin-actions'")
  })

  it('the cover control carries an uploadFn, so it never touches the browser Storage client', () => {
    const cover = mountProps(form, '<ImageUpload')
    expect(cover).toContain('mode="path"')
    expect(cover, 'the create-event cover is uploading direct from the browser again').toContain('uploadFn=')
    expect(cover).toContain('uploadNewEventPhoto')
  })

  it('the gallery beside it is server-routed too (the identical latent failure)', () => {
    const gallery = mountProps(form, '<MultiImageUpload')
    expect(gallery).toContain('upload=')
    expect(gallery).toContain('uploadNewEventImage')
  })
})

describe('uploadNewEventImage is gated, bounded, and returns a path', () => {
  const body = actions.slice(
    actions.indexOf('export async function uploadNewEventImage'),
    actions.indexOf('/** Replace the event\'s uploaded gallery images'),
  )

  it('exists and is reachable from the create form', () => {
    expect(body.length).toBeGreaterThan(0)
  })

  it('gates on a resolved profile — the same authorization createEvent requires', () => {
    expect(body).toContain('const profileId = await getMyProfileId()')
    expect(body).toContain("if (!profileId) return { error: 'Sign in to add a photo.' }")
    // There is no event id at create time, so the per-event capability gate cannot apply here.
    expect(body, 'getEventCapabilities cannot gate an event that does not exist yet').not.toContain(
      'getEventCapabilities',
    )
  })

  it('the gate it mirrors has not moved', () => {
    const create = readFileSync(CREATE, 'utf8')
    expect(create).toContain('const myProfileId = await getMyProfileId()')
    expect(create).toContain("if (!myProfileId) return fail('Sign in to create an event.')")
  })

  it('accepts only what the bucket accepts (the gallery action\'s own limits)', () => {
    expect(body).toContain('if (file.size > 10 * 1024 * 1024)')
    expect(body).toContain('GALLERY_MIME.includes(file.type)')
  })

  it('writes with the admin client, under the caller\'s own prefix, in an allowlisted folder', () => {
    expect(body).toContain('const admin = createAdminClient()')
    expect(body).toContain("from('event-media')")
    expect(body).toContain('const path = `${profileId}/${folder}/${crypto.randomUUID()}.${ext}`')
    expect(body).toContain('NEW_EVENT_FOLDERS.has(folderRaw)')
    expect(actions).toContain("const NEW_EVENT_FOLDERS = new Set(['event-covers', 'event-gallery'])")
  })

  it('returns the storage PATH (the column stores a path, not a URL)', () => {
    expect(body).toContain('return { path }')
    expect(body).toContain('Promise<{ path: string } | { error: string }>')
  })
})

describe('the uploadFn branch respects the control\'s mode', () => {
  it('delegates the value decision instead of assuming a URL', () => {
    expect(control).toContain("from '@/lib/library/upload-result'")
    expect(control).toContain('const next = valueFromServerUpload(mode, res, Date.now())')
    expect(control).toContain('onChange(next.value)')
  })

  it('the URL-assuming line is gone', () => {
    expect(control, 'the server-upload branch assumes URL mode again').not.toContain(
      'onChange(`${res.url}?t=',
    )
  })

  it('the existing URL-mode consumers are unchanged — none of them asks for path mode', () => {
    for (const file of [
      'app/(main)/spaces/[slug]/settings/settings-form.tsx',
      'components/spaces/space-branding-form.tsx',
      'components/journey/v2/journey-builder.tsx',
    ]) {
      const src = readFileSync(file, 'utf8')
      expect(src, `${file} pairs an uploadFn with a mode this test has not accounted for`).toContain(
        'uploadFn=',
      )
      expect(src, `${file} switched to path mode`).not.toContain('mode="path"')
    }
  })
})
