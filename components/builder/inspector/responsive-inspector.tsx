'use client'

// THE RESPONSIVE INSPECTOR, LIVE (PROG-E5). Draws one block's fields from its contract (the server hands over
// inspectorFieldViews) for the device the canvas shows. Desktop is the base; tablet and phone inherit it per field.
// Every field says where its value comes from, and a device override has its own reset (resetInspectorOverride),
// which clears that one field on that one device and nothing else.
//
// Touch native: nothing here appears on hover. Every control and every reset is at least 44px tall. Below the
// lg breakpoint the form lives in a bottom sheet opened by a full-width button; at lg and up it sits beside the
// canvas. The form reflows by its own width with a container query, not the window's, so the same form reads
// right in the sheet and in the side column.
//
// Dark: mounted only by the staff-only, EDITOR_CANVAS-gated /pages/canvas route. Values are local to the page.
//
// Rich text and images (item 4, lib/builder/inspector-values.ts): long text a block stores as inline markup shows
// its words, never the markup, and formatting it carries is drawn as formatting; an image field draws its picture,
// whether a typed address or a library asset holds it.

import { useId, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { BottomSheet } from '@/components/page-editor/mobile/bottom-sheet'
import { CANVAS_DEVICES } from '@/lib/builder/canvas-viewport'
import {
  resetInspectorOverride,
  resolveInspectorValue,
  setInspectorValue,
  type InspectorDeviceValues,
} from '@/lib/builder/inspector-model'
import type { InspectorFieldView } from '@/lib/builder/inspector-fields'
import type { BuilderDevice } from '@/lib/builder/state'
import { imageAddress, inspectorImage, plainToRich, richHasMarks, richRuns, richWords } from '@/lib/builder/inspector-values'

type FieldValue = string | boolean
type Values = InspectorDeviceValues<Record<string, FieldValue>>
/** What a stored bag may hold beyond what the inspector writes: an image held as a library reference. */
type StoredValues = InspectorDeviceValues<Record<string, unknown>>

const deviceName = (device: BuilderDevice) => CANVAS_DEVICES.find((d) => d.id === device)?.label ?? device

/** Where the value on this device comes from, in words. */
function provenance(device: BuilderDevice, source: BuilderDevice | null): string {
  if (source === null) return device === 'desktop' ? 'Not set yet' : 'Not set yet, so it follows desktop'
  if (source === device) return device === 'desktop' ? 'Set on desktop' : `Set for ${deviceName(device).toLowerCase()}`
  return 'Inherited from desktop'
}

/** Long text stored as inline markup. Plain words are edited as words and saved in the stored form. Words that carry
 *  bold, italic or a link show that formatting, and editing them here is a choice the owner makes, because a plain
 *  edit keeps the words and drops the formatting. */
function RichTextField({ id, noteId, label, value, onChange }: { id: string; noteId: string; label: string; value: unknown; onChange: (next: string) => void }) {
  const [plain, setPlain] = useState(false)
  if (!plain && richHasMarks(value)) {
    return (
      <div className="space-y-2">
        <div id={id} role="textbox" aria-label={label} aria-readonly="true" aria-multiline="true" aria-describedby={noteId} tabIndex={0} className="whitespace-pre-wrap rounded-control border border-border p-3 text-body text-text" data-rich-preview="">
          {richRuns(value).map((run, index) => {
            let node: ReactNode = run.text
            if (run.link) node = <span className="underline">{node}</span>
            if (run.italic) node = <em>{node}</em>
            if (run.bold) node = <strong>{node}</strong>
            return <span key={index}>{node}</span>
          })}
        </div>
        <p className="mu-hint">This text has bold, italic or a link. Editing it here keeps the words and removes that formatting.</p>
        <Button type="button" variant="secondary" className="min-h-11" onClick={() => setPlain(true)}>Edit as plain text</Button>
      </div>
    )
  }
  return (
    <Textarea
      id={id}
      aria-describedby={noteId}
      rows={3}
      value={richWords(value)}
      onChange={(event) => onChange(plainToRich(event.target.value))}
    />
  )
}

/** One picture: drawn from its address or its library asset, with an address box to replace it and a way to remove it. */
function ImageField({ id, noteId, label, placeholder, value, onChange }: { id: string; noteId: string; label: string; placeholder?: string; value: unknown; onChange: (next: string) => void }) {
  const image = inspectorImage(value)
  const address = imageAddress(value)
  return (
    <div className="space-y-2">
      {image.src ? (
        // eslint-disable-next-line @next/next/no-img-element -- an owner picture on an arbitrary host, drawn as stored
        <img src={image.src} alt={image.alt || label} className="max-h-40 w-full rounded-card border border-border object-cover" data-inspector-image="" />
      ) : address ? (
        <p className="mu-hint" role="status">This address cannot be shown here. Use an https address.</p>
      ) : null}
      {image.library ? <p className="mu-hint">From your library. Paste an address below to use a different picture.</p> : null}
      <Input
        id={id}
        aria-describedby={noteId}
        type="url"
        className="min-h-11"
        placeholder={placeholder}
        value={address}
        onChange={(event) => onChange(event.target.value)}
      />
      {address ? (
        <Button type="button" variant="ghost" className="min-h-11" aria-label={`Remove ${label}`} onClick={() => onChange('')}>Remove picture</Button>
      ) : null}
    </div>
  )
}

function InspectorForm({
  fields, elsewhere, device, values, onChange,
}: {
  fields: readonly InspectorFieldView[]
  elsewhere: number
  device: BuilderDevice
  values: Values
  onChange: (values: Values) => void
}) {
  const base = useId()
  return (
    <div className="@container">
      <p className="mb-3 text-meta text-muted">
        {device === 'desktop'
          ? 'Editing desktop. Tablet and phone follow these values until you change them there.'
          : `Editing ${deviceName(device).toLowerCase()}. Fields you leave alone follow desktop.`}
      </p>
      <ul className="grid gap-4 @md:grid-cols-2">
        {fields.map((field) => {
          const id = `${base}-${field.key}`
          const noteId = `${id}-source`
          const { value, source } = resolveInspectorValue(values as StoredValues, device, field.key)
          const overridden = device !== 'desktop' && source === device
          const set = (next: FieldValue) => onChange(setInspectorValue(values, device, field.key, next))
          return (
            <li key={field.key} className={field.kind === 'textarea' ? 'space-y-1 @md:col-span-2' : 'space-y-1'} data-field={field.key} data-source={source ?? 'none'}>
              <label htmlFor={id} className="mu-label">{field.label}</label>
              {field.kind === 'toggle' ? (
                <div className="flex min-h-11 items-center">
                  <Switch
                    id={id}
                    aria-describedby={noteId}
                    checked={typeof value === 'boolean' ? value : field.defaultValue}
                    onCheckedChange={set}
                  />
                </div>
              ) : field.kind === 'choice' ? (
                <Select
                  id={id}
                  aria-describedby={noteId}
                  className="min-h-11"
                  value={typeof value === 'string' ? value : field.defaultValue}
                  options={field.options}
                  onChange={(event) => set(event.target.value)}
                />
              ) : field.kind === 'url' && field.image ? (
                <ImageField id={id} noteId={noteId} label={field.label} placeholder={field.placeholder} value={value} onChange={set} />
              ) : field.kind === 'textarea' && field.rich ? (
                <RichTextField id={id} noteId={noteId} label={field.label} value={value} onChange={set} />
              ) : field.kind === 'textarea' ? (
                <Textarea
                  id={id}
                  aria-describedby={noteId}
                  rows={2}
                  placeholder={field.placeholder}
                  value={typeof value === 'string' ? value : ''}
                  onChange={(event) => set(event.target.value)}
                />
              ) : (
                <Input
                  id={id}
                  aria-describedby={noteId}
                  type={field.kind === 'url' ? 'url' : 'text'}
                  className="min-h-11"
                  placeholder={field.placeholder}
                  value={typeof value === 'string' ? value : ''}
                  onChange={(event) => set(event.target.value)}
                />
              )}
              <div className="flex min-h-11 flex-wrap items-center justify-between gap-2">
                <span id={noteId} className="mu-hint">{provenance(device, source)}</span>
                {overridden ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11"
                    aria-label={`Reset ${field.label} to desktop`}
                    onClick={() => onChange(resetInspectorOverride(values, device, field.key))}
                  >
                    Reset to desktop
                  </Button>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
      {elsewhere > 0 ? (
        <p className="mt-3 text-meta text-muted">
          {elsewhere === 1 ? 'One more field is edited on the canvas.' : `${elsewhere} more fields are edited on the canvas.`}
        </p>
      ) : null}
    </div>
  )
}

export function ResponsiveInspector({
  title, fields, elsewhere = 0, device, values, onChange,
}: {
  /** The block's name, the inspector's heading. */
  title: string
  fields: readonly InspectorFieldView[]
  /** How many of the surface's fields this inspector leaves to other editors. */
  elsewhere?: number
  device: BuilderDevice
  values: Values
  onChange: (values: Values) => void
}) {
  const [sheet, setSheet] = useState(false)
  const form = <InspectorForm fields={fields} elsewhere={elsewhere} device={device} values={values} onChange={onChange} />
  const heading = `${title} on ${deviceName(device).toLowerCase()}`
  return (
    <section aria-label="Block inspector" className="min-w-0">
      <div className="hidden lg:block">
        <h2 className="mb-2 text-body font-semibold text-text">{heading}</h2>
        {form}
      </div>
      <div className="lg:hidden">
        <Button type="button" variant="secondary" className="min-h-11 w-full" aria-haspopup="dialog" aria-expanded={sheet} onClick={() => setSheet(true)}>
          Edit {title.toLowerCase()}
        </Button>
        <BottomSheet
          open={sheet}
          onClose={() => setSheet(false)}
          title={heading}
          size="tall"
          headerAction={<Button type="button" variant="ghost" className="min-h-11" onClick={() => setSheet(false)}>Done</Button>}
        >
          {form}
        </BottomSheet>
      </div>
    </section>
  )
}
