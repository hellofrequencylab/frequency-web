import {describe,it,expect,vi} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {frequencyHeaderDefaults} from '@/lib/frequency/header-defaults'
vi.mock('@/lib/menus/actions',()=>({ensureMenu:vi.fn(),seedMenuFromDefaults:vi.fn(),setMenuColumns:vi.fn()}))
import {MenuLayoutPanel} from './menu-layout-panel'
import {isGridSurface} from './known-routes'
describe('header editing preserves kit geometry and offers content reset',()=>{
 it('hides ineffective column/placement edits only on the public header',()=>{
  const html=renderToStaticMarkup(<MenuLayoutPanel initialMenu={frequencyHeaderDefaults()} surfaceKey="header" surfaceLabel="Public header"/>)
  expect(html).toContain('Seed from site defaults');expect(html).toContain('keeps the Frequency layout')
  expect(html).not.toContain('id="cols-header"');expect(isGridSurface('header')).toBe(false)
  expect(isGridSurface('admin_header')).toBe(true)
 })
})
