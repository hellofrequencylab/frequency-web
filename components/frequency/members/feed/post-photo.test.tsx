import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PostPhoto } from './post-photo'

describe('PostPhoto', () => {
  it('uses responsive optimization for a public Frequency Storage image', () => {
    const html = renderToStaticMarkup(<PostPhoto src="https://api.frequencylocal.com/storage/v1/object/public/posts/a/photo.jpg" className="fa-photo" label="Post photo" />)
    expect(html).toContain('/_next/image?url=')
    expect(html).toContain('sizes="(max-width: 720px) 100vw, 700px"')
    expect(html).toContain('aria-label="Post photo"')
    expect(html).toContain('object-fit:cover')
  })
  it.each([
    'https://example.org/storage/v1/object/public/posts/photo.jpg',
    'https://api.frequencylocal.com/storage/v1/object/sign/private/photo.jpg?token=secret',
    'https://api.frequencylocal.com/storage/v1/object/public/posts/photo.jpg?token=secret',
    'https://api.frequencylocal.com/storage/v1/object/public/posts/photo.jpg#fragment',
    'https://api.frequencylocal.com/storage/v1/object/public/posts/logo.svg',
  ])('keeps an unrecognized or signed image on its original path', (url) => {
    const html = renderToStaticMarkup(<PostPhoto src={url} />)
    expect(html).not.toContain('/_next/image?url=')
    expect(html).toContain('background-image:')
  })
  it('keeps the photo-count overlay after the image', () => {
    const html = renderToStaticMarkup(<PostPhoto src="https://azsqfeonabsbmemvddqd.supabase.co/storage/v1/object/public/posts/photo.jpg"><span className="fa-more">+2</span></PostPhoto>)
    expect(html.indexOf('class="fa-more"')).toBeGreaterThan(html.indexOf('<img'))
  })
})
