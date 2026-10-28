import { Leaderboard } from '@/components/Leaderboard'

export function LeaderboardPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Leaderboard</p>
        <h1 className="display mt-2 text-balance text-4xl font-bold sm:text-5xl">Businesses ranked by verified MRR</h1>
        <p className="mt-3 max-w-xl text-pretty text-[color:var(--ink-2)]">
          Ranked by active monthly plans that are paid up today, then by total revenue. Open any business to see the
          transactions behind its numbers.
        </p>
      </header>
      <Leaderboard />
    </div>
  )
}
