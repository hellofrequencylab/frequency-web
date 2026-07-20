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
- DESIGN VIBE — lead with this (the "induction vibe", docs/LOOM-DESIGN-LANGUAGE.md): flat, warm, FILLED shapes — a calm, rounded, friendly product-UI feel. Build the drawing from solid filled shapes; line-art is only a supporting accent (a check, a motion line, a rule), NEVER the whole drawing. Amber (primary) is the hero, teal (signal) the accent; faint primary-bg washes + surface cards carry the warmth. Rounded ends (stroke-linecap="round" stroke-linejoin="round") + big rounded corners (rx 10-22). Stroke widths 3 to 5. No gradients, filters, shadows, or photorealism.
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
- App screen / surface (the induction signature): a rounded rect "window" — fill-surface stroke-border-strong, with an optional slim fill-primary or fill-primary-bg header band — holding faint inner cards. How the kit shows a product moment.
- Warm inner card: <rect rx="12" class="fill-primary-bg"/> (or fill-surface stroke-border) as the content block inside a screen.
- Avatar dot: a filled circle in fill-primary (fill-primary-bg for a muted one). Pill/chip: a rounded rect fill-primary with an fill-on-primary mark (a "joined"/count chip).

STYLE EXAMPLE (match this simplicity):
<svg viewBox="0 0 240 150" fill="none" role="img" aria-label="A booking sheet with a slot confirmed"><rect x="64" y="14" width="112" height="122" rx="14" class="fill-surface stroke-border-strong" stroke-width="3"/><path d="M64 40v-12a14 14 0 0 1 14-14h84a14 14 0 0 1 14 14v12z" class="fill-primary"/><rect x="78" y="52" width="84" height="18" rx="9" class="fill-primary-bg"/><rect x="78" y="80" width="84" height="18" rx="9" class="fill-signal"/><path d="M147 89l4 4 8-9" class="stroke-on-signal" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`

const GRAPHIC_SYSTEM = withVoice(
  `You are Vera, drawing a new spot illustration "card" for Frequency's asset library (The Loom), in the exact house style.\n\n${HOUSE_STYLE}\n\nDraw exactly what the operator asks, as literally and simply as possible.`,
)

// Small icons in the warm "induction vibe" (docs/LOOM-DESIGN-LANGUAGE.md): a 24×24 grid,
// flat FILLED duotone in the DAWN palette (amber-led), rounded, reads at 16–18px.
const ICON_SYSTEM = withVoice(`You are Vera, drawing a small icon for Frequency's asset library (The Loom), in the warm "induction vibe" (docs/LOOM-DESIGN-LANGUAGE.md).

OUTPUT CONTRACT — follow EXACTLY:
- Output ONLY one inline <svg> element. No prose, no markdown fences, no XML declaration, no comments.
- Root must be: <svg viewBox="0 0 24 24" fill="none" role="img" aria-label="SHORT DESCRIPTION">…</svg>
- Allowed tags ONLY: svg, g, path, rect, circle, ellipse, line, polyline, polygon. Never use text, script, style, image, use, a, or any href/xlink.
- COLOR IS CLASSES ONLY — never a hex, rgb, or inline style. A warm FILLED duotone:
  the main shape in class="fill-primary" (amber hero); a soft accent shape in class="fill-primary-bg" behind or beside it; a small pop in class="fill-signal" (teal) when it helps; on-color marks in class="fill-on-primary". Outlines only if needed: class="stroke-primary-strong" stroke-width="2".
- Style: one clean glyph built from FILLED, rounded shapes (not thin line-art). Centered, 2–4 shapes max, generous ~2px padding, big rounded corners. Flat — no gradients, shadows, or text. It must read at 16px.

STYLE EXAMPLE (a warm filled calendar — match this feel):
<svg viewBox="0 0 24 24" fill="none" role="img" aria-label="Calendar"><rect x="3.5" y="5" width="17" height="15.5" rx="4" class="fill-primary-bg"/><path d="M3.5 9.5a4 4 0 0 1 4-4h9a4 4 0 0 1 4 4z" class="fill-primary"/><rect x="7" y="2.5" width="2.5" height="4" rx="1.25" class="fill-primary-strong"/><rect x="14.5" y="2.5" width="2.5" height="4" rx="1.25" class="fill-primary-strong"/><circle cx="9" cy="14" r="1.7" class="fill-primary"/><circle cx="15" cy="14" r="1.7" class="fill-signal"/></svg>

Draw exactly what the operator asks, as one simple warm-filled glyph.`)

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
    source: 'vera',
    status: 'approved',
    visibility: 'public',
    config: { source: 'vera', mode: input.mode ?? 'graphic', prompt: (input.prompt || '').slice(0, 400), svg: checked.svg },
  })
  if (error) return { error: error.message }

  revalidatePath('/admin/library')
  return { ok: true }
}

// Vera as a design assistant, with two modes. Editing NEVER imposes the warm "create" vibe — it
// preserves the original's own look (colors, style, composition):
//   • TWEAK (default): a surgical, minimal change — keep the graphic NEARLY IDENTICAL, alter only
//     what's asked. For refinements ("make the center leaf translucent, thin the stroke").
//   • REDRAW: rebuild the whole thing from an understanding of what it depicts (look → plan →
//     redraw), for bigger conceptual changes ("make the runner clearly mid-stride").

const EDIT_PRINCIPLES = `PRESERVE THE ORIGINAL (this is an EDIT, not a new drawing):
- Keep the original's EXACT visual style, weight, and COLOR APPROACH. If it uses currentColor, keep currentColor. If it uses DAWN token classes, keep the SAME classes it already uses. NEVER recolor it (do not turn a dark/monochrome icon amber, or vice-versa).
- Keep the same viewBox, size, and overall composition/placement.
- Allowed tags ONLY: svg, g, path, rect, circle, ellipse, line, polyline, polygon. No text/script/style/image/use/a/href. No hex, rgb, or inline color.`

const TWEAK_SYSTEM = withVoice(`You are Vera, making a SMALL, precise tweak to an existing icon or illustration — like a designer nudging one detail. The result MUST look nearly identical to the original, with ONLY the requested change applied.

Rules:
- Change ONLY what the instruction asks. Every other shape, path, coordinate, opacity, and color stays EXACTLY as-is. Do not redraw, re-center, re-style, re-color, or "improve" anything else.
- Prefer editing existing paths/attributes over adding or removing shapes. Make the smallest possible change.
- ${EDIT_PRINCIPLES}
- If the request truly cannot be done without a redraw, make the closest faithful minimal change.

Output ONLY the modified <svg>.`)

const REDRAW_PLAN_SYSTEM = withVoice(`You are Vera, a design assistant studying an illustration before a bigger redraw.

Look CAREFULLY at the image. Name what it depicts, part by part, in concrete shapes (e.g. "a runner: round head, torso leaning forward, two legs bent in a stride, two arms swinging"). Note anything that reads wrong. Then say concretely how you'll redraw it to satisfy the instruction while keeping the SAME style, palette, colors, and overall composition as the original.

Reply in 1-4 short sentences. Do NOT output any SVG or code.`)

const REDRAW_SYSTEM = withVoice(`You are Vera, REDRAWING an existing illustration so it reads clearly — for a change bigger than a small tweak. You get the original svg and a short plan of what it depicts + the change.

Rebuild it cleanly so the subject is instantly recognizable and the change is applied, but STAY FAITHFUL to the original:
- ${EDIT_PRINCIPLES}
- Match the original's level of abstraction and detail exactly. Keep figures minimal — recognizable by POSE, never adding faces, fingers, muscles, or realism the original didn't have (that turns a clean figure into a creepy "alien"). Fewer, cleaner shapes win; when unsure, draw LESS.
- The result must look like it belongs in the same set as the original, in the SAME colors.

Output ONLY the finished <svg>.`)

export type LoomEditMode = 'tweak' | 'redraw'

/** Edit an existing SVG. `mode` 'tweak' (default) makes a surgical, near-identical change; 'redraw'
 *  rebuilds it from an understanding for bigger changes. `imageBase64` (a PNG of the current render)
 *  lets Vera SEE what she's changing. The original's colors + style are always preserved. */
export async function editLoomSvg(
  currentSvg: string,
  instruction: string,
  imageBase64?: string,
  mode: LoomEditMode = 'tweak',
): Promise<{ svg: string } | { error: string }> {
  const ctx = await requireAdmin('janitor')

  const inbound = sanitizeSvg(currentSvg || '')
  if (!inbound.ok) return { error: "That graphic can't be edited (it didn't pass the safety check)." }
  const ask = (instruction || '').trim().slice(0, 400)
  if (ask.length < 3) return { error: 'Tell Vera what to change.' }
  if (!(await aiAvailable())) return { error: 'AI is turned off right now.' }
  if (await featureOverBudget(FEATURE)) return { error: "Vera's design budget is used up for today." }

  const image = (imageBase64 || '').trim()
  const hasImage = !!image && image.length < 8_000_000
  const usage = { inputTokens: 0, outputTokens: 0 }
  let costUsd = 0
  let tier: ModelTier = 'sonnet'

  try {
    if (mode === 'tweak') {
      // Surgical: one call, keep it near-identical. Show the render so she doesn't break it.
      const res = await completeRaw({
        system: TWEAK_SYSTEM,
        tier: 'sonnet',
        maxTokens: 2200,
        cacheSystem: true,
        messages: [
          {
            role: 'user',
            content: hasImage
              ? [
                  { type: 'text', text: `ORIGINAL SVG:\n${inbound.svg}\n\nHere is how it looks now. Apply ONLY this change, keeping everything else identical:\nINSTRUCTION: ${ask}` },
                  { type: 'image', source: { type: 'base64', media_type: 'image/png', data: image } },
                ]
              : `ORIGINAL SVG:\n${inbound.svg}\n\nApply ONLY this change, keeping everything else identical:\nINSTRUCTION: ${ask}`,
          },
        ],
      })
      usage.inputTokens += res.usage.inputTokens
      usage.outputTokens += res.usage.outputTokens
      costUsd += res.costUsd
      tier = res.tier
      after(() => recordAiUsage({ feature: FEATURE, model: tier, usage, costUsd, profileId: ctx.profileId }))
      const checked = sanitizeSvg(res.text)
      if (!checked.ok) return { error: `Vera's tweak didn't pass the safety check (${checked.error}). Try rewording it.` }
      return { svg: checked.svg }
    }

    // REDRAW: (1) understand from the render, (2) rebuild — always in the original's colors + style.
    let plan = ''
    if (hasImage) {
      const p = await completeRaw({
        system: REDRAW_PLAN_SYSTEM,
        tier: 'sonnet',
        maxTokens: 500,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: `INSTRUCTION: ${ask}\n\nHere is the illustration now. What is it (part by part), and how will you redraw it — keeping its colors + style?` },
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
    const draw = await completeRaw({
      system: REDRAW_SYSTEM,
      tier: 'sonnet',
      maxTokens: 2200,
      cacheSystem: true,
      messages: [
        {
          role: 'user',
          content: `ORIGINAL SVG (keep its viewBox, colors, and composition):\n${inbound.svg}\n\n${
            plan ? `WHAT IT DEPICTS + YOUR PLAN:\n${plan}\n\n` : ''
          }INSTRUCTION: ${ask}\n\nRedraw it cleanly so it reads as intended, in the SAME colors and style.`,
        },
      ],
    })
    usage.inputTokens += draw.usage.inputTokens
    usage.outputTokens += draw.usage.outputTokens
    costUsd += draw.costUsd
    tier = draw.tier
    after(() => recordAiUsage({ feature: FEATURE, model: tier, usage, costUsd, profileId: ctx.profileId }))
    const checked = sanitizeSvg(draw.text)
    if (!checked.ok) return { error: `Vera's edit didn't pass the safety check (${checked.error}). Try rewording it.` }
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

Be CONSERVATIVE — this is a check, not a redesign. Preserve the original's colors, style, and composition; NEVER recolor or restyle it. Only intervene for a CLEAR problem: broken/overlapping/clipped shapes, a degenerate/blank result, the requested change obviously missing, or a figure that drifted into creepy realism. Cosmetic preferences are not problems. When in doubt, approve.

Decide:
- If the rendered image is fine (correct enough, clean, faithful to the original's look), reply with ONE short line starting "GOOD:" and a few words why (e.g. "GOOD: the center leaf is lighter, everything else unchanged").
- Only if there is a clear problem, reply with the CORRECTED full inline <svg> and NOTHING else.

Correction rules (when you output an <svg>):
- Output ONLY the one <svg> element. Keep the same viewBox and the EXACT color approach already used (the same DAWN token classes, OR currentColor). Never recolor; never introduce hex/rgb/inline color.
- Allowed tags ONLY: svg, g, path, rect, circle, ellipse, line, polyline, polygon. No text/script/style/image/use/a/href.
- Fix ONLY the specific problem, keeping the rest identical. Toward simpler + cleaner; never add realistic detail (faces, fingers, muscles).`)

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
