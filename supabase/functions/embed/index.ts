import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// gte-small embeddings (384-d) for help search (docs/SUPPORT-SYSTEM.md, ADR-067).
// Runs Supabase's built-in model in the Edge runtime — no external vendor, no
// per-call cost. Same model embeds the index and the query (consistency is
// mandatory). Requires a valid JWT (anon or service role).
const model = new Supabase.ai.Session("gte-small");

Deno.serve(async (req: Request) => {
  try {
    const { text } = await req.json();
    if (typeof text !== "string" || !text.trim()) {
      return new Response(JSON.stringify({ error: "`text` (non-empty string) required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    // mean_pool + normalize => a unit-length 384-d vector suited to cosine search.
    const embedding = await model.run(text, { mean_pool: true, normalize: true });
    return new Response(JSON.stringify({ embedding }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
