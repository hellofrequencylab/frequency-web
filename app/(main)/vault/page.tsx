import { redirect } from 'next/navigation'

// The Vault now lives inside the Store (nav consolidation) — your Gem balance,
// Zaps, and streak sit alongside what you can spend Gems on. Old links land there.
export default function VaultPage() {
  redirect('/crew/store')
}
