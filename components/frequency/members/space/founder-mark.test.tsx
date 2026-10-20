import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FounderMark } from './founder-mark'
import { FqSpaceChrome } from './space-chrome'

describe('FounderMark (LIVE-1019)', () => {
  it('draws the Frequency pill and carries no rate', () => {
    const html = renderToStaticMarkup(<FounderMark />)
    expect(html).toContain('fq-founder')
    expect(html).toContain('Founding Business')
    expect(html).not.toMatch(/\$|cents|rate/i)
  })

  it('sits inside the cover photo, not beside the name', () => {
    const html = renderToStaticMarkup(
      <FqSpaceChrome coverImage="/c.jpg" name="House of Fates" coverBadge={<FounderMark />} nav={null}>
        body
      </FqSpaceChrome>,
    )
    const cover = html.slice(html.indexOf('fqs-cover'), html.indexOf('fqs-ident'))
    expect(cover).toContain('fq-founder')
    expect(html.slice(html.indexOf('fqs-ident'))).not.toContain('fq-founder')
  })
})
