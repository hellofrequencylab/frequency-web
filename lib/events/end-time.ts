// One instant-based end rule for event pages and crawl eligibility. No timezone or database imports.
export function eventHasEnded(event: { starts_at: string | null; ends_at?: string | null }, now = Date.now()): boolean {
  return new Date(event.ends_at ?? event.starts_at ?? '').getTime() < now
}
