import { expect, it } from 'vitest'
import { memberJoinedYear } from './member-year'

it.each([
  ['2024-01-01T00:00:00Z', 2024],
  ['2023-12-31T23:30:00-02:00', 2024],
  ['2024-01-01T00:30:00+02:00', 2023],
  ['', null],
  ['not-a-date', null],
  [null, null],
] as const)('resolves the UTC membership year of %s as %s', (input, expected) => {
  expect(memberJoinedYear(input)).toBe(expected)
})
