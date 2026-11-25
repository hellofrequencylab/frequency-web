import 'server-only'

// THE FOUNDER SEATS, READ (LIVE-2542). The numbering rule is pure and lives in ./founding-year.ts
// (numberFounderSeats); this file only reads the rows it numbers: every founding_members row that carries
// `meta.founding_year` (written by ./founding-year-record.ts from a paid session, or set by the crew for a
// Space that paid its year in cash). Through the admin client behind app-layer reads: a seat count is
// public, the rows behind it are not.
//
// FAIL-SAFE to null: a read error is "unknown", never "zero taken" (which would show 150 left) and never
// "full" (which would stop every Founding Year sale on a blip). Each caller says what unknown means.

import { createAdminClient } from '@/lib/supabase/admin'
import { numberFounderSeats, type FounderSeatRow } from './founding-year'

type SeatQuery = PromiseLike<{ data: Record<string, unknown>[] | null; error: unknown }>

/** Every Founding Year row, in the shape the numbering reads. Null when unreadable. */
async function founderSeatRows(): Promise<FounderSeatRow[] | null> {
  try {
    const db = createAdminClient() as unknown as {
      from(t: string): { select(c: string): { not(c: string, op: string, v: null): SeatQuery } }
    }
    const { data, error } = await db.from('founding_members').select('id, space_id, meta').not('meta->founding_year', 'is', null)
    if (error || !data) return null
    const rows: FounderSeatRow[] = []
    for (const r of data) {
      const fy = ((r.meta ?? {}) as { founding_year?: { paid_at?: unknown } }).founding_year
      if (typeof r.space_id !== 'string' || typeof fy?.paid_at !== 'string') continue
      rows.push({ spaceId: r.space_id, paidAt: fy.paid_at, id: String(r.id) })
    }
    return rows
  } catch {
    return null
  }
}

/** How many of the 150 Founder seats are taken, or null when the count cannot be read. */
export async function founderSeatsTaken(): Promise<number | null> {
  const rows = await founderSeatRows()
  return rows === null ? null : numberFounderSeats(rows).size
}

/** A Space's Founder seat number, or null when it holds none (or the rows cannot be read). */
export async function founderSeatFor(spaceId: string): Promise<number | null> {
  const rows = await founderSeatRows()
  return rows === null ? null : (numberFounderSeats(rows).get(spaceId) ?? null)
}
