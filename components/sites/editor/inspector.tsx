'use client'

import { Input } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { useEffect, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { FieldForm, type FieldsSchema, type PushRequest } from '@/components/page-editor/mobile/field-form'
import type { Config, ContentItem, Data, Metadata } from '@/lib/page-editor/types'
import { isServiceListed, type SpaceOffering } from '@/lib/spaces/profile-data'
import { normalizeWebsiteFields } from '@/lib/sites/website-fields'
import { useWebsiteFeatureSource } from './feature-source-context'
import { FQ_EDITOR, k, on } from './skin'
import { sectionDeviceLayout, sectionLayoutPreset, SECTION_SPACING_STEPS, snapSectionSpacing } from '@/lib/sites/editor/layout'
import { cleanSectionAnchor, resolveWebsiteChrome, validWebsiteChrome, type WebsiteChrome, type Device, type SectionDisplay, type SectionTone, type SectionWidth } from '@/lib/sites/editor/state'
import { slugify } from '@/lib/utils'

// THE FREQUENCY DESIGN AND ADVANCED TABS (design_handoff/frequency/templates/admin/editor/editor.js renderInsp):
// background tone, content width, align, spacing in four steps, columns; then reveal on scroll, show on each
// device, the anchor and custom code. The controls write the same section layout the DAWN inspector writes.
const TONES: { id: SectionTone; label: string }[] = [{ id: 'white', label: 'White' }, { id: 'sand', label: 'Sand' }, { id: 'pastel', label: 'Pastel' }, { id: 'ink', label: 'Ink' }]
const WIDTHS: { id: SectionWidth; label: string }[] = [{ id: 'narrow', label: 'Narrow' }, { id: 'default', label: 'Default' }, { id: 'wide', label: 'Wide' }, { id: 'full', label: 'Full' }]
/** The design's four spacing steps (editor.js `PAD`): Tight 32, Snug 56, Default 88, Roomy 120 pixels. */
export const DESIGN_PAD = [32, 56, 88, 120] as const
const PAD_LABEL = ['Tight', 'Snug', 'Default', 'Roomy'] as const
const nearestPad = (px: number) => DESIGN_PAD.reduce<number>((best, step, index) => Math.abs(step - px) < Math.abs(DESIGN_PAD[best] - px) ? index : best, 0)
const DEVICE_LABEL: Record<Device, string> = { desktop: 'Desktop', tablet: 'Tablet', phone: 'Phone' }

function AnchorField({ value, fallback, onCommit }: { value?: string; fallback: string; onCommit: (anchor: string | undefined) => void }) {
  const [buffer, setBuffer] = useState<string | null>(null)
  const shown = buffer ?? value ?? ''
  return <div className="fld"><label htmlFor="we-anchor">Anchor link <em>#{cleanSectionAnchor(shown) ?? fallback}</em></label><Input id="we-anchor" className="in" value={shown} placeholder={fallback} maxLength={60} onChange={(e) => setBuffer(e.target.value)} onBlur={() => { if (buffer === null) return; onCommit(cleanSectionAnchor(buffer)); setBuffer(null) }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setBuffer(null) }} /></div>
}

export function WebsiteInspector({ config, block, doc, device, metadata, sourceSettingsHref, onChange, onDisplay, part, live: liveOverride, visibility, onVisibility, onBase }: {
  config: Config; block: ContentItem; doc: Data; device: Device; metadata?: Metadata; sourceSettingsHref?: string
  onChange: (props: Record<string, unknown>) => void; onDisplay: (value: SectionDisplay | null) => void
  /** Frequency only: whether the block reads Space data (lib/sites/editor/block-meta.ts), per-device
   *  visibility and its switch, and the base (all-device) tone / width / anchor. */
  live?: boolean; visibility?: Record<Device, boolean>; onVisibility?: (device: Device, visible: boolean) => void
  onBase?: (patch: Pick<SectionDisplay, 'tone' | 'width' | 'anchor'>) => void
  /** The Frequency inspector's tab (skin.ts): Content is the fields and their sources, Design the layout,
   *  spacing and breakpoints, Advanced the animation, custom code and visibility. Omitted (DAWN), every
   *  part renders in one column as it always has. The controls and their handlers are the same either way. */
  part?: 'content' | 'design' | 'advanced'
}) {
  const show = (p: 'content' | 'design' | 'advanced') => !part || part === p
  const [screens, setScreens] = useState<PushRequest[]>([])
  const editableProps = normalizeWebsiteFields(block).props
  const { load, error: sourceError } = useWebsiteFeatureSource()
  const schema = config.components[block.type]?.fields ?? {}
  // Match SpaceOfferings' canonical catalog precedence, including its listed-only public filter.
  const centralOfferings: SpaceOffering[] = block.type === 'SpaceOfferings' && Array.isArray(metadata?.space?.profile?.offerings) ? metadata.space.profile.offerings : []
  const catalogOfferings = centralOfferings.length > 0
  const shownOfferings = centralOfferings.filter((item) => isServiceListed(item) && (item.title || item.blurb))
  const liveFeatures = block.type === 'FeatureGrid' && ['offerings', 'events', 'memberships', 'tickets'].includes(String(block.props.source))
  useEffect(() => {
    if (liveFeatures && typeof block.props.id === 'string') void load(block.props.id, String(block.props.source))
  }, [liveFeatures, block.props.id, block.props.source, load])
  const fields = Object.fromEntries(Object.entries(schema).filter(([key, f]) => f.type !== 'slot' && f.type !== 'external' && !((liveFeatures || catalogOfferings) && key === 'items')).map(([key, field]) => [key, field.type === 'array' ? { ...field, getItemSummary: (item: unknown, index: number) => {
    const row = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    const title = [row.title, row.name].find((value) => typeof value === 'string' && value.trim())
    return typeof title === 'string' ? title.trim() : field.getItemSummary?.(item, index) || `Item ${index + 1}`
  } } : field])) as FieldsSchema
  const hasExternalSource = Object.values(schema).some((field) => field.type === 'external')
  const sub = screens.at(-1)
  const path = screens.flatMap((screen) => screen.path ?? [])
  const nestedValue = path.reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string | number, unknown>)[key] : undefined, editableProps)
  const changeNested = (value: Record<string, unknown>) => {
    if (!sub?.path) { sub?.onChange(value); return }
    if (!nestedValue || typeof nestedValue !== 'object') { setScreens([]); return }
    const next = structuredClone(editableProps)
    let parent: Record<string | number, unknown> = next
    for (const key of path.slice(0, -1)) parent = parent[key] as Record<string | number, unknown>
    parent[path.at(-1)!] = value
    onChange(next)
  }
  const display = sectionDeviceLayout(doc, block.props.id!, device)
  const live = /^(SpaceEvents|LiveEvents|SpaceCommunity|CirclesGrid|SpacePractices|SpaceFAQ)$/.test(block.type) || liveFeatures
  const fq = FQ_EDITOR && !!part
  const base = (doc.root.props?.websiteLayout?.[block.props.id!]?.desktop ?? {}) as SectionDisplay
  const grid = liveOverride || liveFeatures || Object.values(schema).some((field) => field.type === 'array')
  const moreLayout = <>
    {block.type === 'Zigzag' && <div className={k('we-field')}><span className="l">Layout</span><div className={k('we-actions')}>{(['left', 'right', 'stacked'] as const).map((preset) => <button type="button" className={k('we-action secondary')} key={preset} aria-pressed={preset === 'stacked' ? display.columns === 1 : display.columns !== 1 && (editableProps.mediaSide ?? 'left') === preset} onClick={() => { const next = sectionLayoutPreset(editableProps, display, preset); onChange(next.props); onDisplay(next.display) }}>{preset === 'left' ? 'Photo left' : preset === 'right' ? 'Photo right' : 'Stacked'}</button>)}</div></div>}
    <label className={k('we-field')}>Column gap <span>{display.gap === undefined ? 'Theme default' : `${display.gap}px`}</span><Input variant="seamless" aria-label="Column gap" type="range" min={0} max={96} step={4} value={display.gap ?? 0} onChange={(e) => onDisplay({ ...display, gap: Number(e.target.value) })} /></label>
    <label className={k('we-field')}>Heading size <span>{display.textSize ?? 0}px · 0 uses theme</span><Input variant="seamless" aria-label="Heading size" type="range" min={0} max={120} step={2} value={display.textSize ?? 0} onChange={(e) => onDisplay({ ...display, textSize: Number(e.target.value) })} /></label>
    {(display.padding !== undefined || display.gap !== undefined) && <button type="button" className={k('we-row')} onClick={() => onDisplay({ ...display, padding: undefined, gap: undefined })}>Use theme spacing</button>}
    {device !== 'desktop' && <button type="button" className={k('we-row')} onClick={() => onDisplay(null)}>Reset {device} overrides</button>}
  </>
  if (fq && part === 'content' && !sub) {
    // The design's content tab: the live note in its words, then the fields with their character counts.
    return <>
      {block.type === 'FeatureGrid' && <label className="fld"><span className="l">Content source</span><Select wrapperClassName="!contents [&>svg]:hidden" className="we-select" value={liveFeatures ? String(block.props.source) : 'custom'} onChange={(e) => onChange({ ...block.props, source: e.target.value })}><option value="custom">Authored cards</option><option value="offerings">Space offerings</option><option value="events">Space events</option><option value="memberships">Space memberships</option><option value="tickets">Space tickets</option></Select></label>}
      {liveFeatures && sourceError && <p className="note err" role="alert">{sourceError}</p>}
      {(live || liveOverride || catalogOfferings || hasExternalSource) && <div className="note"><b>Live from your Space.</b> Dates, hosts and prices update on their own. These fields set how they look here.{sourceSettingsHref && <> <a href={sourceSettingsHref} target="_blank" rel="noreferrer">Edit in your Space</a></>}</div>}
      {catalogOfferings && shownOfferings.length > 0 && <ul className="note">{shownOfferings.map((item, index) => <li key={index}>{item.title || item.blurb}</li>)}</ul>}
      <FieldForm counts fields={fields} value={editableProps} onChange={onChange} onPushScreen={(s) => setScreens((stack) => [...stack, s])} />
    </>
  }
  if (fq && part === 'design') {
    const pad = display.padding === undefined ? null : nearestPad(display.padding)
    return <>
      <div className="fld"><span className="l">Background <em>{base.tone ? TONES.find((t) => t.id === base.tone)?.label : 'Theme'}</em></span><div className="opts" role="group" aria-label="Background">{TONES.map((t) => <button type="button" key={t.id} className={on(base.tone === t.id).trim() || undefined} aria-pressed={base.tone === t.id} onClick={() => onBase?.({ tone: base.tone === t.id ? undefined : t.id })}><i data-tone={t.id} aria-hidden />{t.label}</button>)}</div></div>
      <div className="fld"><span className="l">Content width</span><div className="opts" role="group" aria-label="Content width">{WIDTHS.map((w) => { const active = (base.width ?? 'default') === w.id; return <button type="button" key={w.id} className={on(active).trim() || undefined} aria-pressed={active} onClick={() => onBase?.({ width: w.id === 'default' ? undefined : w.id })}><i data-width={w.id} aria-hidden />{w.label}</button> })}</div></div>
      <div className="fld"><span className="l">Align <em>{DEVICE_LABEL[device]}</em></span><div className="seg" role="group" aria-label="Align">{(['left', 'center'] as const).map((a) => { const active = (display.align ?? 'left') === a; return <button type="button" key={a} className={on(active).trim() || undefined} aria-pressed={active} onClick={() => onDisplay({ ...display, align: a })}>{a === 'left' ? 'Left' : 'Center'}</button> })}</div></div>
      <div className="fld"><label htmlFor="we-pad">Space above and below <em>{pad === null ? 'Theme' : PAD_LABEL[pad]}</em></label><div className="range"><Input id="we-pad" type="range" min={0} max={3} step={1} value={pad ?? 2} aria-valuetext={pad === null ? 'Theme spacing' : `${PAD_LABEL[pad]}, ${DESIGN_PAD[pad]} pixels`} onChange={(e) => onDisplay({ ...display, padding: DESIGN_PAD[Number(e.target.value)] })} /><output htmlFor="we-pad">{pad === null ? 'Theme' : `${DESIGN_PAD[pad]}px`}</output></div></div>
      {grid && <div className="fld"><label htmlFor="we-cols">Columns <em>{device}</em></label><div className="range"><Input id="we-cols" type="range" min={1} max={4} step={1} value={display.columns ?? 3} onChange={(e) => onDisplay({ ...display, columns: Number(e.target.value) })} /><output htmlFor="we-cols">{display.columns ?? 'Theme'}</output></div></div>}
      <details className="drw"><summary>More layout</summary>{moreLayout}</details>
    </>
  }
  if (fq && part === 'advanced') {
    return <>
      <div className="fld"><span className="l">Reveal on scroll</span><div className="seg" role="group" aria-label="Reveal on scroll">{([['none', 'None'], ['fade', 'Fade'], ['rise', 'Rise']] as const).map(([id, label]) => { const active = (display.animation ?? 'none') === id; return <button type="button" key={id} className={on(active).trim() || undefined} aria-pressed={active} onClick={() => onDisplay({ ...display, animation: id })}>{label}</button> })}</div></div>
      {visibility && onVisibility && <div className="fld"><span className="l">Show on</span>{(['desktop', 'tablet', 'phone'] as const).map((d) => <div className="tg" key={d}><span>{DEVICE_LABEL[d]}</span><button type="button" className={`sw${on(visibility[d])}`} role="switch" aria-checked={visibility[d]} aria-label={`Show on ${d}`} onClick={() => onVisibility(d, !visibility[d])} /></div>)}</div>}
      {onBase && <AnchorField key={block.props.id} value={base.anchor} fallback={slugify(String(config.components[block.type]?.label ?? block.type))} onCommit={(anchor) => onBase({ anchor })} />}
      <details className="drw"><summary>Custom code</summary><label className="fld">Class name<Input className="in" value={display.className ?? ''} onChange={(e) => onDisplay({ ...display, className: e.target.value })} placeholder="my-section" /></label><label className="fld">Data attributes<Input className="in" value={display.attributes ?? ''} onChange={(e) => onDisplay({ ...display, attributes: e.target.value })} placeholder="data-campaign=autumn" /></label></details>
    </>
  }
  return <>
    {show('content') && <>
    {block.type === 'FeatureGrid' && <label className={k('we-field')}>Content source<Select wrapperClassName="!contents [&>svg]:hidden" className="we-select" value={liveFeatures ? String(block.props.source) : 'custom'} onChange={(e) => onChange({ ...block.props, source: e.target.value })}><option value="custom">Authored cards</option><option value="offerings">Space offerings</option><option value="events">Space events</option><option value="memberships">Space memberships</option><option value="tickets">Space tickets</option></Select></label>}
    {liveFeatures && sourceError && <p className={k('we-note')} role="alert">{sourceError}</p>}
    {catalogOfferings && <div className={k('we-proposal')}><strong>Live Space offerings</strong><p>These cards come from your Space’s services catalog. Edit titles, details and prices there; this section controls their presentation.</p><ul>{shownOfferings.map((item, index) => <li key={index}>{item.title || item.blurb}</li>)}</ul>{shownOfferings.length === 0 && <p>No listed offerings are visible.</p>}{sourceSettingsHref && <a className={k('we-row')} href={sourceSettingsHref} target="_blank" rel="noreferrer">Edit Space offerings</a>}</div>}
    {hasExternalSource && <div className={k('we-proposal')}><strong>Connected content</strong><p>This content is managed in your Space. Website controls change its presentation.</p>{sourceSettingsHref && <a className={k('we-row')} href={sourceSettingsHref} target="_blank" rel="noreferrer">Edit source content</a>}</div>}
    {live && <div className={k('we-proposal')}><strong>Live from your Space</strong><p>Published dates and listings update automatically. These fields control how they appear here.</p></div>}
    {sub && <button type="button" className={k('we-row')} onClick={() => setScreens((s) => s.slice(0, -1))}><ChevronLeft size={16} />{sub.title}</button>}
    <FieldForm fields={sub?.fields ?? fields} value={sub ? (sub.path && nestedValue && typeof nestedValue === 'object' ? nestedValue as Record<string, unknown> : sub.value) : editableProps} onChange={sub ? changeNested : onChange} onPushScreen={(s) => setScreens((stack) => [...stack, s])} />
    </>}
    {show('design') && <>
    {block.type === 'Zigzag' && <div className={k('we-field')}><span>Layout</span><div className={k('we-actions')}>{(['left', 'right', 'stacked'] as const).map((preset) => <button type="button" className={k('we-action secondary')} key={preset} aria-pressed={preset === 'stacked' ? display.columns === 1 : display.columns !== 1 && (editableProps.mediaSide ?? 'left') === preset} onClick={() => { const next = sectionLayoutPreset(editableProps, display, preset); onChange(next.props); onDisplay(next.display) }}>{preset === 'left' ? 'Photo left' : preset === 'right' ? 'Photo right' : 'Stacked'}</button>)}</div></div>}
    <details className={k('we-drawer')} open><summary>Spacing</summary>
      <label className={k('we-field')}>Column gap <span>{display.gap === undefined ? 'Theme default' : `${display.gap}px`}</span><Input variant="seamless" aria-label="Column gap" type="range" min={0} max={96} step={4} value={display.gap ?? 0} onChange={(e) => onDisplay({ ...display, gap: Number(e.target.value) })} /></label>
      <label className={k('we-field')}>Space above and below <span>{display.padding === undefined ? 'Theme default' : `${display.padding}px`}</span><Input variant="seamless" aria-label="Section spacing" type="range" min={0} max={SECTION_SPACING_STEPS.length - 1} step={1} value={Math.max(0, SECTION_SPACING_STEPS.findIndex((step) => step === snapSectionSpacing(display.padding ?? 0)))} onChange={(e) => onDisplay({ ...display, padding: SECTION_SPACING_STEPS[Number(e.target.value)] })} /></label>
      <button type="button" className={k('we-row')} onClick={() => onDisplay({ ...display, padding: undefined, gap: undefined })}>Use theme spacing</button>
    </details>
    <details className={k('we-drawer')}><summary>Breakpoints</summary><div className={k('we-note')}>{device === 'desktop' ? 'Desktop is the base layout. Tablet and phone inherit it.' : `You are editing ${device} only. Unchanged values inherit the desktop layout.`}</div>
      <label className={k('we-field')}>Columns<Select wrapperClassName="!contents [&>svg]:hidden" className="we-select" value={display.columns ?? ''} onChange={(e) => onDisplay({ ...display, columns: e.target.value ? Number(e.target.value) : undefined })}><option value="">Theme default</option>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</Select></label>
      <label className={k('we-field')}>Heading size <span>{display.textSize ?? 0}px · 0 uses theme</span><Input variant="seamless" aria-label="Heading size" type="range" min={0} max={120} step={2} value={display.textSize ?? 0} onChange={(e) => onDisplay({ ...display, textSize: Number(e.target.value) })} /></label>
      <label className={k('we-field')}>Text alignment<Select wrapperClassName="!contents [&>svg]:hidden" className="we-select" value={display.align ?? ''} onChange={(e) => onDisplay({ ...display, align: e.target.value ? e.target.value as 'left' | 'center' | 'right' : undefined })}><option value="">Theme default</option><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></Select></label>
      {device !== 'desktop'  && <button type="button" className={k('we-row')} onClick={() => onDisplay(null)}>Reset {device} overrides</button>}
    </details>
    </>}
    {show('advanced') && <>
    <details className={k('we-drawer')}><summary>Animation</summary><label className={k('we-field')}>Reveal on scroll<Select wrapperClassName="!contents [&>svg]:hidden" className="we-select" value={display.animation ?? 'none'} onChange={(e) => onDisplay({ ...display, animation: e.target.value as 'none' | 'fade' | 'rise' })}><option value="none">None</option><option value="fade">Fade in</option><option value="rise">Rise in</option></Select></label></details>
    <details className={k('we-drawer')}><summary>Custom code</summary><label className={k('we-field')}>Class name<Input variant="seamless" value={display.className ?? ''} onChange={(e) => onDisplay({ ...display, className: e.target.value })} placeholder="my-section" /></label><label className={k('we-field')}>Data attributes<Input variant="seamless" value={display.attributes ?? ''} onChange={(e) => onDisplay({ ...display, attributes: e.target.value })} placeholder="data-campaign=autumn" /></label><p className={k('we-note')}>Theme classes and data attributes apply to this section.</p></details>
    <details className={k('we-drawer')}><summary>Visibility</summary><label className={k('we-field')}><span><Input variant="seamless" type="checkbox" className="we-check" checked={display.hidden ?? false} onChange={(e) => onDisplay({ ...display, hidden: e.target.checked })} /> Hide on {device === 'desktop' ? 'all devices' : device}</span></label></details>
    </>}
  </>
}


function ChromeTextField({ label, value, maxLength, onCommit }: { label: string; value: string; maxLength: number; onCommit: (value: string) => boolean }) {
  const [buffer, setBuffer] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const commit = () => {
    if (buffer === null) return
    if (onCommit(buffer)) { setBuffer(null); setError(false) } else setError(true)
  }
  return <label className={k('we-field')}>{label}<Input variant="seamless" aria-label={label} aria-invalid={error || undefined} maxLength={maxLength} value={buffer ?? value} onChange={(event) => { setBuffer(event.target.value); setError(false) }} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() } else if (event.key === 'Escape') { setBuffer(null); setError(false) } }} />{error && <span role="alert">{label === 'Header button link' ? 'Use a website path, #anchor or HTTPS address.' : 'Enter a name or button label.'}</span>}</label>
}

/** Global website chrome edits stay in the website draft; linked live sources remain authoritative. */
export function WebsiteChromeInspector({ area, chrome, defaults, sourceSettingsHref, onChange, onTheme, onPages, onMenu }: {
  area: 'header' | 'footer'; chrome?: WebsiteChrome
  defaults: { name: string; tagline: string | null; cta: { label: string; href: string } | null }
  sourceSettingsHref?: string; onChange: (value: WebsiteChrome) => void
  onTheme: () => void; onPages: () => void
  /** Opens the shared menu and logo editor (components/spaces/site-menu-editor.tsx). */
  onMenu?: () => void
}) {
  const value = resolveWebsiteChrome({ chrome }, defaults)
  const commit = (next: WebsiteChrome) => { if (!validWebsiteChrome(next)) return false; onChange(next); return true }
  const reset = (key: keyof WebsiteChrome) => { const next = { ...chrome }; delete next[key]; onChange(next) }
  return <>
    <p className={k('we-note')}>Changes apply to the {area} across every website page.</p>
    <ChromeTextField label="Website name" maxLength={100} value={value.name} onCommit={(name) => commit({ ...chrome, name })} />
    {chrome?.name !== undefined && <button type="button" className={k('we-row')} onClick={() => reset('name')}>Use Space name</button>}
    {area === 'header' ? <>
      {onMenu && <button type="button" className={k('we-row')} onClick={onMenu}>Edit menu and logo</button>}
      <button type="button" className={k('we-row')} onClick={onTheme}>Edit logo and brand colors</button>
      <div className={k('we-field')}><span>Header button</span><label><Input variant="seamless" type="checkbox" aria-label="Show header button" checked={value.cta !== null} onChange={(e) => onChange({ ...chrome, cta: e.target.checked ? defaults.cta ?? { label: 'Contact', href: '/contact' } : null })} /> Show button</label></div>
      {value.cta && <>
        <ChromeTextField label="Header button label" maxLength={80} value={value.cta.label} onCommit={(label) => commit({ ...chrome, cta: { ...value.cta!, label } })} />
        <ChromeTextField label="Header button link" maxLength={2000} value={value.cta.href} onCommit={(href) => commit({ ...chrome, cta: { ...value.cta!, href } })} />
      </>}
      {chrome && Object.prototype.hasOwnProperty.call(chrome, 'cta') && <button type="button" className={k('we-row')} onClick={() => reset('cta')}>Use Space header button</button>}
    </> : <>
      <label className={k('we-field')}>Footer tagline<Input variant="seamless" aria-label="Footer tagline" maxLength={500} value={value.tagline ?? ''} onChange={(e) => onChange({ ...chrome, tagline: e.target.value || null })} /></label>
      {chrome && Object.prototype.hasOwnProperty.call(chrome, 'tagline') && <button type="button" className={k('we-row')} onClick={() => reset('tagline')}>Use Space tagline</button>}
      <p className={k('we-note')}>The copyright year updates automatically. The Frequency Partner link identifies your website provider.</p>
    </>}
    <button type="button" className={k('we-row')} onClick={onPages}>Edit page navigation</button>
    <div className={k('we-proposal')}><strong>Live from your Space</strong><p>The seasonal strip, next event and authorized admin links use their original sources.</p>{sourceSettingsHref && <a className={k('we-row')} href={sourceSettingsHref} target="_blank" rel="noreferrer">Open Space settings</a>}</div>
  </>
}
