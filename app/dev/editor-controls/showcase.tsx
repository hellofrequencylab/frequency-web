'use client'

import { useState, type ReactNode } from 'react'
import { BlockEditPanel, FieldEditor } from '@/components/entity-blocks/block-edit-panel'
import { HERO_FIELDS } from '@/lib/spaces/hero-config'
import {
  AlignControl,
  ButtonOrientationControl,
  ColorControl,
  ControlGroup,
  ControlRow,
  HeightControl,
  MarginControl,
  PickerControl,
  Segmented,
  ShadowControl,
  Toggle,
  ToggleRow,
  type AlignValue,
  type ButtonOrientationValue,
  type HeightValue,
  type ShadowValue,
} from '@/components/entity-blocks/controls/field-controls'
import type { BlockStyle, MarginStep, TextColorToken } from '@/lib/entity-blocks/block-content'

// The showcase surface (dev-only). A left column of every PRIMITIVE with live state + a JSON readout, and a
// right column of a real redesigned BlockEditPanel for a few representative blocks, so the whole control
// surface can be exercised without auth. Token-driven, no hex.

/** A titled demo cell: a heading, the live control(s), and a small value readout. */
function Demo({ title, note, value, children }: { title: string; note?: string; value?: string; children: ReactNode }) {
  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-bold text-text">{title}</h3>
        {value !== undefined && (
          <code className="rounded bg-surface-elevated px-1.5 py-0.5 text-3xs text-muted">{value}</code>
        )}
      </div>
      {note && <p className="text-2xs text-subtle">{note}</p>}
      <div className="max-w-xs">{children}</div>
    </div>
  )
}

function PrimitivesColumn() {
  const [align, setAlign] = useState<AlignValue>('start')
  const [height, setHeight] = useState<HeightValue>('medium')
  const [orient, setOrient] = useState<ButtonOrientationValue>('row')
  const [color, setColor] = useState<TextColorToken>('accent')
  const [shadow, setShadow] = useState<ShadowValue>('soft')
  const [seg, setSeg] = useState('weekly')
  const [toggle, setToggle] = useState(true)
  const [mt, setMt] = useState<MarginStep>('none')
  const [mb, setMb] = useState<MarginStep>('md')
  const [picked, setPicked] = useState<string[]>([])

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold text-text">Control primitives (C6)</h2>

      <Demo title="Toggle" value={String(toggle)} note="Minimal on/off switch (role=switch).">
        <ToggleRow label="Show button" checked={toggle} onChange={setToggle} />
      </Demo>

      <Demo title="Alignment" value={align} note="Left | Center | Right icon-group.">
        <ControlRow label="Align">
          <AlignControl value={align} onSelect={setAlign} />
        </ControlRow>
      </Demo>

      <Demo title="Height" value={height} note="3-way Short | Medium | Tall.">
        <ControlRow label="Height">
          <HeightControl value={height} onSelect={setHeight} />
        </ControlRow>
      </Demo>

      <Demo title="Button orientation" value={orient} note="Side by side | Stacked.">
        <ControlRow label="Buttons">
          <ButtonOrientationControl value={orient} onSelect={setOrient} />
        </ControlRow>
      </Demo>

      <Demo title="Color (token / accent)" value={color} note="Token + accent swatches; no raw hex.">
        <ControlRow label="Color">
          <ColorControl value={color} onSelect={setColor} />
        </ControlRow>
      </Demo>

      <Demo title="Shadow" value={shadow} note="Off | Soft | Strong presets.">
        <ControlRow label="Shadow">
          <ShadowControl value={shadow} onSelect={setShadow} />
        </ControlRow>
      </Demo>

      <Demo title="Segmented (generic)" value={seg} note="Declared-options single select.">
        <ControlRow label="Cadence">
          <Segmented
            ariaLabel="Cadence"
            options={[
              { value: 'daily', label: 'Daily' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'monthly', label: 'Monthly' },
            ]}
            value={seg}
            onSelect={setSeg}
          />
        </ControlRow>
      </Demo>

      <Demo title="Margin (C3)" value={`mt:${mt} mb:${mb}`} note="Compact top/bottom spacing.">
        <MarginControl top={mt} bottom={mb} onTop={setMt} onBottom={setMb} />
      </Demo>

      <Demo
        title="Data-source picker (item 5)"
        value={picked.length ? picked.join(',') : 'all'}
        note="Multi-select of a Space's live items; empty means show all."
      >
        <PickerControl
          label="Offerings to feature"
          items={[
            { id: 'Sound bath', label: 'Sound bath' },
            { id: 'Morning flow', label: 'Morning flow' },
            { id: 'Breathwork', label: 'Breathwork' },
          ]}
          selected={picked}
          onChange={setPicked}
        />
      </Demo>

      <Demo title="Picker empty state (item 5)" note="No items yet shows a Create link.">
        <PickerControl
          label="Team to feature"
          items={[]}
          selected={[]}
          createHref="#"
          createLabel="Add a team member"
          onChange={() => {}}
        />
      </Demo>

      <Demo title="Standalone Toggle + Group">
        <ControlGroup label="More" defaultOpen>
          <ControlRow label="Standalone">
            <Toggle ariaLabel="Standalone" checked={toggle} onChange={setToggle} />
          </ControlRow>
        </ControlGroup>
      </Demo>
    </div>
  )
}

/** A live BlockEditPanel for one block id, holding its own content + style state (mirrors the builder). */
function PanelDemo({ id, label }: { id: string; label: string }) {
  const [content, setContent] = useState<Record<string, unknown>>({})
  const [style, setStyle] = useState<BlockStyle>({})
  const [hidden, setHidden] = useState(false)
  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-bold text-text">{label}</h3>
        <code className="rounded bg-surface-elevated px-1.5 py-0.5 text-3xs text-muted">{id}</code>
      </div>
      <BlockEditPanel
        id={id}
        content={content}
        style={style}
        hidden={hidden}
        editHref={null}
        onContent={setContent}
        onStyle={setStyle}
        onToggleHide={() => setHidden((h) => !h)}
      />
      <details className="[&_summary::-webkit-details-marker]:hidden">
        <summary className="cursor-pointer text-2xs font-semibold uppercase tracking-wide text-subtle">
          State
        </summary>
        <pre className="mt-1 overflow-x-auto rounded bg-surface-elevated p-2 text-3xs text-muted">
          {JSON.stringify({ content, style, hidden }, null, 2)}
        </pre>
      </details>
    </div>
  )
}

/** The pinned Top Hero editor's control surface (PR: editable-top-hero), rendered field-by-field through the
 *  SAME FieldEditor the block panel uses — height + button orientation are the C6 primitives, the rest are
 *  text / textarea / url inputs. Local state only (no save), so the hero editor can be exercised without auth. */
function HeroPanelDemo() {
  const [values, setValues] = useState<Record<string, unknown>>({})
  const set = (key: string, v: unknown) => {
    setValues((prev) => {
      const next = { ...prev }
      if (v === undefined || v === '') delete next[key]
      else next[key] = v
      return next
    })
  }
  return (
    <div className="space-y-2 rounded-xl border border-primary/40 bg-surface p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-bold text-text">Top hero (pinned, fixed first section)</h3>
        <code className="rounded bg-surface-elevated px-1.5 py-0.5 text-3xs text-muted">hero</code>
      </div>
      <div className="space-y-3">
        {HERO_FIELDS.map((field) => (
          <FieldEditor key={field.key} field={field} value={values[field.key]} onChange={(v) => set(field.key, v)} />
        ))}
      </div>
      <details className="[&_summary::-webkit-details-marker]:hidden">
        <summary className="cursor-pointer text-2xs font-semibold uppercase tracking-wide text-subtle">
          State
        </summary>
        <pre className="mt-1 overflow-x-auto rounded bg-surface-elevated p-2 text-3xs text-muted">
          {JSON.stringify(values, null, 2)}
        </pre>
      </details>
    </div>
  )
}

function PanelsColumn() {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold text-text">Redesigned block panels (C1 / C4 / C5 / C7)</h2>
      <HeroPanelDemo />
      <PanelDemo id="callout" label="Callout (content + text style + spacing)" />
      <PanelDemo id="heading" label="Heading (text-bearing)" />
      <PanelDemo id="photoHero" label="Banner (height + content-layout primitives)" />
      <PanelDemo id="displayHeading" label="Display heading (text design block)" />
      <PanelDemo id="prose" label="Prose (text design block)" />
      <PanelDemo id="offerings" label="Offerings (data block)" />
    </div>
  )
}

export function EditorControlsShowcase() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-lg font-bold text-text">Editor control system</h1>
        <p className="text-sm text-muted">
          Dev-only showcase of the reusable block-editor control primitives and the redesigned inspector
          panel. Every control is token-driven and keyboard-operable. Not linked, noindex, dev-only.
        </p>
      </header>
      <div className="grid gap-6 lg:grid-cols-2">
        <PrimitivesColumn />
        <PanelsColumn />
      </div>
    </main>
  )
}
