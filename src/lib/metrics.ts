import type { Derived, MerchantRec, PaymentRec, RefundRec, SubRec } from './indexer'
import { MONTH_SECONDS, addressUrl, txUrl } from './contract'
import { shortAddress } from './format'

/** One verifiable line behind a headline number. Every row links to the explorer. */
export interface EvidenceRow {
  key: string
  title: string
  detail: string
  amount?: bigint
  /** Unix seconds shown next to the row. */
  at?: number
  href: string
  tone?: 'in' | 'out'
}

export interface MonthBucket {
  label: string
  start: number
  net: bigint
}

export interface ActiveSub {
  sub: SubRec
  /** Amount of the latest payment that has not been refunded. */
  amount: bigint
  lastPayment: PaymentRec
}

export interface MerchantMetrics {
  merchant: MerchantRec
  gross: bigint
  refunded: bigint
  net: bigint
  last30: bigint
  mrr: bigint
  activeSubs: ActiveSub[]
  customers: number
  refundCount: number
  paymentCount: number
  /** Share of gross revenue that came from the single largest paying wallet, in percent. */
  topPayerShare: number
  months: MonthBucket[]
  recent: PaymentRec[]
  evidence: {
    total: EvidenceRow[]
    last30: EvidenceRow[]
    mrr: EvidenceRow[]
    customers: EvidenceRow[]
    refunds: EvidenceRow[]
  }
}

const sum = (values: bigint[]) => values.reduce((a, b) => a + b, 0n)

function lastMonths(now: number, count: number): MonthBucket[] {
  const base = new Date(now * 1000)
  const buckets: MonthBucket[] = []
  for (let i = count - 1; i >= 0; i--) {
    const start = Math.floor(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1) / 1000)
    const label = new Date(start * 1000).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
    buckets.push({ label, start, net: 0n })
  }
  return buckets
}

export function computeMerchantMetrics(d: Derived, merchant: MerchantRec, now: number): MerchantMetrics {
  const payments = d.payments.filter((p) => p.merchantId === merchant.id)
  const refunds = d.refunds.filter((r) => r.merchantId === merchant.id)
  const gross = sum(payments.map((p) => p.amount))
  const refunded = sum(refunds.map((r) => r.amount))
  const windowStart = now - MONTH_SECONDS
  const recentPayments = payments.filter((p) => p.paidAt >= windowStart)
  const recentRefunds = refunds.filter((r) => r.refundedAt >= windowStart)
  const last30 = sum(recentPayments.map((p) => p.amount)) - sum(recentRefunds.map((r) => r.amount))

  const activeSubs: ActiveSub[] = []
  for (const sub of d.subs) {
    if (sub.merchantId !== merchant.id || sub.paidUntil <= now) continue
    const live = sub.payments.filter((p) => !p.refund)
    const lastPayment = live[live.length - 1]
    if (lastPayment) activeSubs.push({ sub, amount: lastPayment.amount, lastPayment })
  }
  const mrr = sum(activeSubs.map((s) => s.amount))

  const customerSet = new Set(payments.filter((p) => !p.refund).map((p) => p.payer.toLowerCase()))
  const grossByPayer = new Map<string, bigint>()
  for (const p of payments) {
    const key = p.payer.toLowerCase()
    grossByPayer.set(key, (grossByPayer.get(key) ?? 0n) + p.amount)
  }
  const topPayer = [...grossByPayer.values()].reduce((a, b) => (b > a ? b : a), 0n)
  const topPayerShare = gross > 0n ? Number((topPayer * 1000n) / gross) / 10 : 0

  const months = lastMonths(now, 12)
  const bucketFor = (at: number) => months.find((m, i) => at >= m.start && (i === months.length - 1 || at < months[i + 1].start))
  for (const p of payments) {
    const bucket = bucketFor(p.paidAt)
    if (bucket) bucket.net += p.amount
  }
  for (const r of refunds) {
    const bucket = bucketFor(r.refundedAt)
    if (bucket) bucket.net -= r.amount
  }

  const productName = (id: number) => d.productById.get(id)?.name ?? `Product #${id}`
  const payRow = (p: PaymentRec): EvidenceRow => ({
    key: `pay-${p.id}`,
    title: productName(p.productId),
    detail: `Payment #${p.id} from ${shortAddress(p.payer)}`,
    amount: p.amount,
    at: p.paidAt,
    href: txUrl(p.txHash),
    tone: 'in',
  })
  const refundRow = (r: RefundRec): EvidenceRow => ({
    key: `refund-${r.paymentId}`,
    title: `Refund of payment #${r.paymentId}`,
    detail: `Returned to ${shortAddress(r.payer)}`,
    amount: r.amount,
    at: r.refundedAt,
    href: txUrl(r.txHash),
    tone: 'out',
  })
  const byTimeDesc = (a: EvidenceRow, b: EvidenceRow) => (b.at ?? 0) - (a.at ?? 0)

  const evidence = {
    total: [...payments.map(payRow), ...refunds.map(refundRow)].sort(byTimeDesc),
    last30: [...recentPayments.map(payRow), ...recentRefunds.map(refundRow)].sort(byTimeDesc),
    mrr: activeSubs.map(({ sub, amount, lastPayment }) => ({
      key: `sub-${sub.productId}-${sub.payer}`,
      title: productName(sub.productId),
      detail: `${shortAddress(sub.payer)}, active until ${new Date(sub.paidUntil * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      amount,
      at: lastPayment.paidAt,
      href: txUrl(lastPayment.txHash),
      tone: 'in' as const,
    })),
    customers: [...customerSet].map((address) => {
      const theirs = payments.filter((p) => p.payer.toLowerCase() === address && !p.refund)
      const latest = theirs[theirs.length - 1]
      return {
        key: `cust-${address}`,
        title: latest.payer,
        detail: `${theirs.length} payment${theirs.length === 1 ? '' : 's'}`,
        amount: sum(theirs.map((p) => p.amount)),
        at: latest.paidAt,
        href: addressUrl(latest.payer),
        tone: 'in' as const,
      }
    }),
    refunds: refunds.map(refundRow).sort(byTimeDesc),
  }

  return {
    merchant,
    gross,
    refunded,
    net: gross - refunded,
    last30,
    mrr,
    activeSubs,
    customers: customerSet.size,
    refundCount: refunds.length,
    paymentCount: payments.length,
    topPayerShare,
    months,
    recent: [...payments].sort((a, b) => b.paidAt - a.paidAt || b.id - a.id),
    evidence,
  }
}

export function computeLeaderboard(d: Derived, now: number): MerchantMetrics[] {
  return d.merchants
    .map((m) => computeMerchantMetrics(d, m, now))
    .sort((a, b) => (b.mrr === a.mrr ? (b.net === a.net ? a.merchant.id - b.merchant.id : b.net > a.net ? 1 : -1) : b.mrr > a.mrr ? 1 : -1))
}
