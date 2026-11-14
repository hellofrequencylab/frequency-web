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

import { useId, useState } from 'react'
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

type FieldValue = string | boolean
type Values = InspectorDeviceValues<Record<string, FieldValue>>

const deviceName = (device: BuilderDevice) => CANVAS_DEVICES.find((d) => d.id === device)?.label ?? device

/** Where the value on this device comes from, in words. */
function provenance(device: BuilderDevice, source: BuilderDevice | null): string {
  if (source === null) return device === 'desktop' ? 'Not set yet' : 'Not set yet, so it follows desktop'
  if (source === device) return device === 'desktop' ? 'Set on desktop' : `Set for ${deviceName(device).toLowerCase()}`
  return 'Inherited from desktop'
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
          const { value, source } = resolveInspectorValue(values, device, field.key)
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
                {overridden && device !== 'desktop' ? (
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
