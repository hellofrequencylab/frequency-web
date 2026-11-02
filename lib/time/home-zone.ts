/** The community's HOME time zone: the zone "today" and an event with no zone of its own are read in
 *  (SEC-018). One tiny module with no imports so a client file can take it without pulling in
 *  `tz-lookup`; `lib/time/zone.ts` re-exports it as before. Expanding to another region means changing
 *  this value (or reading a per-region setting here), not hunting literals. */
export const HOME_TZ = 'America/Los_Angeles'
