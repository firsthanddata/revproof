import { useMemo } from 'react'
import { BadgeCheck } from 'lucide-react'
import { Link } from '@/lib/nav'
import { useIndexer, useNow } from '@/lib/IndexerProvider'
import { computeMerchantMetrics } from '@/lib/metrics'
import { BILLING_LABEL, addressUrl } from '@/lib/contract'
import { fmtDate, fmtUsd, shortAddress } from '@/lib/format'
import { MetricsGrid } from '@/components/MetricsGrid'
import { RevenueChart } from '@/components/RevenueChart'
import { PaymentsTable } from '@/components/PaymentsTable'
import { Faq } from '@/components/Faq'
import { EmptyState, ExplorerLink, Pill, Skeleton } from '@/components/ui'

export function MerchantPage({ slug }: { slug: string }) {
  const { data, ready } = useIndexer()
  const now = useNow()
  const merchant = data.merchantBySlug.get(slug)
  const metrics = useMemo(() => (merchant ? computeMerchantMetrics(data, merchant, now) : null), [data, merchant, now])

  if (!merchant || !metrics) {
    if (!ready) {
      return (
        <div className="space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
          <Skeleton className="h-64" />
        </div>
      )
    }
    return (
      <div className="card">
        <EmptyState
          title="No business with that address"
          body={`There is no merchant registered as "${slug}" on this contract.`}
          action={
            <Link to="/leaderboard" className="btn btn-ghost">
              Browse the leaderboard
            </Link>
          }
        />
      </div>
    )
  }

  const products = data.products.filter((p) => p.merchantId === merchant.id)
  const firstPayment = metrics.recent[metrics.recent.length - 1]

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Pill tone="good">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Verified onchain
          </Pill>
          <h1 className="display mt-3 text-balance text-4xl font-bold sm:text-5xl">{merchant.name}</h1>
          <p className="mt-2 text-sm text-[color:var(--muted)]">
            revproof/{merchant.slug}
            <span className="mx-2">·</span>
            Paid out to{' '}
            <ExplorerLink href={addressUrl(merchant.payout)} className="mono">
              {shortAddress(merchant.payout)}
            </ExplorerLink>
            {firstPayment && (
              <>
                <span className="mx-2">·</span>
                First payment {fmtDate(firstPayment.paidAt)}
              </>
            )}
          </p>
        </div>
      </header>

      <MetricsGrid metrics={metrics} />

      <section className="card p-5 sm:p-6">
        <RevenueChart months={metrics.months} />
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="display text-xl font-semibold">Recent payments</h2>
        <PaymentsTable payments={metrics.recent} data={data} now={now} />
      </section>

      {products.length > 0 && (
        <section className="card p-5 sm:p-6">
          <h2 className="display text-xl font-semibold">Products</h2>
          <ul className="mt-2 divide-y divide-[color:var(--border)]">
            {products.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-3.5">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{p.name}</p>
                  <p className="text-xs text-[color:var(--muted)]">
                    {BILLING_LABEL[p.billing]}
                    {p.billing === 1 ? ' · every 30 days' : ''}
                    {!p.active ? ' · paused' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="num font-semibold">{fmtUsd(p.price)}</span>
                  {p.active && (
                    <Link to={`/pay/${p.id}`} className="btn btn-primary btn-sm">
                      Pay
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Faq />
    </div>
  )
}
