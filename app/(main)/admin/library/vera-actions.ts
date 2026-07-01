'use server'

import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { completeText, AiUnavailableError } from '@/lib/ai/complete'
import { withVoice } from '@/lib/ai/voice'
import { aiAvailable, featureOverBudget, recordAiUsage } from '@/lib/ai/usage'
import { getRootSpaceId } from '@/lib/library/store'
import { sanitizeSvg } from '@/lib/library/svg-sanitize'

// Vera wizard: generate a new Loom "card" (illustration) as inline SVG in the house style,
// then save it to the library. Janitor-gated, budget-gated, and the generated SVG is
// validated by the allowlist sanitizer both here and again at render (defense in depth).

const FEATURE = 'loom-illustration'

export type LoomCardMode = 'graphic' | 'icon'

// The shared house-style vocabulary both modes draw from. Kept in sync with the code
// kit in components/marketing/illustrations/index.tsx + components/on-air/icons.tsx.
const GRAPHIC_SYSTEM = withVoice(`You are Vera, drawing a new spot illustration "card" for Frequency's asset library (The Loom), in the exact house style.

OUTPUT CONTRACT — follow EXACTLY:
- Output ONLY one inline <svg> element. No prose, no markdown fences, no XML declaration, no comments.
- Root must be: <svg viewBox="0 0 240 150" fill="none" role="img" aria-label="SHORT DESCRIPTION">…</svg>
- Allowed tags ONLY: svg, g, path, rect, circle, ellipse, line, polyline, polygon. Never use text, script, style, image, use, a, or any href/xlink.
- COLOR IS CLASSES ONLY — never a hex, rgb, or inline style. Put color on class="…" using ONLY these DAWN tokens (append /NN for opacity, e.g. fill-primary/40):
  fills: fill-primary, fill-primary-strong, fill-primary-bg, fill-signal, fill-signal-strong, fill-signal-bg, fill-surface, fill-border, fill-border-strong, fill-on-primary, fill-on-signal
  strokes: stroke-primary, stroke-primary-strong, stroke-signal, stroke-signal-strong, stroke-surface, stroke-border, stroke-border-strong, stroke-on-signal
- Style: flat shapes plus simple line-art. Rounded ends (stroke-linecap="round" stroke-linejoin="round"). Stroke widths 3 to 5. Amber (primary) is the lead color, teal (signal) is the accent. No gradients, filters, shadows, or photorealism.
- Keep the motif centered in a safe zone so it reads small. A handful of clean shapes, not dozens.

HOUSE MOTIF VOCABULARY (reach for these building blocks — they are how the kit is drawn):
- Frame: a rounded backdrop panel — <rect x="12" y="12" width="216" height="126" rx="22" class="fill-primary-bg"/>.
- Person (head + shoulders): <g class="fill-signal"><circle cx="0" cy="0" r="9"/><path d="M-15 30 a15 16 0 0 1 30 0 z"/></g>, translate/scale into place.
- Ripples / broadcast: concentric circles or arcs at falling opacity (opacity 0.9 → 0.3) radiating from a point.
- Rays: short lines fanning out from a center (a sun/spark).
- Check: <path d="M147 89l4 4 8-9" class="stroke-on-signal" stroke-width="3" .../> on a filled signal chip = "done/confirmed".
- Flame (streak): teardrop <path d="M0 -16 C5 -8 9 -3 9 4 A9 9 0 1 1 -9 4 C-9 -3 -5 -8 0 -16 Z"/>.
- Cards/lists: rounded rects with fill-surface + stroke-border; bar charts: a rising row of rounded rects.
- Devices: a phone (tall rounded rect) or calendar (rect + a fill-primary header band) as the container for content.

STYLE EXAMPLE (match this simplicity):
<svg viewBox="0 0 240 150" fill="none" role="img" aria-label="A booking sheet with a slot confirmed"><rect x="64" y="14" width="112" height="122" rx="14" class="fill-surface stroke-border-strong" stroke-width="3"/><path d="M64 40v-12a14 14 0 0 1 14-14h84a14 14 0 0 1 14 14v12z" class="fill-primary"/><rect x="78" y="52" width="84" height="18" rx="9" class="fill-primary-bg"/><rect x="78" y="80" width="84" height="18" rx="9" class="fill-signal"/><path d="M147 89l4 4 8-9" class="stroke-on-signal" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>

Draw exactly what the operator asks, as literally and simply as possible.`)

// Small UI marks — the On Air icon-kit language (components/on-air/icons.tsx): a 24×24
// grid, currentColor stroke, round caps, reads at 16–18px.
const ICON_SYSTEM = withVoice(`You are Vera, drawing a small UI icon for Frequency's asset library (The Loom), in the house icon-kit language.

OUTPUT CONTRACT — follow EXACTLY:
- Output ONLY one inline <svg> element. No prose, no markdown fences, no XML declaration, no comments.
- Root must be EXACTLY: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="SHORT DESCRIPTION">…</svg>
- Allowed tags ONLY: svg, g, path, rect, circle, ellipse, line, polyline, polygon. Never use text, script, style, image, use, a, or any href/xlink.
- COLOR: use currentColor only. Draw with strokes; for a soft accent you may fill a shape with fill="currentColor" fill-opacity="0.18". Never a hex, rgb, class, or inline color style.
- Style: one clean glyph, centered, 2–5 shapes max, generous 2px padding from the edges. No text, no gradients, no shadows. It must read at 16px.

STYLE EXAMPLE (match this weight — a live "on air" dot in its ripples):
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="On air"><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/><path d="M8.2 8.4a5.4 5.4 0 0 0 0 7.2M15.8 8.4a5.4 5.4 0 0 1 0 7.2"/><path d="M5 5.4a9.6 9.6 0 0 0 0 13.2M19 5.4a9.6 9.6 0 0 1 0 13.2" opacity="0.55"/></svg>

Draw exactly what the operator asks, as one simple glyph.`)

/** Generate (but do not save) a new card. Returns the sanitized SVG for preview. */
export async function generateLoomCard(
  prompt: string,
  mode: LoomCardMode = 'graphic',
): Promise<{ svg: string } | { error: string }> {
  const ctx = await requireAdmin('janitor')

  const clean = (prompt || '').trim().slice(0, 400)
  if (clean.length < 3) return { error: 'Describe the card you want Vera to draw.' }
  if (!(await aiAvailable())) return { error: 'AI is turned off right now.' }
  if (await featureOverBudget(FEATURE)) return { error: "Vera's illustration budget is used up for today." }

  try {
    const res = await completeText({
      system: mode === 'icon' ? ICON_SYSTEM : GRAPHIC_SYSTEM,
      messages: [{ role: 'user', content: mode === 'icon' ? `Draw an icon: ${clean}` : `Draw: ${clean}` }],
      tier: 'sonnet',
      maxTokens: 1600,
      cacheSystem: true,
    })
    after(() =>
      recordAiUsage({ feature: FEATURE, model: res.tier, usage: res.usage, costUsd: res.costUsd, profileId: ctx.profileId }),
    )

    const checked = sanitizeSvg(res.text)
    if (!checked.ok) {
      return { error: `Vera's drawing didn't pass the safety check (${checked.error}). Try rewording it.` }
    }
    return { svg: checked.svg }
  } catch (e) {
    if (e instanceof AiUnavailableError) return { error: 'AI is unavailable right now.' }
    return { error: 'Could not draw that. Try again in a moment.' }
  }
}

/** Save a generated card into the library as a code-drawn `element` (SVG in `config.svg`). */
export async function saveLoomCard(input: {
  title: string
  svg: string
  prompt?: string
  mode?: LoomCardMode
}): Promise<{ ok: true } | { error: string }> {
  await requireAdmin('janitor')

  const title = (input.title || '').trim().slice(0, 200)
  if (!title) return { error: 'Give the card a title.' }

  const checked = sanitizeSvg(input.svg || '')
  if (!checked.ok) return { error: `That SVG didn't pass the safety check (${checked.error}).` }

  const spaceId = await getRootSpaceId()
  if (!spaceId) return { error: 'No root space found; cannot scope the card.' }

  const isIcon = input.mode === 'icon'
  const slug =
    `vera-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`.slice(0, 90) +
    `-${Date.now().toString(36)}`

  // eslint-disable-next-line no-restricted-syntax -- library_assets isn't in lib/database.types.ts yet (types regen is a follow-up integrator step); genuinely untyped table access
  const dbh = createAdminClient() as unknown as SupabaseClient
  const { error } = await dbh.from('library_assets').insert({
    space_id: spaceId,
    kind: 'element',
    title,
    slug,
    category: isIcon ? 'Vera icons' : 'Vera cards',
    tags: isIcon ? ['vera', 'generated', 'icon'] : ['vera', 'generated'],
    status: 'approved',
    visibility: 'public',
    config: { source: 'vera', mode: input.mode ?? 'graphic', prompt: (input.prompt || '').slice(0, 400), svg: checked.svg },
  })
  if (error) return { error: error.message }

  revalidatePath('/admin/library')
  return { ok: true }
}
