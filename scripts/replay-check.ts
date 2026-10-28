/**
 * Sanity check for the event replay behind every revenue page.
 * Feeds hand-built events through derive() and computeMerchantMetrics() and asserts the
 * numbers the contract tests expect (MRR excludes one-time and expired plans, refunds net out).
 * Run: VITE_ROUTER_ADDRESS=0x... VITE_ROUTER_DEPLOY_BLOCK=1 bun run scripts/replay-check.ts
 */
import { derive, type RouterLog } from '../src/lib/indexer'
import { computeMerchantMetrics } from '../src/lib/metrics'

const DAY = 86_400
const T0 = 1_800_000_000
const alice = '0x00000000000000000000000000000000000000a1'
const bob = '0x00000000000000000000000000000000000000b2'
const carol = '0x00000000000000000000000000000000000000c3'
const owner = '0x00000000000000000000000000000000000000d4'
let index = 0

function log(eventName: string, args: Record<string, unknown>): RouterLog {
  index += 1
  return { eventName, args, blockNumber: BigInt(index), logIndex: 0, transactionHash: `0x${index.toString(16).padStart(64, '0')}` } as unknown as RouterLog
}

const usdc = (n: number) => BigInt(n) * 1_000_000n
const events: RouterLog[] = [
  log('MerchantRegistered', { merchantId: 1n, owner, payout: owner, slug: 'acme', name: 'Acme' }),
  log('ProductCreated', { merchantId: 1n, productId: 1n, name: 'Pro', price: usdc(30), billing: 1 }),
  log('ProductCreated', { merchantId: 1n, productId: 2n, name: 'Ebook', price: usdc(50), billing: 0 }),
  // alice: monthly, two consecutive periods, newest refunded
  log('Payment', { merchantId: 1n, productId: 1n, payer: alice, paymentId: 1n, amount: usdc(30), paidAt: BigInt(T0), paidUntil: BigInt(T0 + 30 * DAY), orderRef: '0x' + '00'.repeat(32) }),
  log('Payment', { merchantId: 1n, productId: 1n, payer: alice, paymentId: 2n, amount: usdc(30), paidAt: BigInt(T0 + DAY), paidUntil: BigInt(T0 + 60 * DAY), orderRef: '0x' + '00'.repeat(32) }),
  log('Refund', { merchantId: 1n, productId: 1n, payer: alice, paymentId: 2n, amount: usdc(30), refundedAt: BigInt(T0 + 2 * DAY), paidUntil: BigInt(T0 + 30 * DAY) }),
  // bob: monthly that will have expired
  log('Payment', { merchantId: 1n, productId: 1n, payer: bob, paymentId: 3n, amount: usdc(30), paidAt: BigInt(T0 - 60 * DAY), paidUntil: BigInt(T0 - 30 * DAY), orderRef: '0x' + '00'.repeat(32) }),
  // carol: one-time purchase never counts toward MRR
  log('Payment', { merchantId: 1n, productId: 2n, payer: carol, paymentId: 4n, amount: usdc(50), paidAt: BigInt(T0 + 3 * DAY), paidUntil: 0n, orderRef: '0x' + '00'.repeat(32) }),
]

const data = derive(events)
const merchant = data.merchantBySlug.get('acme')
if (!merchant) throw new Error('merchant missing')
const m = computeMerchantMetrics(data, merchant, T0 + 5 * DAY)

const expect = (label: string, actual: unknown, expected: unknown) => {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`)
  console.log(`ok  ${label} = ${String(actual)}`)
}

expect('gross', m.gross, usdc(30 + 30 + 30 + 50))
expect('refunded', m.refunded, usdc(30))
expect('net', m.net, usdc(110))
expect('mrr (alice only, rolled back to first period)', m.mrr, usdc(30))
expect('active subs', m.activeSubs.length, 1)
expect('customers (refunded payment excluded, expired still a customer)', m.customers, 3)
expect('refund count', m.refundCount, 1)
// later: alice's plan lapses, MRR drops to zero
const later = computeMerchantMetrics(data, merchant, T0 + 40 * DAY)
expect('mrr after plan lapses', later.mrr, 0n)
console.log('replay check passed')
