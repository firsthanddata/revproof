import { useMemo } from 'react'
import { Trophy } from 'lucide-react'
import { Link } from '@/lib/nav'
import { useIndexer, useNow } from '@/lib/IndexerProvider'
import { computeLeaderboard } from '@/lib/metrics'
import { fmtUsd } from '@/lib/format'
import { EmptyState, Skeleton } from './ui'

/** Merchants ranked by verified MRR, then by net revenue. */
export function Leaderboard({ limit }: { limit?: number }) {
  const { data, ready } = useIndexer()
  const now = useNow()
  const rows = useMemo(() => computeLeaderboard(data, now), [data, now])
  const shown = limit ? rows.slice(0, limit) : rows

  if (!ready && rows.length === 0) {
    return (
      <div className="card space-y-3 p-5">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    )
  }
  if (rows.length === 0) {
    return (
      <div className="card">
        <EmptyState
          title="No merchants yet"
          body="Be the first to register a business and appear here once customers start paying."
          action={
            <Link to="/dashboard" className="btn btn-primary">
              Register a business
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="card overflow-hidden">
      <div className="hidden grid-cols-[48px_1fr_140px_140px_100px] gap-4 border-b border-[color:var(--border)] px-5 py-3 sm:grid">
        <span className="eyebrow">Rank</span>
        <span className="eyebrow">Business</span>
        <span className="eyebrow text-right">MRR</span>
        <span className="eyebrow text-right">Total revenue</span>
        <span className="eyebrow text-right">Customers</span>
      </div>
      <ul className="divide-y divide-[color:var(--border)]">
        {shown.map((m, i) => (
          <li key={m.merchant.id}>
            <Link
              to={`/m/${m.merchant.slug}`}
              className="grid grid-cols-[32px_1fr_auto] items-center gap-x-4 gap-y-1 px-5 py-4 transition-colors hover:bg-[color:var(--surface-muted)] sm:grid-cols-[48px_1fr_140px_140px_100px]"
            >
              <span className="display num flex items-center text-lg font-semibold text-[color:var(--muted)]">
                {i === 0 && m.mrr > 0n ? <Trophy className="h-5 w-5 text-[#b07000]" aria-label="First place" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold">{m.merchant.name}</span>
                <span className="block truncate text-xs text-[color:var(--muted)]">revproof/{m.merchant.slug}</span>
              </span>
              <span className="display num text-right text-lg font-semibold">
                {fmtUsd(m.mrr)}
                <span className="block text-[11px] font-medium text-[color:var(--subtle)] sm:hidden">MRR</span>
              </span>
              <span className="num hidden text-right text-sm sm:block">{fmtUsd(m.net)}</span>
              <span className="num hidden text-right text-sm sm:block">{m.customers}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
