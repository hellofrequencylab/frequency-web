import { describe, expect, it } from 'vitest'
import { shareWebsiteAbout } from './share-about'
import type { WebsiteSnapshot } from './state'

const snap = (home: unknown[], other: unknown[] = []) =>
  ({ theme: 'DAWN', pages: [
    { slug: 'home', label: 'Home', doc: { content: home, root: {} }, seo: { title: '', description: '' }, comments: [] },
    { slug: 'team', label: 'Team', doc: { content: other, root: {} }, seo: { title: '', description: '' }, comments: [] },
  ] }) as unknown as WebsiteSnapshot

describe('shareWebsiteAbout', () => {
  it('hands the typed home About back and leaves the section on the shared intro', () => {
    const input = snap([{ type: 'SpaceAbout', props: { id: 'a', body: ' We run slow mornings. ' } }])
    const out = shareWebsiteAbout(input)
    expect(out.body).toBe('We run slow mornings.')
    expect((out.snapshot.pages[0].doc.content[0].props as { body: string }).body).toBe('{{intro}}')
    expect((input.pages[0].doc.content[0].props as { body: string }).body).toBe(' We run slow mornings. ')
  })

  it('leaves a token, an empty body and other pages alone', () => {
    const tokened = snap([{ type: 'SpaceAbout', props: { body: '{{intro|Sample}}' } }], [{ type: 'SpaceAbout', props: { body: 'Team page copy' } }])
    expect(shareWebsiteAbout(tokened)).toEqual({ body: null, snapshot: tokened })
    const empty = snap([{ type: 'SpaceAbout', props: { body: '  ' } }])
    expect(shareWebsiteAbout(empty).body).toBeNull()
  })
})
