import type { ReactNode } from 'react'
import type { Derived, PaymentRec } from '@/lib/indexer'
import { bytes32ToOrderRef, fmtDateTime, fmtUsd, shortAddress, timeAgo } from '@/lib/format'
import { addressUrl, txUrl } from '@/lib/contract'
import { EmptyState, ExplorerLink, Pill } from './ui'

interface Props {
  payments: PaymentRec[]
  data: Derived
  now: number
  limit?: number
  /** Optional action rendered at the end of each row, e.g. a refund button. */
  action?: (payment: PaymentRec) => ReactNode
}

/** Recent payments. The amount links to the transaction, the payer to the wallet. */
export function PaymentsTable({ payments, data, now, limit = 12, action }: Props) {
  if (payments.length === 0) {
    return <EmptyState title="No payments yet" body="Payments appear here the moment they are confirmed onchain." />
  }
  return (
    <ul className="divide-y divide-[color:var(--border)]">
      {payments.slice(0, limit).map((p) => {
        const product = data.productById.get(p.productId)
        const ref = bytes32ToOrderRef(p.orderRef)
        return (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3.5">
            <div className="min-w-0 flex-1 basis-48">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-semibold">{product?.name ?? `Product #${p.productId}`}</p>
                {p.refund && <Pill tone="bad">Refunded</Pill>}
                {p.paidUntil > 0 && !p.refund && <Pill>{p.paidUntil > now ? 'Active plan' : 'Plan ended'}</Pill>}
              </div>
              <p className="mt-0.5 text-xs text-[color:var(--muted)]">
                <ExplorerLink href={addressUrl(p.payer)} className="mono">
                  {shortAddress(p.payer)}
                </ExplorerLink>
                <span className="mx-1.5">·</span>
                <span title={fmtDateTime(p.paidAt)}>{timeAgo(p.paidAt, now)}</span>
                {ref && (
                  <>
                    <span className="mx-1.5">·</span>
                    <span className="mono">ref {ref}</span>
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <ExplorerLink href={txUrl(p.txHash)} className={`num font-semibold ${p.refund ? 'line-through opacity-60' : ''}`}>
                {fmtUsd(p.amount)}
              </ExplorerLink>
              {action?.(p)}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
