// Vera's live reactions during induction (Phase 3). Scripted + keyed to what the
// member types, so the Place beat feels like Vera interviewing them, not a form.
// Pure + dark-safe (works with no AI; the kernel can improvise on top later) and
// unit-tested. No em dashes in member-visible copy (house style).

/** Vera's reaction to the free-text intent ("what are you hoping to find?"). */
export function veraIntentReaction(intent: string): string | null {
  const t = intent.trim()
  if (!t) return null
  const l = t.toLowerCase()

  if (/\b(just moved|moved here|relocat|just got here|new (to|in) (town|the area)|new here|new in town)\b/.test(l)) {
    return "New here? Then this matters more than you think. I've got you."
  }
  if (/\b(friend|friends|people|meet|community|lonely|belong|connect|tribe)\b/.test(l)) {
    return "That's the reason anyone built something that lasted. Right place."
  }
  if (/\b(pizza|food|coffee|beer|wine|skate|surf|run|hike|climb|bike|music|art|book|game|yoga|lift|gym|dog|garden|cold plunge|sauna)\b/.test(l)) {
    return 'Ha. There is a Founder near you who would die on that hill. Noted.'
  }
  // Default: reflect their own words back so they feel heard.
  const clean = t.replace(/^["'“”]+|["'“”]+$/g, '').replace(/\s+/g, ' ').slice(0, 120)
  return `"${clean}" Said plainly. That is exactly the kind of thing this place is for.`
}

/** Vera's reaction once a city is chosen. */
export function veraCityNote(city: string): string | null {
  const c = city.trim()
  if (!c) return null
  const label = c.split(',')[0].trim()
  return `${label}. Noted. I will point you at the Founders closest to you.`
}
