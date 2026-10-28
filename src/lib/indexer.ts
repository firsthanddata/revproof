import { parseEventLogs, type Address, type Hex, type Log, type PublicClient } from 'viem'
import { DEPLOY_BLOCK, ROUTER_ADDRESS, routerAbi, type Billing } from './contract'

/**
 * Everything RevProof shows is derived from the router's own event log.
 * This file turns raw logs into plain records; metrics.ts turns records into numbers.
 */

export interface EventMeta {
  blockNumber: bigint
  logIndex: number
  txHash: Hex
}

export interface MerchantRec {
  id: number
  owner: Address
  payout: Address
  slug: string
  name: string
  txHash: Hex
}

export interface ProductRec {
  id: number
  merchantId: number
  name: string
  price: bigint
  billing: Billing
  active: boolean
  txHash: Hex
}

export interface RefundRec {
  paymentId: number
  merchantId: number
  productId: number
  payer: Address
  amount: bigint
  refundedAt: number
  paidUntil: number
  txHash: Hex
}

export interface PaymentRec {
  id: number
  merchantId: number
  productId: number
  payer: Address
  amount: bigint
  paidAt: number
  /** Unix seconds the subscription runs until; 0 for one-time products. */
  paidUntil: number
  orderRef: Hex
  txHash: Hex
  blockNumber: bigint
  refund?: RefundRec
}

export interface SubRec {
  productId: number
  merchantId: number
  payer: Address
  paidUntil: number
  payments: PaymentRec[]
}

export interface Derived {
  merchants: MerchantRec[]
  products: ProductRec[]
  payments: PaymentRec[]
  refunds: RefundRec[]
  subs: SubRec[]
  merchantById: Map<number, MerchantRec>
  merchantBySlug: Map<string, MerchantRec>
  productById: Map<number, ProductRec>
}

export type RouterLog = ReturnType<typeof decodeLogs>[number]

export function decodeLogs(logs: Log[]) {
  return parseEventLogs({ abi: routerAbi, logs, strict: false }).filter(
    (log) => log.transactionHash !== null && log.logIndex !== null && log.blockNumber !== null,
  )
}

const compareLogs = (a: RouterLog, b: RouterLog) =>
  a.blockNumber === b.blockNumber ? Number((a.logIndex ?? 0) - (b.logIndex ?? 0)) : a.blockNumber < b.blockNumber ? -1 : 1

/** Replays the full event history into current state. Pure: same logs, same result. */
export function derive(logs: RouterLog[]): Derived {
  const merchants = new Map<number, MerchantRec>()
  const products = new Map<number, ProductRec>()
  const payments = new Map<number, PaymentRec>()
  const refunds: RefundRec[] = []
  const subs = new Map<string, SubRec>()

  for (const log of [...logs].sort(compareLogs)) {
    const txHash = log.transactionHash
    const args = log.args as Record<string, unknown>
    switch (log.eventName) {
      case 'MerchantRegistered': {
        const id = Number(args.merchantId)
        merchants.set(id, {
          id,
          owner: args.owner as Address,
          payout: args.payout as Address,
          slug: args.slug as string,
          name: args.name as string,
          txHash,
        })
        break
      }
      case 'MerchantUpdated': {
        const merchant = merchants.get(Number(args.merchantId))
        if (merchant) {
          merchant.payout = args.payout as Address
          merchant.name = args.name as string
        }
        break
      }
      case 'ProductCreated': {
        const id = Number(args.productId)
        products.set(id, {
          id,
          merchantId: Number(args.merchantId),
          name: args.name as string,
          price: BigInt(args.price as bigint),
          billing: Number(args.billing) === 1 ? 1 : 0,
          active: true,
          txHash,
        })
        break
      }
      case 'ProductUpdated': {
        const product = products.get(Number(args.productId))
        if (product) {
          product.name = args.name as string
          product.price = BigInt(args.price as bigint)
        }
        break
      }
      case 'ProductStatusChanged': {
        const product = products.get(Number(args.productId))
        if (product) product.active = Boolean(args.active)
        break
      }
      case 'Payment': {
        const payment: PaymentRec = {
          id: Number(args.paymentId),
          merchantId: Number(args.merchantId),
          productId: Number(args.productId),
          payer: args.payer as Address,
          amount: BigInt(args.amount as bigint),
          paidAt: Number(args.paidAt),
          paidUntil: Number(args.paidUntil),
          orderRef: args.orderRef as Hex,
          txHash,
          blockNumber: log.blockNumber,
        }
        payments.set(payment.id, payment)
        if (payment.paidUntil > 0) {
          const key = `${payment.productId}:${payment.payer}`
          const sub = subs.get(key) ?? {
            productId: payment.productId,
            merchantId: payment.merchantId,
            payer: payment.payer,
            paidUntil: 0,
            payments: [],
          }
          sub.paidUntil = payment.paidUntil
          sub.payments.push(payment)
          subs.set(key, sub)
        }
        break
      }
      case 'Refund': {
        const refund: RefundRec = {
          paymentId: Number(args.paymentId),
          merchantId: Number(args.merchantId),
          productId: Number(args.productId),
          payer: args.payer as Address,
          amount: BigInt(args.amount as bigint),
          refundedAt: Number(args.refundedAt),
          paidUntil: Number(args.paidUntil),
          txHash,
        }
        refunds.push(refund)
        const payment = payments.get(refund.paymentId)
        if (payment) {
          payment.refund = refund
          if (payment.paidUntil > 0) {
            const sub = subs.get(`${payment.productId}:${payment.payer}`)
            if (sub) sub.paidUntil = refund.paidUntil
          }
        }
        break
      }
    }
  }

  const merchantList = [...merchants.values()]
  return {
    merchants: merchantList,
    products: [...products.values()],
    payments: [...payments.values()],
    refunds,
    subs: [...subs.values()],
    merchantById: merchants,
    merchantBySlug: new Map(merchantList.map((m) => [m.slug, m])),
    productById: products,
  }
}

export const EMPTY_DERIVED: Derived = derive([])

/** Fetches router logs in bounded ranges, halving the range if the RPC rejects it. */
export async function fetchLogs(
  client: PublicClient,
  fromBlock: bigint,
  toBlock: bigint,
  onProgress?: (scanned: bigint) => void,
): Promise<Log[]> {
  if (fromBlock < DEPLOY_BLOCK) throw new Error('Refusing to scan before the deployment block')
  const out: Log[] = []
  let cursor = fromBlock
  let span = 10_000n
  let rateLimited = 0
  while (cursor <= toBlock) {
    const end = cursor + span - 1n > toBlock ? toBlock : cursor + span - 1n
    try {
      out.push(...(await client.getLogs({ address: ROUTER_ADDRESS, fromBlock: cursor, toBlock: end })))
      cursor = end + 1n
      onProgress?.(end)
      rateLimited = 0
    } catch (error) {
      // A rate limit says "slow down", not "range too large": wait and retry the same range.
      if (/429|rate.?limit|too many requests/i.test(String((error as Error)?.message ?? error))) {
        rateLimited += 1
        if (rateLimited > 5) throw error
        await new Promise((resolve) => setTimeout(resolve, 1200 * rateLimited))
        continue
      }
      if (span <= 250n) throw error
      span = span / 2n
    }
  }
  return out
}
