import { useState, type ReactNode } from 'react'
import { useReadContract } from 'wagmi'
import { CheckCircle2, ShieldAlert } from 'lucide-react'
import { clsx } from 'clsx'
import type { MerchantMetrics } from '@/lib/metrics'
import { CHAIN_ID, ROUTER_ADDRESS, routerAbi } from '@/lib/contract'
import { fmtDateTime, fmtUsd, shortAddress } from '@/lib/format'
import { ExplorerLink, Pill } from './ui'

type MetricKey = 'total' | 'last30' | 'mrr' | 'customers' | 'refunds'

function ContractCheck({ merchantId, computed }: { merchantId: number; computed: bigint }) {
  const { data, isLoading } = useReadContract({
    address: ROUTER_ADDRESS,
    abi: routerAbi,
    functionName: 'mrr',
    args: [BigInt(merchantId)],
    chainId: CHAIN_ID,
    query: { refetchInterval: 15_000 },
  })
  if (isLoading || data === undefined) return null
  const matches = data === computed
  return matches ? (
    <Pill tone="good">
      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Matches the contract's own MRR
    </Pill>
  ) : (
    <Pill tone="warn">
      <ShieldAlert className="h-3.5 w-3.5" aria-hidden /> Contract reports {fmtUsd(data)}, still syncing
    </Pill>
  )
}

interface CardProps {
  id: MetricKey
  selected: MetricKey
  onSelect: (key: MetricKey) => void
  label: string
  value: string
  sub: string
  className?: string
  hero?: boolean
  extra?: ReactNode
}

function MetricCard({ id, selected, onSelect, label, value, sub, className, hero, extra }: CardProps) {
  const active = selected === id
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-pressed={active}
      className={clsx(
        'card flex flex-col gap-2 p-5 text-left transition-shadow hover:shadow-lg',
        active && 'ring-2 ring-[color:var(--accent)]',
        className,
      )}
    >
      <span className="eyebrow">{label}</span>
      <span className={clsx('display num font-semibold leading-none', hero ? 'text-4xl sm:text-5xl' : 'text-2xl sm:text-3xl')}>
        {value}
      </span>
      <span className="text-sm text-[color:var(--muted)]">{sub}</span>
      {extra}
    </button>
  )
}

const TITLES: Record<MetricKey, string> = {
  total: 'Every payment and refund behind total revenue',
  last30: 'Payments and refunds in the last 30 days',
  mrr: 'Active monthly plans counted in MRR',
  customers: 'Wallets that paid and were not refunded',
  refunds: 'Refunds issued through the contract',
}

/** Headline numbers. Selecting one lists the exact transactions it was computed from. */
export function MetricsGrid({ metrics }: { metrics: MerchantMetrics }) {
  const [selected, setSelected] = useState<MetricKey>('total')
  const rows = metrics.evidence[selected]

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-5">
        <MetricCard
          id="total"
          selected={selected}
          onSelect={setSelected}
          hero
          className="sm:col-span-3"
          label="Verified revenue"
          value={fmtUsd(metrics.net)}
          sub={`${fmtUsd(metrics.gross)} received, ${fmtUsd(metrics.refunded)} refunded`}
        />
        <MetricCard
          id="mrr"
          selected={selected}
          onSelect={setSelected}
          className="sm:col-span-2"
          label="Monthly recurring revenue"
          value={fmtUsd(metrics.mrr)}
          sub={`${metrics.activeSubs.length} active monthly plan${metrics.activeSubs.length === 1 ? '' : 's'}`}
          extra={<ContractCheck merchantId={metrics.merchant.id} computed={metrics.mrr} />}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard id="last30" selected={selected} onSelect={setSelected} label="Last 30 days" value={fmtUsd(metrics.last30)} sub="Net of refunds" />
        <MetricCard
          id="customers"
          selected={selected}
          onSelect={setSelected}
          label="Paying customers"
          value={metrics.customers.toLocaleString('en-US')}
          sub={metrics.paymentCount > 0 ? `${metrics.topPayerShare.toFixed(0)}% of revenue from the largest payer` : 'No payments yet'}
        />
        <MetricCard
          id="refunds"
          selected={selected}
          onSelect={setSelected}
          label="Refunds"
          value={fmtUsd(metrics.refunded)}
          sub={`${metrics.refundCount} refund${metrics.refundCount === 1 ? '' : 's'} issued`}
        />
      </div>

      <section className="card p-5" aria-live="polite">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="display text-lg font-semibold">{TITLES[selected]}</h3>
          <span className="text-xs text-[color:var(--muted)]">Each row opens the transaction in the Arc explorer</span>
        </div>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-[color:var(--muted)]">Nothing to show here yet.</p>
        ) : (
          <ul className="mt-3 max-h-80 divide-y divide-[color:var(--border)] overflow-y-auto">
            {rows.map((row) => (
              <li key={row.key} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{row.title.startsWith('0x') ? shortAddress(row.title) : row.title}</p>
                  <p className="truncate text-xs text-[color:var(--muted)]">
                    {row.detail}
                    {row.at ? ` · ${fmtDateTime(row.at)}` : ''}
                  </p>
                </div>
                <ExplorerLink href={row.href} className="num shrink-0 text-sm font-semibold">
                  {row.tone === 'out' ? '-' : ''}
                  {row.amount !== undefined ? fmtUsd(row.amount) : 'View'}
                </ExplorerLink>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
