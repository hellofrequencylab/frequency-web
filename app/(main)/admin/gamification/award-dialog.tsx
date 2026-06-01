'use client'

import { useState, useTransition } from 'react'
import { Award, Search, X, Loader2, Check } from 'lucide-react'
import { awardAchievement, revokeAchievement } from '@/app/(main)/crew/gamification-actions'

interface Achievement {
  id: string
  name: string
  tier: string
}

interface Member {
  id: string
  display_name: string
  handle: string
}

export function AwardDialog({
  achievements,
  members,
}: {
  achievements: Achievement[]
  members: Member[]
}) {
  const [open, setOpen] = useState(false)
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null)
  const [memberSearch, setMemberSearch] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const filteredMembers = members.filter(m =>
    m.display_name.toLowerCase().includes(memberSearch.toLowerCase()) ||
    m.handle.toLowerCase().includes(memberSearch.toLowerCase())
  ).slice(0, 8)

  function handleAward() {
    if (!selectedMember || !selectedAchievement) return
    startTransition(async () => {
      try {
        const res = await awardAchievement(selectedMember.id, selectedAchievement.id)
        if (res.alreadyEarned) {
          setResult(`${selectedMember.display_name} already has "${selectedAchievement.name}"`)
        } else {
          setResult(`Awarded "${selectedAchievement.name}" to ${selectedMember.display_name}`)
        }
      } catch (err) {
        setResult(`Error: ${err instanceof Error ? err.message : String(err)}`)
      }
    })
  }

  function handleRevoke() {
    if (!selectedMember || !selectedAchievement) return
    startTransition(async () => {
      try {
        await revokeAchievement(selectedMember.id, selectedAchievement.id)
        setResult(`Revoked "${selectedAchievement.name}" from ${selectedMember.display_name}`)
      } catch (err) {
        setResult(`Error: ${err instanceof Error ? err.message : String(err)}`)
      }
    })
  }

  function reset() {
    setSelectedMember(null)
    setSelectedAchievement(null)
    setMemberSearch('')
    setResult(null)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover transition-colors whitespace-nowrap"
      >
        <Award className="w-4 h-4" />
        Award Achievement
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-text">Award Achievement</h2>
          <button onClick={() => { setOpen(false); reset() }} className="p-1 rounded text-subtle hover:text-muted dark:hover:text-subtle">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {result ? (
            <div className="text-center py-4">
              <Check className="w-8 h-8 text-success mx-auto mb-2" />
              <p className="text-sm text-text">{result}</p>
              <button
                onClick={reset}
                className="mt-3 text-xs text-primary-strong hover:text-primary-strong font-medium"
              >
                Award another
              </button>
            </div>
          ) : (
            <>
              {/* Member picker */}
              <div>
                <label className="text-xs font-semibold text-muted uppercase tracking-wider">Member</label>
                {selectedMember ? (
                  <div className="mt-1 flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                    <span className="text-sm text-text flex-1">{selectedMember.display_name}</span>
                    <span className="text-xs text-subtle">@{selectedMember.handle}</span>
                    <button onClick={() => setSelectedMember(null)} className="text-subtle hover:text-muted">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="mt-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-subtle" />
                      <input
                        type="text"
                        value={memberSearch}
                        onChange={e => setMemberSearch(e.target.value)}
                        placeholder="Search members..."
                        className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-2 text-sm text-text placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    {memberSearch && (
                      <div className="mt-1 rounded-lg border border-border bg-surface max-h-40 overflow-y-auto">
                        {filteredMembers.map(m => (
                          <button
                            key={m.id}
                            onClick={() => { setSelectedMember(m); setMemberSearch('') }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface transition-colors"
                          >
                            <span className="text-sm text-text">{m.display_name}</span>
                            <span className="text-xs text-subtle">@{m.handle}</span>
                          </button>
                        ))}
                        {filteredMembers.length === 0 && (
                          <p className="px-3 py-2 text-xs text-subtle">No members found</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Achievement picker */}
              <div>
                <label className="text-xs font-semibold text-muted uppercase tracking-wider">Achievement</label>
                <select
                  value={selectedAchievement?.id ?? ''}
                  onChange={e => {
                    const a = achievements.find(x => x.id === e.target.value)
                    setSelectedAchievement(a ?? null)
                  }}
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Select an achievement...</option>
                  {achievements.map(a => (
                    <option key={a.id} value={a.id}>
                      [{a.tier}] {a.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={handleAward}
                  disabled={!selectedMember || !selectedAchievement || isPending}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-50 transition-colors"
                >
                  {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Award className="w-3.5 h-3.5" />}
                  Award
                </button>
                <button
                  onClick={handleRevoke}
                  disabled={!selectedMember || !selectedAchievement || isPending}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-danger px-3 py-2 text-xs font-semibold text-danger hover:bg-danger-bg disabled:opacity-50 transition-colors"
                >
                  Revoke
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
