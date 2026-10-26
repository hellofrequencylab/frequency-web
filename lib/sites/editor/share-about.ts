import type { WebsiteSnapshot } from './state'
import { SPACE_ABOUT_MAX } from '@/lib/spaces/promote-about'

// ONE ABOUT ON THE WEBSITE. When the website is published, the About text typed into the home page's About
// section is the Space's own intro: it is handed back to be saved on the Space (spaces.about) and the section
// is left drawing the shared intro through its `{{intro}}` token, so the Spotlight and the Space page show
// the same words. Only the first About section on the home page, and only plain typed words: a section that
// already carries a slot token, or sits on another page, is the owner's own copy and is never touched.
// PURE: returns a new snapshot, never mutates the input.
export function shareWebsiteAbout(snapshot: WebsiteSnapshot): { body: string | null; snapshot: WebsiteSnapshot } {
  let body: string | null = null
  const pages = snapshot.pages.map((page) => {
    if (page.slug !== 'home' || body !== null || !Array.isArray(page.doc?.content)) return page
    const content = page.doc.content.map((item) => {
      const typed = item?.type === 'SpaceAbout' && body === null ? (item.props as Record<string, unknown>)?.body : undefined
      if (typeof typed !== 'string' || !typed.trim() || typed.includes('{{')) return item
      body = typed.trim().slice(0, SPACE_ABOUT_MAX)
      return { ...item, props: { ...item.props, body: '{{intro}}' } }
    })
    return body === null ? page : { ...page, doc: { ...page.doc, content } }
  })
  return body === null ? { body: null, snapshot } : { body, snapshot: { ...snapshot, pages } }
}
