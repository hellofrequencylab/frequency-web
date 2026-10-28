// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { PostPhoto } from './post-photo'

let root: Root | undefined
let host: HTMLDivElement | undefined
afterEach(() => { act(() => root?.unmount()); host?.remove() })

it('falls back to the original public image if optimization fails', () => {
  const src = 'https://api.frequencylocal.com/storage/v1/object/public/posts/photo.jpg'
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root!.render(<PostPhoto src={src} label="Post photo" />))
  const img = host.querySelector('img')!
  expect(img.getAttribute('src')).toContain('/_next/image?url=')
  act(() => img.dispatchEvent(new Event('error', { bubbles: false })))
  expect(host.querySelector('img')).toBeNull()
  expect((host.querySelector('[role="img"]') as HTMLElement).style.backgroundImage).toContain(src)
})
