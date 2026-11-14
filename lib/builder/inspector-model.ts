import type { defineBlock } from '@/lib/entity-blocks/define-block'
import type { BuilderDevice } from './state'

type InspectorBlock = Pick<ReturnType<typeof defineBlock>, 'fields' | 'surfaces'>
type InspectorSurface = keyof InspectorBlock['surfaces']

/** Use the field metadata checked against the content schema and apply the surface's field list. */
export function inspectorFields(block: InspectorBlock, surface: InspectorSurface): InspectorBlock['fields'] {
  const display = block.surfaces[surface]
  if (!display) return []
  const allowed = display.fields
  if (allowed === '*') return block.fields
  return block.fields.filter(field => allowed.includes(field.key))
}

export type InspectorDeviceValues<Values extends object> = Readonly<
  Partial<Record<BuilderDevice, Readonly<Partial<Values>>>>
>

function ownValue<Values extends object, Key extends keyof Values>(
  values: Readonly<Partial<Values>> | undefined,
  key: Key,
): Values[Key] | undefined {
  return values && Object.hasOwn(values, key) ? values[key] : undefined
}

/** Tablet and phone each inherit desktop. The source identifies where the current value was set. */
export function resolveInspectorValue<Values extends object, Key extends keyof Values>(
  values: InspectorDeviceValues<Values>,
  device: BuilderDevice,
  key: Key,
): { value: Values[Key] | undefined; source: BuilderDevice | null } {
  const deviceValue = ownValue(values[device], key)
  if (deviceValue !== undefined) return { value: deviceValue, source: device }

  const desktopValue = ownValue(values.desktop, key)
  return { value: desktopValue, source: desktopValue === undefined ? null : 'desktop' }
}

/** Reset one field to desktop inheritance and drop the device entry if it has no other overrides. */
export function resetInspectorOverride<Values extends object, Key extends keyof Values>(
  values: InspectorDeviceValues<Values>,
  device: Exclude<BuilderDevice, 'desktop'>,
  key: Key,
): InspectorDeviceValues<Values> {
  const current = values[device]
  if (!current || !Object.hasOwn(current, key)) return values

  const deviceValues = { ...current }
  delete deviceValues[key]
  const next = { ...values }
  if (Object.keys(deviceValues).length > 0) next[device] = deviceValues
  else delete next[device]
  return next
}

/** Write one field on one device. Desktop is the base every other device inherits from. */
export function setInspectorValue<Values extends object, Key extends keyof Values>(
  values: InspectorDeviceValues<Values>,
  device: BuilderDevice,
  key: Key,
  value: Values[Key],
): InspectorDeviceValues<Values> {
  return { ...values, [device]: { ...values[device], [key]: value } }
}
