// tz-lookup ships no types. It default-exports a single synchronous function that maps
// a (latitude, longitude) to its IANA timezone name, throwing on out-of-range input.
declare module 'tz-lookup' {
  export default function tzlookup(lat: number, lon: number): string
}
