import { describe, it, expect } from 'vitest'
import { parseEmailRenderLayout } from './render-layout'
import { compileEmailDoc } from './shell'
import { PLATFORM_POSTAL_LINE } from './postal'

// A node document saved by the visual editor (object cells + bench). The Studio TEST send and the real send must
// both parse it with parseEmailRenderLayout; the legacy parser drops object cells and yields a blank body.
const saved = {
  rows: [
    { id: 'r0', columns: 1, cells: [[{ nid: 'nhead0001', type: 'displayHeading', content: { text: 'You get to see it first' } }]] },
    { id: 'r1', columns: 1, cells: [[{ nid: 'nbody0001', type: 'prose', content: { text: 'Hi there,<br><br>Before it opens to everyone.' } }]] },
    { id: 'r2', columns: 1, cells: [[{ nid: 'nbtn00001', type: 'button', content: { url: 'https://frequencylocal.com/create-a-space', label: 'Come preview it', align: 'center' } }]] },
  ],
  bench: [],
}

describe('Studio test send body and footer', () => {
  const layout = parseEmailRenderLayout(saved)!
  const mail = compileEmailDoc(
    { layout, subject: 'Subject', preheader: 'Preview' },
    { unsubscribeUrl: 'https://example.test/unsub', manageUrl: 'https://example.test/manage' },
  )

  it('renders the heading, copy and button of an editor-saved document', () => {
    expect(mail.html).toContain('You get to see it first')
    expect(mail.html).toContain('Before it opens to everyone.')
    expect(mail.html).toContain('Come preview it')
  })

  it('puts Manage emails first and a smaller Unsubscribe under it, both live links', () => {
    const manage = mail.html.indexOf('>Manage emails</a>')
    const unsub = mail.html.indexOf('>Unsubscribe</a>')
    expect(manage).toBeGreaterThan(-1)
    expect(unsub).toBeGreaterThan(manage)
    expect(mail.html).toContain('href="https://example.test/unsub"')
    expect(mail.html).toContain('href="https://example.test/manage"')
  })

  it('prints the footer name as Frequency Labs with the postal address', () => {
    expect(PLATFORM_POSTAL_LINE.startsWith('Frequency Labs, ')).toBe(true)
    expect(mail.html).not.toContain('Frequency Labs Holdings')
  })
})
