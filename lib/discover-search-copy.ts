/** Add a public city to a search title without repeating it when the host already used it. */
export function localSearchTitle(name: string, city?: string | null): string {
  const place = city?.trim()
  if (!place) return name
  const words = (value: string) => value.toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  const location = words(place)
  if (!location || ` ${words(name)} `.includes(` ${location} `)) return name
  return `${name} in ${place}`
}

export function searchDescription(value: string | null, fallback: string): string {
  const text = value?.replace(/\s+/g, ' ').trim() || fallback
  if (text.length <= 155) return text
  const clipped = text.slice(0, 152).trimEnd()
  const lastSpace = clipped.lastIndexOf(' ')
  return `${lastSpace >= 120 ? clipped.slice(0, lastSpace) : clipped}…`
}
