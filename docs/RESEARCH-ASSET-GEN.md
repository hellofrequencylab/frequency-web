# Research — smart asset generation & editing for The Loom

> **Status: research input, not a locked decision.** Deep-research pass (2026‑07‑01), adversarially
> verified. It answers "why does Vera plateau, and what's the best open/self‑hostable stack to
> generate + edit icon sets, rewards, trophies, cards, and layouts?" A follow‑up pass on the raster
> lane + cost matrix is in progress (see [Open questions](#open-questions)). Presentation: lead with
> the answer; ✅ verified / ⚠️ unverified / 🔴 gap.

## The answer in one line

Having an LLM hand‑write SVG is the wrong tool. Go **hybrid**: purpose‑built **SVG foundation
models** for vector (icons/UI marks), **raster diffusion** for polished trophies/rewards, and a
**fully self‑hosted embedding layer** (already 90% built here) for smart sort / grouping /
non‑destructive versioning.

## Recommended hybrid architecture

| Lane | Recommended (open) | Why | Evidence |
| --- | --- | --- | --- |
| Icons / UI marks (vector) | **StarVector** 1B/8B, Apache‑2.0 (CVPR 2025), image→SVG | Generates in SVG *code space* → compact, clean primitives; built for "icons, logotypes, diagrams". Recolor to DAWN tokens as a deterministic post‑step | ✅ 3‑0 |
| Text→vector + illustrations | **OmniSVG** 3B/4B/8B, code Apache‑2.0 (NeurIPS 2025), Qwen‑VL | First end‑to‑end **text‑to‑SVG** and image‑to‑SVG; icons + illustrations + characters | ✅ 3‑0 |
| Trophies / rewards / hero (raster) | **FLUX.1** family, incl. **Kontext** for instruction edits | Leading open instruction‑edit model | ⚠️ pending follow‑up |
| Smart sort / grouping / search | **gte‑small** text embeddings (already here) + **CLIP** for visual similarity (fast‑follow) | 384‑d text search now (no GPU); CLIP 512‑d image search later | ✅ 3‑0 (CLIP+pgvector) |
| Versioning + auto‑embed | Supabase auto‑embeddings pattern on `library_versions` | Trigger re‑embeds on every save‑as‑new; rollback = flip `is_current` | ✅ 3‑0 |

## Why Vera plateaus (the root cause)

The LLM emits SVG path numbers blind. Purpose‑built SVG models (StarVector/OmniSVG) reason in SVG
command space and take a **reference image** in, so they converge on clean icons far better than
prompt‑and‑pray path authoring. For rich trophies/rewards, no vector approach competes with raster
diffusion — hence the split.

## Self‑host reality ✅ verified

- **OmniSVG‑8B ≈ 26 GB VRAM** (exceeds a single 24 GB card). Use **4B/3B ≈ 17 GB** on a 4090/3090, or quantize the 8B.
- **Vector gen is slow:** ~5 s (256 tok) → **~98 s** (4096 tok). Treat as an **async/queued job**, not an interactive click.
- **Licensing:** OmniSVG *code* is Apache‑2.0 (commercial OK); its **MMSVG dataset is CC‑BY‑NC‑SA** — deploy the model, but don't reuse that dataset for brand fine‑tuning.
- **Prereqs:** a GPU (ComfyUI/Diffusers or the model's own runtime) + an **egress allowlist** to pull weights from HuggingFace.

## What we already have (big head start)

- `lib/ai/embed.ts` → `embedText()`: **384‑d, key‑free, self‑hosted gte‑small Edge Function** (ADR‑067). No vendor, no GPU.
- `library_assets.embedding vector(384)` column **already reserved**; `vector` + `pg_trgm` extensions enabled; HNSW index intentionally deferred until populated.
- `library_versions` (ADR‑480) for non‑destructive versions; established `embed-*` cron routes as the template.

## Phased adoption path

### Phase 1 — Smart sort + semantic search (no GPU, reuse existing infra) ✅ lowest risk
Populate the reserved `embedding` column from each asset's text (title + description + category +
tags) via the existing `embedText()`, then search by meaning.
1. **Backfill + keep‑in‑sync:** a `reindexLibraryEmbeddings()` (mirror `lib/ai/help-index.ts`) that embeds assets whose text changed (content‑hash gated), plus an `embed-library` cron (mirror `app/api/cron/embed-help/route.ts`). A DB trigger on insert/update of a version marks the asset dirty.
2. **Search RPC + index:** `match_library_assets(query_embedding, space_id, k)` (cosine) + `create index ... using hnsw (embedding vector_cosine_ops)` once populated.
3. **UI:** a "Sort: Most relevant" option + a "Find similar" action in the drawer (embeds the asset, returns nearest neighbours) → the seed for auto‑grouping into flows.
- **Cost/infra:** none new. All self‑hosted, key‑free.

### Phase 2 — Visual similarity (CLIP, image embeddings)
Add a **CLIP** (`clip‑ViT‑B‑32`, 512‑d) Edge Function (or small GPU) → new `embedding_clip vector(512)` column → true "looks-like" search + visual auto‑grouping. Complements Phase 1's text search.

### Phase 3 — Vector generation pilot (icons)
Stand up **OmniSVG‑4B** (or StarVector) on a 24 GB GPU as an **async job**; keep the current LLM‑SVG path as fallback; A/B on real icon sets; DAWN‑token recolor as a deterministic post‑pass. Gated by GPU + egress allowlist.

### Phase 4 — Raster lane (trophies/rewards)
**FLUX** + a brand **LoRA / IP‑Adapter** for on‑style sets, **Kontext** for instruction edits. Blocked on the follow‑up research (model + cost verdict).

### Non‑destructive editing + versioning (spans phases)
Every edit = a new `library_versions` row (never overwrite); a trigger queues re‑embedding so search stays fresh; rollback/replace flips `is_current`. This is the Supabase auto‑embeddings pattern mapped onto the existing table.

## Open questions (follow‑up research in progress) 🔴

The adversarial pass produced **no surviving verified claims** on these — do not commit until resolved:
- The **raster model shootout** (FLUX.1 dev/schnell/Kontext vs SDXL vs SD 3.5 vs Qwen‑Image vs managed gpt‑image‑1 / Gemini "nano‑banana" / Ideogram / Recraft) for flat/warm stylized art.
- The **consistency recipe for sets** (LoRA/DreamBooth vs IP‑Adapter vs ControlNet vs seeds).
- The **open‑vs‑managed cost/quality/effort matrix** at modest volume.
- **Recraft's** vector‑native API quality for icon sets + instruction SVG editing.

Two claims were adversarially **refuted** and excluded: "StarVector beats all baselines on every
metric," and "CLIP search is only a few lines of code."

## Primary sources

- StarVector — https://starvector.github.io/starvector/ · https://github.com/joanrod/star-vector · https://arxiv.org/abs/2312.11556
- OmniSVG — https://github.com/OmniSVG/OmniSVG · https://omnisvg.github.io · https://arxiv.org/abs/2504.06263
- Supabase CLIP image search — https://supabase.com/docs/guides/ai/examples/image-search-openai-clip
- Supabase automatic embeddings — https://supabase.com/docs/guides/ai/automatic-embeddings
- CLIP (sentence‑transformers) — https://huggingface.co/sentence-transformers/clip-ViT-B-32
