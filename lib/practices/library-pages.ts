/** URL input is untrusted; bound the database range to a signed 32-bit offset. */
export function practiceLibraryPage(value: unknown): number {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return 1
  const page = Number(value)
  return Number.isSafeInteger(page) && page <= Math.floor(2147483647 / 60) ? page : 1
}

export function pillarPracticePageHref(slug: string, page: number): string {
  const base = `/discover/practices/pillar/${encodeURIComponent(slug)}`
  return page > 1 ? `${base}?page=${page}` : base
}
