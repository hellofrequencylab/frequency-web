'use client'

import { useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { FieldForm, type FieldsSchema, type PushRequest } from '@/components/page-editor/mobile/field-form'
import type { Config, ContentItem, Data } from '@/lib/page-editor/types'
import { sectionDisplay, type Device, type SectionDisplay } from '@/lib/sites/editor/state'

export function WebsiteInspector({ config, block, doc, device, onChange, onDisplay }: {
  config: Config; block: ContentItem; doc: Data; device: Device
  onChange: (props: Record<string, unknown>) => void; onDisplay: (value: SectionDisplay | null) => void
}) {
  const [screens, setScreens] = useState<PushRequest[]>([])
  const schema = config.components[block.type]?.fields ?? {}
  const fields = Object.fromEntries(Object.entries(schema).filter(([, f]) => f.type !== 'slot')) as FieldsSchema
  const sub = screens.at(-1)
  const display = sectionDisplay(doc, block.props.id!, device)
  const live = /^(SpaceEvents|LiveEvents|SpaceCommunity|CirclesGrid|SpacePractices)$/.test(block.type)
  return <>
    {live && <div className="we-proposal"><strong>Live from your Space</strong><p>Published dates and listings update automatically. These fields control how they appear here.</p></div>}
    {sub && <button type="button" className="we-row" onClick={() => setScreens((s) => s.slice(0, -1))}><ChevronLeft size={16} />{sub.title}</button>}
    <FieldForm fields={sub?.fields ?? fields} value={sub?.value ?? block.props} onChange={sub?.onChange ?? onChange} onPushScreen={(s) => setScreens((stack) => [...stack, s])} />
    <details className="we-drawer" open><summary>Spacing</summary>
      <label className="we-field">Column gap <span>{display.gap ?? 24}px</span><input aria-label="Column gap" type="range" min={0} max={96} step={4} value={display.gap ?? 24} onChange={(e) => onDisplay({ ...display, gap: Number(e.target.value) })} /></label>
      <label className="we-field">Space above and below <span>{display.padding ?? 0}px</span><input aria-label="Section spacing" type="range" min={0} max={160} step={8} value={display.padding ?? 0} onChange={(e) => onDisplay({ ...display, padding: Number(e.target.value) })} /></label>
    </details>
    <details className="we-drawer"><summary>Breakpoints</summary><div className="we-note">{device === 'desktop' ? 'Desktop is the base layout. Tablet and phone inherit it.' : `You are editing ${device} only. Unchanged values inherit the desktop layout.`}</div>
      <label className="we-field">Columns<select value={display.columns ?? (device === 'phone' ? 1 : 2)} onChange={(e) => onDisplay({ ...display, columns: Number(e.target.value) })}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
      <label className="we-field">Heading size <span>{display.textSize ?? 0}px · 0 uses theme</span><input aria-label="Heading size" type="range" min={0} max={120} step={2} value={display.textSize ?? 0} onChange={(e) => onDisplay({ ...display, textSize: Number(e.target.value) })} /></label>
      <label className="we-field">Text alignment<select value={display.align ?? 'left'} onChange={(e) => onDisplay({ ...display, align: e.target.value as 'left' | 'center' | 'right' })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
      {device !== 'desktop'  && <button type="button" className="we-row" onClick={() => onDisplay(null)}>Reset {device} overrides</button>}
    </details>
    <details className="we-drawer"><summary>Animation</summary><label className="we-field">Reveal on scroll<select value={display.animation ?? 'none'} onChange={(e) => onDisplay({ ...display, animation: e.target.value as 'none' | 'fade' | 'rise' })}><option value="none">None</option><option value="fade">Fade in</option><option value="rise">Rise in</option></select></label></details>
    <details className="we-drawer"><summary>Custom code</summary><label className="we-field">Class name<input value={display.className ?? ''} onChange={(e) => onDisplay({ ...display, className: e.target.value })} placeholder="my-section" /></label><label className="we-field">Data attributes<input value={display.attributes ?? ''} onChange={(e) => onDisplay({ ...display, attributes: e.target.value })} placeholder="data-campaign=autumn" /></label><p className="we-note">Theme classes and data attributes apply to this section.</p></details>
    <details className="we-drawer"><summary>Visibility</summary><label className="we-field"><span><input type="checkbox" style={{ width: 'auto' }} checked={display.hidden ?? false} onChange={(e) => onDisplay({ ...display, hidden: e.target.checked })} /> Hide on {device === 'desktop' ? 'all devices' : device}</span></label></details>
  </>
}
