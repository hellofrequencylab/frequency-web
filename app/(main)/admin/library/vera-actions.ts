'use server'

import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { completeText, completeRaw, AiUnavailableError } from '@/lib/ai/complete'
import type { ModelTier } from '@/lib/ai/models'
import { withVoice } from '@/lib/ai/voice'
import { aiAvailable, featureOverBudget, recordAiUsage } from '@/lib/ai/usage'
import { getRootSpaceId } from '@/lib/library/store'
import { sanitizeSvg, extractSvg } from '@/lib/library/svg-sanitize'

// Vera wizard: generate a new Loom "card" (illustration) as inline SVG in the house style,
// then save it to the library. Janitor-gated, budget-gated, and the generated SVG is
// validated by the allowlist sanitizer both here and again at render (defense in depth).

const FEATURE = 'loom-illustration'

export type LoomCardMode = 'graphic' | 'icon'

// The shared house-style rules + motif vocabulary. Kept in sync with the code kit in
// components/marketing/illustrations/index.tsx + components/on-air/icons.tsx. Reused by the
// create, redraw, and (implicitly) review prompts so Vera draws the same way every time.
const HOUSE_STYLE = `HOUSE STYLE — Frequency's spot illustrations (The Loom):

OUTPUT CONTRACT — follow EXACTLY:
- Output ONLY one inline <svg> element. No prose, no markdown fences, no XML declaration, no comments.
- Root must be: <svg viewBox="0 0 240 150" fill="none" role="img" aria-label="SHORT DESCRIPTION">…</svg>
- Allowed tags ONLY: svg, g, path, rect, circle, ellipse, line, polyline, polygon. Never use text, script, style, image, use, a, or any href/xlink.
- COLOR IS CLASSES ONLY — never a hex, rgb, or inline style. Put color on class="…" using ONLY these DAWN tokens (append /NN for opacity, e.g. fill-primary/40):
  fills: fill-primary, fill-primary-strong, fill-primary-bg, fill-signal, fill-signal-strong, fill-signal-bg, fill-surface, fill-border, fill-border-strong, fill-on-primary, fill-on-signal
  strokes: stroke-primary, stroke-primary-strong, stroke-signal, stroke-signal-strong, stroke-surface, stroke-border, stroke-border-strong, stroke-on-signal
- Style: flat shapes plus simple line-art. Rounded ends (stroke-linecap="round" stroke-linejoin="round"). Stroke widths 3 to 5. Amber (primary) is the lead color, teal (signal) is the accent. No gradients, filters, shadows, or photorealism.
- Keep the motif centered in a safe zone so it reads small. A handful of clean shapes, not dozens.

DRAW WHAT IT IS — build the subject from simple, recognizable geometry, part by part, not by nudging path numbers. Match the ORIGINAL's level of abstraction: these are MINIMAL flat illustrations, so keep it minimal.
- Figures are simple: a round head (a filled circle) and limbs/torso as a few clean rounded strokes — a tidy stick/flat figure. Recognize the action from the POSE, not from detail. NEVER add faces, eyes, fingers, toes, muscles, hair, or shading — realistic detail makes it look creepy/alien and off-brand. "Make it look human" means a clean, well-proportioned simple figure, NOT a realistic body.
- A RUNNER = round head + a torso leaning slightly forward + two legs bent at the knee mid-stride (one reaching forward, one pushing back) + two arms swinging (one forward, one back) + a couple of short motion lines behind. A few strokes, correct proportions, clearly running.
- A building/storefront: a rectangle body + a roof/awning + a door + windows.
- A calendar: a rounded rect with a colored header band + a grid of dots, one marked.

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
<svg viewBox="0 0 240 150" fill="none" role="img" aria-label="A booking sheet with a slot confirmed"><rect x="64" y="14" width="112" height="122" rx="14" class="fill-surface stroke-border-strong" stroke-width="3"/><path d="M64 40v-12a14 14 0 0 1 14-14h84a14 14 0 0 1 14 14v12z" class="fill-primary"/><rect x="78" y="52" width="84" height="18" rx="9" class="fill-primary-bg"/><rect x="78" y="80" width="84" height="18" rx="9" class="fill-signal"/><path d="M147 89l4 4 8-9" class="stroke-on-signal" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`

const GRAPHIC_SYSTEM = withVoice(
  `You are Vera, drawing a new spot illustration "card" for Frequency's asset library (The Loom), in the exact house style.\n\n${HOUSE_STYLE}\n\nDraw exactly what the operator asks, as literally and simply as possible.`,
)

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

// Vera as a design assistant. Editing SVG by nudging path numbers produces monsters, so instead
// she goes through her ORIGINAL creation process: (1) LOOK at the rendered image and say what it
// depicts, part by part, and how to change it; (2) REDRAW the whole thing cleanly from that
// understanding, in the house style — same viewBox, palette, and composition.

const REDRAW_PLAN_SYSTEM = withVoice(`You are Vera, a design assistant studying an illustration before you redraw it.

Look CAREFULLY at the image. Name what it depicts, part by part, in concrete shapes (e.g. "a runner: round head, torso leaning forward, two legs bent in a stride, two arms swinging, motion lines, a track line"). Note anything that reads wrong today. Then say concretely how you will redraw it to satisfy the instruction while keeping the flat house style, the same palette, and the same overall composition.

Reply in 1-4 short sentences. Do NOT output any SVG or code.`)

const REDRAW_SYSTEM = withVoice(
  `You are Vera, REDRAWING one of Frequency's existing spot illustrations so it reads clearly — not patching path numbers. You are given the ORIGINAL svg (use it only for the viewBox, the palette/token classes, and the rough layout) and a short plan describing what it depicts and the change to make.

Rebuild the WHOLE illustration cleanly from that understanding, so the subject is instantly recognizable and the requested change is applied. Keep the same viewBox and color approach (the same DAWN token classes, or currentColor if that's what the original uses). Preserve the parts the instruction does not mention. Do NOT copy the original's path data — draw the shapes fresh from clean geometry.

STAY ON STYLE — this is the whole point:
- Match the original's simplicity and level of abstraction exactly. If it was a minimal flat/stick figure, keep it a minimal flat/stick figure — just fix the pose/proportions. Do not add realism or detail the original didn't have.
- The failure mode to avoid: adding faces, fingers, muscles, extra joints, or off proportions turns a clean figure into a creepy "alien." Fewer, cleaner strokes always win. When unsure, draw LESS.
- The result must look like it belongs in the same set as the original kit art.

${HOUSE_STYLE}

Output ONLY the finished <svg>.`,
)

/** Edit an existing SVG the way Vera would create it: look → understand → redraw. `imageBase64`
 *  (a PNG of the current render, from the client) lets her SEE what she's changing. */
export async function editLoomSvg(
  currentSvg: string,
  instruction: string,
  imageBase64?: string,
): Promise<{ svg: string } | { error: string }> {
  const ctx = await requireAdmin('janitor')

  const inbound = sanitizeSvg(currentSvg || '')
  if (!inbound.ok) return { error: "That graphic can't be edited (it didn't pass the safety check)." }
  const ask = (instruction || '').trim().slice(0, 400)
  if (ask.length < 3) return { error: 'Tell Vera what to change.' }
  if (!(await aiAvailable())) return { error: 'AI is turned off right now.' }
  if (await featureOverBudget(FEATURE)) return { error: "Vera's design budget is used up for today." }

  const image = (imageBase64 || '').trim()
  const usage = { inputTokens: 0, outputTokens: 0 }
  let costUsd = 0
  let tier: ModelTier = 'sonnet'

  try {
    // (1) Understand: look at the render and plan the redraw (skipped if we have no image).
    let plan = ''
    if (image && image.length < 8_000_000) {
      const p = await completeRaw({
        system: REDRAW_PLAN_SYSTEM,
        tier: 'sonnet',
        maxTokens: 500,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: `INSTRUCTION: ${ask}\n\nHere is the illustration right now. What is it (part by part), and how will you redraw it to satisfy the instruction?` },
              { type: 'image', source: { type: 'base64', media_type: 'image/png', data: image } },
            ],
          },
        ],
      })
      plan = p.text.trim().slice(0, 800)
      usage.inputTokens += p.usage.inputTokens
      usage.outputTokens += p.usage.outputTokens
      costUsd += p.costUsd
      tier = p.tier
    }

    // (2) Redraw: rebuild the whole illustration from the understanding, in the house style.
    const draw = await completeRaw({
      system: REDRAW_SYSTEM,
      tier: 'sonnet',
      maxTokens: 2200,
      cacheSystem: true,
      messages: [
        {
          role: 'user',
          content: `ORIGINAL SVG (viewBox, palette, and rough layout reference only):\n${inbound.svg}\n\n${
            plan ? `WHAT IT DEPICTS + YOUR PLAN:\n${plan}\n\n` : ''
          }INSTRUCTION: ${ask}\n\nRedraw the whole illustration cleanly so it clearly reads as intended.`,
        },
      ],
    })
    usage.inputTokens += draw.usage.inputTokens
    usage.outputTokens += draw.usage.outputTokens
    costUsd += draw.costUsd
    tier = draw.tier

    after(() => recordAiUsage({ feature: FEATURE, model: tier, usage, costUsd, profileId: ctx.profileId }))

    const checked = sanitizeSvg(draw.text)
    if (!checked.ok) {
      return { error: `Vera's edit didn't pass the safety check (${checked.error}). Try rewording it.` }
    }
    return { svg: checked.svg }
  } catch (e) {
    if (e instanceof AiUnavailableError) return { error: 'AI is unavailable right now.' }
    return { error: 'Could not make that change. Try again in a moment.' }
  }
}

/** Persist an edited SVG onto an existing element asset (stored in config.svg). This makes a
 *  code-drawn registry element render its edited copy instead; clearing config.svg would
 *  restore the original. Janitor-gated. */
export async function saveElementSvg(assetId: string, svg: string): Promise<{ ok: true } | { error: string }> {
  await requireAdmin('janitor')
  if (!assetId) return { error: 'Missing asset id.' }

  const checked = sanitizeSvg(svg || '')
  if (!checked.ok) return { error: `That SVG didn't pass the safety check (${checked.error}).` }

  // eslint-disable-next-line no-restricted-syntax -- library_assets isn't in lib/database.types.ts yet (types regen is a follow-up integrator step); genuinely untyped table access
  const dbh = createAdminClient() as unknown as SupabaseClient
  const { data } = await dbh.from('library_assets').select('config').eq('id', assetId).maybeSingle()
  const config = ((data as { config: Record<string, unknown> | null } | null)?.config ?? {}) as Record<string, unknown>

  const { error } = await dbh
    .from('library_assets')
    .update({ config: { ...config, svg: checked.svg, edited: true }, updated_at: new Date().toISOString() })
    .eq('id', assetId)
  if (error) return { error: error.message }

  revalidatePath('/admin/library')
  return { ok: true }
}

// Vera checks her own work: she LOOKS at a rendered image of the SVG (vision) and judges
// whether it satisfies the instruction and reads cleanly in the house style — fixing it if not.
const REVIEW_SYSTEM = withVoice(`You are Vera, reviewing your own illustration work as a careful design critic.

You are given: the goal (what was asked), the current inline SVG code, and a rendered PNG of exactly how that SVG looks right now. LOOK at the image and judge it honestly against the goal and the house style (flat, minimal, rounded line-art; amber primary + teal signal accents; balanced, centered, uncluttered; shapes not overlapping or clipped by the frame; nothing degenerate or blank).

Watch hardest for STYLE DRIFT and creepiness: a figure that has grown a face, fingers, muscles, extra or broken joints, or bad proportions has veered into "alien" territory and is WRONG even if it technically matches the goal. The house figures are minimal (a round head + a few clean rounded strokes); the action reads from the POSE, not from detail. Anatomically-off or overly-detailed = fix it.

Decide:
- If the rendered image is correct, clean, and on-style, reply with ONE short line starting "GOOD:" and a few words why (e.g. "GOOD: a clean, minimal runner in a clear stride").
- If it looks wrong (doesn't match the goal, broken/overlapping/clipped shapes, off proportions, added realistic detail, drifted off-style, empty), reply with the CORRECTED full inline <svg> and NOTHING else.

Correction rules (when you output an <svg>):
- Output ONLY the one <svg> element. Keep the same viewBox and the color APPROACH already used (DAWN token classes like fill-primary/stroke-signal, OR currentColor). Never introduce hex/rgb/inline color.
- Allowed tags ONLY: svg, g, path, rect, circle, ellipse, line, polyline, polygon. No text/script/style/image/use/a/href.
- Redraw toward SIMPLER and cleaner — fewer strokes, correct proportions, on the house style. Never add realistic detail (faces, fingers, muscles). When unsure, draw less.`)

/** Vera looks at a rendered image of the SVG and either approves it or returns a corrected SVG.
 *  `imageBase64` is a PNG (base64, no data-URL prefix) rasterized on the client. */
export async function reviewLoomSvg(input: {
  svg: string
  instruction: string
  imageBase64: string
}): Promise<{ ok: true; note: string } | { svg: string; note: string } | { error: string }> {
  const ctx = await requireAdmin('janitor')

  const inbound = sanitizeSvg(input.svg || '')
  if (!inbound.ok) return { error: "That graphic can't be reviewed (it didn't pass the safety check)." }
  const image = (input.imageBase64 || '').trim()
  if (!image || image.length > 8_000_000) return { error: 'Could not read the rendered image.' }
  if (!(await aiAvailable())) return { error: 'AI is turned off right now.' }
  if (await featureOverBudget(FEATURE)) return { error: "Vera's design budget is used up for today." }

  const goal = (input.instruction || '').trim().slice(0, 400) || 'Make it a clean, on-brand illustration.'

  try {
    const res = await completeRaw({
      system: REVIEW_SYSTEM,
      tier: 'sonnet',
      maxTokens: 2000,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: `GOAL: ${goal}\n\nCURRENT SVG:\n${inbound.svg}\n\nHere is how it renders right now:` },
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: image } },
            { type: 'text', text: 'Review it per your instructions: reply "GOOD: …" or output the corrected <svg>.' },
          ],
        },
      ],
    })
    after(() =>
      recordAiUsage({ feature: FEATURE, model: res.tier, usage: res.usage, costUsd: res.costUsd, profileId: ctx.profileId }),
    )

    const maybeSvg = extractSvg(res.text)
    if (maybeSvg) {
      const checked = sanitizeSvg(maybeSvg)
      if (!checked.ok) return { error: `Vera's fix didn't pass the safety check (${checked.error}).` }
      return { svg: checked.svg, note: 'Vera spotted an issue and adjusted it.' }
    }
    const note = res.text.replace(/^GOOD:\s*/i, '').trim().slice(0, 200) || 'Looks right.'
    return { ok: true, note }
  } catch (e) {
    if (e instanceof AiUnavailableError) return { error: 'AI is unavailable right now.' }
    return { error: 'Could not review that. Try again in a moment.' }
  }
}
