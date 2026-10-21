// A plan price label split for the type. Shared by the plan cards and the motion graphics.

/** A card's price, split for the type: an optional lead word ("from"), the figure, and its period
 *  ("/mo") set smaller beside it. Parsed off the display label the model already formats, never
 *  re-priced; a label with no figure ("Free", "Set by the Space") is shown whole. */
export function splitPrice(label: string): { lead?: string; amount: string; per?: string } {
  const m = label.match(/^(?:(\D+?)\s+)?(\S*\d[^\s/]*)(\/[a-z]+)?$/i)
  if (!m) return { amount: label }
  return { lead: m[1] || undefined, amount: m[2]!, per: m[3] || undefined }
}
