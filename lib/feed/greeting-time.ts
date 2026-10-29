/** Match the member-day resolver: missing or invalid profile zones use UTC. */
export function feedGreetingTime(now: Date, timezone: string | null | undefined) {
  let zone = timezone || 'UTC'
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
  } catch {
    zone = 'UTC'
  }
  const hour = Number(now.toLocaleString('en-US', { timeZone: zone, hour: '2-digit', hour12: false })) % 24
  return {
    hello: hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening',
    dateLine: now.toLocaleDateString('en-US', { timeZone: zone, weekday: 'long', month: 'long', day: 'numeric' }),
    clock: now.toLocaleTimeString('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase(),
  }
}
