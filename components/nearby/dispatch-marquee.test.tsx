import {describe,it,expect} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {readFileSync} from 'node:fs'
import {DispatchMarquee} from './dispatch-marquee'
const item={id:'dispatch-id',title:'Real community update',authorName:'Member',timeLabel:'today',linked:true}
describe('active Nearby dispatch surface (not a global ticker replacement)',()=>{
 it('omits an empty strip',()=>expect(renderToStaticMarkup(<DispatchMarquee items={[]}/>)).toBe(''))
 it('links the real dispatch and hides the repeated animation copy from keyboard and AT',()=>{
  const html=renderToStaticMarkup(<DispatchMarquee items={[item]}/>)
  expect(html).toContain('aria-label="Latest Dispatches"')
  expect(html.match(/href="\/nearby\/dispatch-id"/g)).toHaveLength(2)
  expect(html).toContain('aria-hidden="true"');expect(html).toContain('tabindex="-1"')
 })
 it('ships pointer/keyboard pause and reduced-motion rules in the active CSS',()=>{
  const css=readFileSync('app/themes/frequency/members-community.css','utf8')
  expect(css).toContain('.ay-ticker:focus-within .animate-marquee{animation-play-state:paused}')
  expect(css).toContain('@media (prefers-reduced-motion:reduce)')
  expect(css).toContain('.ay-ticker-track{overflow-x:auto}')
 })
})
