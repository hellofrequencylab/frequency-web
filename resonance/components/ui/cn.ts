/** Tiny className joiner. Falsy parts drop out. Keeps component class logic
 * readable without pulling in a dependency. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
