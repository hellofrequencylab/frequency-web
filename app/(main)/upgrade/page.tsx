import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Zap, Check, MessageSquare, CalendarDays, Users, Star, Radio, BarChart3 } from 'lucide-react'
import { UpgradeToggle } from './upgrade-toggle'

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'janitor'

export default async function UpgradePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) redirect('/onboarding')

  const role = (profile.community_role ?? 'member') as CommunityRole
  const isCrew = role !== 'member'
  const isLeadership = ['host', 'guide', 'mentor', 'janitor'].includes(role)

  const benefits = [
    { icon: MessageSquare, label: 'Full community feed access' },
    { icon: Users, label: 'Join and participate in circles' },
    { icon: CalendarDays, label: 'Create and RSVP to events' },
    { icon: Radio, label: 'Access all channels' },
    { icon: Star, label: 'Earn Zaps and climb the leaderboard' },
    { icon: BarChart3, label: 'Track your crew progress' },
  ]

  return (
    <div className="max-w-lg mx-auto py-4">
      {/* Beta banner */}
      <div className="rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 px-5 py-4 mb-8">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
            Free Beta
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-white bg-indigo-600 px-2 py-0.5 rounded-full">
            Active
          </span>
        </div>
        <p className="text-sm text-indigo-900/70 dark:text-indigo-300/70 leading-relaxed">
          Frequency is in free beta. All features are unlocked for everyone.
          Early members will get Founder pricing when paid memberships launch.
        </p>
      </div>

      {/* Main card */}
      <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-indigo-600 to-violet-600 px-6 py-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm mb-4">
            <Zap className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">Crew Membership</h1>
          <p className="text-indigo-100/80 text-sm">Full access to the Frequency community</p>
          <div className="mt-4 flex items-baseline justify-center gap-1">
            <span className="text-3xl font-black text-white line-through opacity-50">$10</span>
            <span className="text-4xl font-black text-white ml-2">Free</span>
            <span className="text-indigo-200 text-sm ml-1">during beta</span>
          </div>
        </div>

        {/* Benefits */}
        <div className="px-6 py-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">
            What you get
          </p>
          <ul className="space-y-3.5">
            {benefits.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3">
                <div className="shrink-0 w-8 h-8 rounded-lg bg-green-50 dark:bg-green-950/30 flex items-center justify-center">
                  <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                </div>
                <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Toggle */}
        <div className="px-6 pb-6">
          {isLeadership ? (
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 px-4 py-3 text-center">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                You are a <span className="font-bold text-gray-900 dark:text-gray-50 capitalize">{role}</span>. Your role is managed by community leadership.
              </p>
            </div>
          ) : (
            <UpgradeToggle isCrew={isCrew} />
          )}
        </div>
      </div>

      {/* Founder note */}
      <div className="mt-8 text-center px-4">
        <p className="text-xs text-gray-400 leading-relaxed">
          When paid memberships launch, beta members will be offered exclusive
          Founder pricing. You can switch between Member and Crew freely
          during the beta period.
        </p>
      </div>
    </div>
  )
}
