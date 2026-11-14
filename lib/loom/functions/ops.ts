// THE LOOM PRIMITIVES' BODIES (PROG-E9, EDITOR-ARCHITECTURE §5, ADR-975). Layer 1: engineers write these, CI
// gates them, and an operator can only compose them. Each is pure and total over its declared kinds: no IO,
// no throw, no reach outside its arguments. A new primitive is a PR here plus a row in ./primitives.ts, and
// `check:loom-integrity` (arm B) proves the row names this module and a real export.

const MAX_TEXT = 2000

const clampText = (s: string): string => (s.length > MAX_TEXT ? s.slice(0, MAX_TEXT) : s)

export function trimText(args: { value: string }): string {
  return args.value.trim()
}

export function truncateText(args: { value: string; max: number }): string {
  const max = Math.max(0, Math.min(MAX_TEXT, Math.floor(args.max)))
  if (args.value.length <= max) return args.value
  return max <= 1 ? args.value.slice(0, max) : `${args.value.slice(0, max - 1).trimEnd()}…`
}

export function joinText(args: { first: string; second: string; separator: string }): string {
  if (!args.first) return clampText(args.second)
  if (!args.second) return clampText(args.first)
  return clampText(`${args.first}${args.separator}${args.second}`)
}

export function textIsEmpty(args: { value: string }): boolean {
  return args.value.trim().length === 0
}

export function textLength(args: { value: string }): number {
  return args.value.length
}

export function countList(args: { value: readonly unknown[] }): number {
  return args.value.length
}

export function atLeast(args: { value: number; floor: number }): boolean {
  return args.value >= args.floor
}

export function smaller(args: { first: number; second: number }): number {
  return Math.min(args.first, args.second)
}

export function allOf(args: { first: boolean; second: boolean }): boolean {
  return args.first && args.second
}

export function negate(args: { value: boolean }): boolean {
  return !args.value
}

export function chooseText(args: { when: boolean; then: string; otherwise: string }): string {
  return args.when ? args.then : args.otherwise
}
