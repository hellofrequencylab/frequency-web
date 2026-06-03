// Server-only embedding via the gte-small Edge Function (supabase/functions/embed).
// 384-d, key-free, no external vendor (docs/SUPPORT-SYSTEM.md, ADR-067). The SAME
// model embeds the help index and the live query — consistency is mandatory.

import { createAdminClient } from '@/lib/supabase/admin'

export const EMBED_DIM = 384

/** Embed a string to a 384-d unit vector. Throws on failure (caller falls back). */
export async function embedText(text: string): Promise<number[]> {
  const admin = createAdminClient()
  const { data, error } = await admin.functions.invoke('embed', { body: { text } })
  if (error) throw new Error(`embed function failed: ${error.message}`)

  const embedding = (data as { embedding?: unknown })?.embedding
  if (!Array.isArray(embedding) || embedding.length !== EMBED_DIM) {
    throw new Error(`embed: expected a ${EMBED_DIM}-d vector, got ${Array.isArray(embedding) ? embedding.length : typeof embedding}`)
  }
  return embedding as number[]
}
