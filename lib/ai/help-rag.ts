// RAG support answer (docs/SUPPORT-SYSTEM.md §5, ADR-067). Grounded ONLY in
// retrieved help chunks, cited, confidence-gated, in Vera's voice — and it always
// degrades to a deflect (links + "talk to a human") when AI is off/over-budget,
// retrieval is weak, or the model call fails. Server-only.

import { after } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { helpHref } from '@/lib/help/content'
import { completeText } from './complete'
import { embedText } from './embed'
import { aiAvailable, featureOverBudget, recordAiUsage, logHelpQuery } from './usage'

const FEATURE = 'help-search'
const MATCH_COUNT = 6
// Below this top cosine similarity we don't trust retrieval — deflect to a human
// rather than answer. Tunable once we have real query data (gte-small, normalized).
const MIN_SIMILARITY = 0.35

export interface HelpCitation {
  category: string
  slug: string
  heading: string
  href: string
}

export interface HelpAnswer {
  /** The grounded answer, or null when we deflect to a human. */
  answer: string | null
  citations: HelpCitation[]
  /** Top retrieval similarity (0–1). */
  confidence: number
  deflected: boolean
}

interface Chunk {
  category: string
  slug: string
  heading: string
  content: string
  similarity: number
}

export const HELP_SYSTEM = `You are Vera, the resident guide for Frequency — a platform for real-world community built on local "circles" and in-person "practices". You are warm, direct, and brief; never gushy.

Answer the member's question USING ONLY the help excerpts provided. If the excerpts don't clearly contain the answer, do NOT guess — say you're not sure and suggest talking to a host or the team. Never invent features, prices, or steps. Keep it to 2–4 short sentences. Do not add inline citations or links; the relevant articles are shown to the member separately.`

/** Build the grounded prompt from retrieved chunks. Pure — unit-tested. */
export function buildHelpMessages(
  question: string,
  chunks: Chunk[],
): { system: string; messages: { role: 'user'; content: string }[] } {
  const context = chunks
    .map((c, i) => `[${i + 1}] ${c.category}/${c.slug}${c.heading ? ` — ${c.heading}` : ''}\n${c.content}`)
    .join('\n\n')
  const content = `Help excerpts:\n\n${context}\n\n---\nMember question: ${question}\n\nAnswer using only the excerpts above.`
  return { system: HELP_SYSTEM, messages: [{ role: 'user', content }] }
}

/** One citation per source article (deduped, in retrieval order). Pure — tested. */
export function toCitations(chunks: { category: string; slug: string; heading: string }[]): HelpCitation[] {
  const seen = new Set<string>()
  const out: HelpCitation[] = []
  for (const c of chunks) {
    const key = `${c.category}/${c.slug}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ category: c.category, slug: c.slug, heading: c.heading, href: helpHref(c.category, c.slug) })
  }
  return out
}

function deflect(chunks: Chunk[], confidence: number): HelpAnswer {
  return { answer: null, citations: toCitations(chunks.slice(0, 3)), confidence, deflected: true }
}

/** Answer a help question via RAG, or deflect. Never throws. Logs every real
 *  query (demand side of the living-docs loop) — best-effort. */
export async function answerHelpQuestion(question: string, profileId?: string | null): Promise<HelpAnswer> {
  const q = question.trim()
  if (!q) return { answer: null, citations: [], confidence: 0, deflected: true }

  const result = await resolveHelpAnswer(q, profileId)
  // Log after the response is sent (next/server `after`), not as a floating
  // promise: in serverless a bare `void` insert is not guaranteed to run before
  // the function suspends, so queries went unrecorded (the demand-side signal was
  // silently lost). `after` keeps it off the response path AND guarantees it runs.
  after(() =>
    logHelpQuery({
      question: q,
      confidence: result.confidence,
      answered: result.answer !== null,
      deflected: result.deflected,
      topCategory: result.citations[0]?.category ?? null,
      topSlug: result.citations[0]?.slug ?? null,
      profileId,
    }),
  )
  return result
}

async function resolveHelpAnswer(q: string, profileId?: string | null): Promise<HelpAnswer> {
  // Kill switch + budget cap. Fail closed to the deflect path.
  if (!(await aiAvailable()) || (await featureOverBudget(FEATURE))) return deflect([], 0)

  // Retrieve.
  let chunks: Chunk[] = []
  try {
    const embedding = await embedText(q)
    const admin = createAdminClient() as unknown as SupabaseClient
    const { data } = await admin.rpc('match_help_chunks', {
      query_embedding: `[${embedding.join(',')}]`,
      match_count: MATCH_COUNT,
      min_similarity: 0,
    })
    chunks = (data as Chunk[] | null) ?? []
  } catch {
    return deflect([], 0)
  }

  const top = chunks[0]?.similarity ?? 0
  if (chunks.length === 0 || top < MIN_SIMILARITY) return deflect(chunks, top)

  // Answer, grounded.
  try {
    const { system, messages } = buildHelpMessages(q, chunks)
    const res = await completeText({ system, messages, tier: 'haiku', maxTokens: 400, cacheSystem: true })
    if (!res.text) return deflect(chunks, top)
    after(() => recordAiUsage({ feature: FEATURE, model: res.tier, usage: res.usage, costUsd: res.costUsd, profileId }))
    return { answer: res.text, citations: toCitations(chunks), confidence: top, deflected: false }
  } catch {
    return deflect(chunks, top)
  }
}
