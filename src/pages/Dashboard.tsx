import { useEffect, useMemo, useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { Plus } from 'lucide-react'
import { Link, useLocation } from '@/lib/nav'
import { useIndexer, useNow } from '@/lib/IndexerProvider'
import { computeMerchantMetrics } from '@/lib/metrics'
import { buildShareLink } from '@/lib/share'
import { MetricsGrid } from '@/components/MetricsGrid'
import { RevenueChart } from '@/components/RevenueChart'
import { PaymentsTable } from '@/components/PaymentsTable'
import { ProductsManager } from '@/components/ProductsManager'
import { BadgeEmbed } from '@/components/BadgeEmbed'
import { MerchantSettings } from '@/components/MerchantSettings'
import { RefundButton } from '@/components/RefundButton'
import { RegisterMerchant } from '@/components/RegisterMerchant'
import { CopyButton, EmptyState, Skeleton } from '@/components/ui'

export function Dashboard() {
  const { address, isConnected } = useAccount()
  const { data, ready } = useIndexer()
  const { search } = useLocation()
  const now = useNow()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [publicUrl, setPublicUrl] = useState<string | null>(null)

  const owned = useMemo(
    () => (address ? data.merchants.filter((m) => m.owner.toLowerCase() === address.toLowerCase()) : []),
    [data.merchants, address],
  )
  const merchant = owned.find((m) => m.id === selectedId) ?? owned[0]
  const metrics = useMemo(() => (merchant ? computeMerchantMetrics(data, merchant, now) : null), [data, merchant, now])

  useEffect(() => {
    if (!merchant) return
    let live = true
    void buildShareLink(`/m/${merchant.slug}`).then((url) => live && setPublicUrl(url))
    return () => {
      live = false
    }
  }, [merchant])

  if (!isConnected) {
    return (
      <div className="card mx-auto max-w-lg">
        <EmptyState
          title="Merchant dashboard"
          body="Connect the wallet that owns your business to create products, copy payment links and issue refunds."
          action={
            <ConnectKitButton.Custom>
              {({ show }) => (
                <button type="button" className="btn btn-primary" onClick={show}>
                  Connect wallet
                </button>
              )}
            </ConnectKitButton.Custom>
          }
        />
      </div>
    )
  }

  if (!ready && owned.length === 0) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20" />
        <Skeleton className="h-48" />
      </div>
    )
  }

  if (!merchant || !metrics || search.get('new') === '1') {
    return <RegisterMerchant />
  }

  const products = data.products.filter((p) => p.merchantId === merchant.id)

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Merchant dashboard</p>
          {owned.length > 1 ? (
            <select
              className="field display mt-2 max-w-xs text-xl font-semibold"
              value={merchant.id}
              onChange={(e) => setSelectedId(Number(e.target.value))}
              aria-label="Choose business"
            >
              {owned.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          ) : (
            <h1 className="display mt-2 text-balance text-4xl font-bold">{merchant.name}</h1>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/m/${merchant.slug}`} className="btn btn-ghost btn-sm">
            View public page
          </Link>
          <CopyButton value={publicUrl ?? ''} label="Copy public link" disabled={!publicUrl} />
          <Link to="/dashboard?new=1" className="btn btn-ghost btn-sm">
            <Plus className="h-4 w-4" aria-hidden /> New business
          </Link>
        </div>
      </header>

      <MetricsGrid metrics={metrics} />

      <section className="card p-5 sm:p-6">
        <RevenueChart months={metrics.months} />
      </section>

      <ProductsManager merchant={merchant} products={products} payments={metrics.recent} />

      <section className="card p-5 sm:p-6">
        <h2 className="display text-xl font-semibold">Payments</h2>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Refunds are paid from your wallet through the contract and show up on your public page.
        </p>
        <PaymentsTable
          payments={metrics.recent}
          data={data}
          now={now}
          limit={25}
          action={(p) => <RefundButton payment={p} />}
        />
      </section>

      <BadgeEmbed merchant={merchant} mrr={metrics.mrr} />
      <MerchantSettings key={merchant.id} merchant={merchant} />
    </div>
  )
}
