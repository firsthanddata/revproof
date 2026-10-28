/**
 * Live end-to-end run against the deployed RevenueRouter on Arc Testnet.
 * Two throwaway wallets (keys in /tmp, never printed): a merchant and a customer.
 * Flow: register, create one-time + monthly products, pay both with order refs,
 * refund the one-time payment, then recompute every public number the way the app does
 * (event replay) and compare with the contract's own views and the badge snippet.
 *
 * Run: VITE_ROUTER_ADDRESS=0x... VITE_ROUTER_DEPLOY_BLOCK=N bun run contracts/test-integration/e2e-testnet.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createPublicClient, createWalletClient, erc20Abi, http, parseEventLogs, type Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'
import { ROUTER_ADDRESS, RPC_URL, USDC_ADDRESS, routerAbi, DEPLOY_BLOCK } from '../../src/lib/contract'
import { decodeLogs, derive, fetchLogs } from '../../src/lib/indexer'
import { computeLeaderboard, computeMerchantMetrics } from '../../src/lib/metrics'
import { buildBadgeSnippet } from '../../src/components/BadgeEmbed'
import { orderRefToBytes32 } from '../../src/lib/format'

const load = (file: string) => {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as { private_key: Hex } | { private_key: Hex }[]
  return privateKeyToAccount((Array.isArray(raw) ? raw[0] : raw).private_key)
}
const merchant = load('/tmp/e2e-merchant.json')
const customer = load('/tmp/e2e-customer.json')
const payout = privateKeyToAccount(generatePrivateKey())

const pub = createPublicClient({ chain: arcTestnet, transport: http(RPC_URL) })
const walletFor = (account: ReturnType<typeof load>) => createWalletClient({ account, chain: arcTestnet, transport: http(RPC_URL) })
const usdc = (n: number) => BigInt(Math.round(n * 1_000_000))
const toNative = (raw: bigint) => raw * 1_000_000_000_000n
const balance = (address: `0x${string}`) => pub.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [address] })

const steps: { step: string; hash: Hex; note?: string }[] = []
const results: { check: string; ok: boolean; detail: string }[] = []
const check = (name: string, ok: boolean, detail: string) => {
  results.push({ check: name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${detail}`)
}

async function send(step: string, account: ReturnType<typeof load>, request: Parameters<ReturnType<typeof walletFor>['writeContract']>[0], note?: string) {
  const hash = await walletFor(account).writeContract(request)
  const receipt = await pub.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error(`${step} reverted (${hash})`)
  steps.push({ step, hash, note })
  console.log(`tx  ${step}: ${hash}`)
  return receipt
}

const slug = `e2e-${Date.now().toString(36)}`
console.log('merchant', merchant.address, 'customer', customer.address, 'payout', payout.address, 'slug', slug)
console.log('balances', await balance(merchant.address), await balance(customer.address))

const base = { address: ROUTER_ADDRESS, abi: routerAbi } as const

// 1. register
const reg = await send('registerMerchant', merchant, { ...base, functionName: 'registerMerchant', args: ['E2E Studio', slug, payout.address] } as never)
const merchantId = parseEventLogs({ abi: routerAbi, logs: reg.logs, eventName: 'MerchantRegistered' })[0].args.merchantId

// 2. products
const p1 = await send('createProduct (one-time, 2 USDC)', merchant, { ...base, functionName: 'createProduct', args: [merchantId, 'E2E Ebook', usdc(2), 0] } as never)
const oneTimeId = parseEventLogs({ abi: routerAbi, logs: p1.logs, eventName: 'ProductCreated' })[0].args.productId
const p2 = await send('createProduct (monthly, 3 USDC)', merchant, { ...base, functionName: 'createProduct', args: [merchantId, 'E2E Pro plan', usdc(3), 1] } as never)
const monthlyId = parseEventLogs({ abi: routerAbi, logs: p2.logs, eventName: 'ProductCreated' })[0].args.productId

// 3. pay both from the second wallet, with order refs
const before = await balance(payout.address)
const pay1 = await send('pay one-time (ref e2e-order-1)', customer, { ...base, functionName: 'pay', args: [oneTimeId, orderRefToBytes32('e2e-order-1')], value: toNative(usdc(2)) } as never)
const pay2 = await send('pay monthly (ref e2e-order-2)', customer, { ...base, functionName: 'pay', args: [monthlyId, orderRefToBytes32('e2e-order-2')], value: toNative(usdc(3)) } as never)
const after = await balance(payout.address)
const ev1 = parseEventLogs({ abi: routerAbi, logs: pay1.logs, eventName: 'Payment' })[0].args
const ev2 = parseEventLogs({ abi: routerAbi, logs: pay2.logs, eventName: 'Payment' })[0].args
check('funds forwarded to payout wallet', after - before === usdc(5), `payout received ${after - before} (expected ${usdc(5)})`)
check('router holds no funds', (await balance(ROUTER_ADDRESS)) === 0n, `router balance ${await balance(ROUTER_ADDRESS)}`)
check('one-time event', ev1.paidUntil === 0n && ev1.amount === usdc(2) && ev1.orderRef === orderRefToBytes32('e2e-order-1'), `paidUntil ${ev1.paidUntil}, amount ${ev1.amount}`)
check('monthly event', ev2.paidUntil === ev2.paidAt + 2_592_000n && ev2.amount === usdc(3), `paidUntil ${ev2.paidUntil} = paidAt + 30d`)

// 4. refund the one-time payment (merchant funds it)
const custBefore = await balance(customer.address)
await send('refund one-time payment', merchant, { ...base, functionName: 'refund', args: [ev1.paymentId], value: toNative(usdc(2)) } as never)
check('refund delivered to customer', (await balance(customer.address)) - custBefore === usdc(2), 'customer received 2 USDC back')

// 5. recompute everything like the app does
const head = await pub.getBlockNumber()
const data = derive(decodeLogs(await fetchLogs(pub, DEPLOY_BLOCK, head)))
const now = Math.floor(Date.now() / 1000)
const merchantRec = data.merchantBySlug.get(slug)
if (!merchantRec) throw new Error('merchant not found in indexed events')
const m = computeMerchantMetrics(data, merchantRec, now)
const onchainMrr = await pub.readContract({ ...base, functionName: 'mrr', args: [merchantId] })

check('gross revenue', m.gross === usdc(5), `${m.gross}`)
check('refunded', m.refunded === usdc(2), `${m.refunded}`)
check('net revenue', m.net === usdc(3), `${m.net}`)
check('last 30 days', m.last30 === usdc(3), `${m.last30}`)
check('MRR counts only the monthly plan', m.mrr === usdc(3), `${m.mrr}`)
check('MRR equals contract mrr()', m.mrr === onchainMrr, `app ${m.mrr} vs contract ${onchainMrr}`)
check('paying customers', m.customers === 1, `${m.customers}`)
check('refund count', m.refundCount === 1, `${m.refundCount}`)
check('current month bucket', m.months[m.months.length - 1].net === usdc(3), `${m.months[m.months.length - 1].net}`)

const board = computeLeaderboard(data, now)
const rank = board.findIndex((row) => row.merchant.id === Number(merchantId)) + 1
check('leaderboard lists merchant with MRR 3', rank > 0 && board[rank - 1].mrr === usdc(3), `rank ${rank} of ${board.length}`)

// 6. badge: run the exact snippet script against the live RPC
const snippet = buildBadgeSnippet(merchantRec, `https://example.test/m/${slug}`)
const script = /<script>([\s\S]*)<\/script>/.exec(snippet)?.[1] ?? ''
const node = { textContent: 'loading' }
new Function('document', 'fetch', script)({ querySelector: () => node }, fetch)
for (let i = 0; i < 40 && node.textContent === 'loading'; i++) await new Promise((r) => setTimeout(r, 250))
check('badge shows live MRR', node.textContent === '$3.00 MRR', `badge text "${node.textContent}"`)

const report = { network: 'Arc Testnet', router: ROUTER_ADDRESS, slug, merchantId: String(merchantId), oneTimeProductId: String(oneTimeId), monthlyProductId: String(monthlyId), merchant: merchant.address, customer: customer.address, payout: payout.address, steps, results }
writeFileSync('/tmp/e2e-result.json', JSON.stringify(report, null, 2))
console.log(results.every((r) => r.ok) ? 'E2E PASSED' : 'E2E FAILED')
