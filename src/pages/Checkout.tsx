import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { erc20Abi, parseEventLogs } from 'viem'
import { useAccount, useReadContract, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { CheckCircle2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Link, useLocation } from '@/lib/nav'
import { Amount, usdcToGasToken } from '@/onchain-money'
import { useIndexer, useNow } from '@/lib/IndexerProvider'
import { BILLING_LABEL, CHAIN, CHAIN_ID, IS_MAINNET, ROUTER_ADDRESS, USDC_ADDRESS, USDC_DECIMALS, addressUrl, routerAbi, txUrl } from '@/lib/contract'
import { bytes32ToOrderRef, fmtDate, fmtUsd, orderRefToBytes32, parseOnchainError, shortAddress } from '@/lib/format'
import { EmptyState, ExplorerLink, Notice, Skeleton, Spinner } from '@/components/ui'

function Receipt({ hash, productName, merchantName, slug }: { hash: `0x${string}`; productName: string; merchantName: string; slug?: string }) {
  const { data: receipt } = useWaitForTransactionReceipt({ hash, chainId: CHAIN_ID })
  const payment = useMemo(() => {
    if (!receipt) return null
    return parseEventLogs({ abi: routerAbi, logs: receipt.logs, eventName: 'Payment' })[0]?.args ?? null
  }, [receipt])

  return (
    <div className="card p-6 text-center sm:p-8" aria-live="polite">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[rgba(26,128,71,0.12)]">
        <CheckCircle2 className="h-8 w-8 text-[color:var(--success)]" aria-hidden />
      </span>
      <h2 className="display mt-4 text-2xl font-semibold">Payment received</h2>
      <p className="mt-1 text-sm text-[color:var(--muted)]">
        {merchantName} got the USDC in the same transaction.
      </p>
      <dl className="mt-6 divide-y divide-[color:var(--border)] rounded-2xl bg-[color:var(--surface-muted)] px-4 text-left text-sm">
        <div className="flex justify-between gap-4 py-3">
          <dt className="text-[color:var(--muted)]">Product</dt>
          <dd className="font-semibold">{productName}</dd>
        </div>
        {payment && (
          <>
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-[color:var(--muted)]">Amount</dt>
              <dd className="num font-semibold">{fmtUsd(payment.amount ?? 0n)} USDC</dd>
            </div>
            {payment.paidUntil !== undefined && payment.paidUntil > 0n && (
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-[color:var(--muted)]">Active until</dt>
                <dd className="font-semibold">{fmtDate(payment.paidUntil)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-[color:var(--muted)]">Receipt</dt>
              <dd className="num font-semibold">#{String(payment.paymentId)}</dd>
            </div>
            {payment.orderRef && bytes32ToOrderRef(payment.orderRef) && (
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-[color:var(--muted)]">Order reference</dt>
                <dd className="mono font-semibold">{bytes32ToOrderRef(payment.orderRef)}</dd>
              </div>
            )}
          </>
        )}
      </dl>
      <div className="mt-6 flex flex-col gap-3">
        <a href={txUrl(hash)} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
          View receipt on Arc explorer
        </a>
        {slug && (
          <Link to={`/m/${slug}`} className="btn btn-ghost">
            See {merchantName}'s verified revenue
          </Link>
        )}
      </div>
    </div>
  )
}

export function Checkout({ productId }: { productId: number }) {
  const { search } = useLocation()
  const orderRef = search.get('ref')
  const { address, chainId, isConnected } = useAccount()
  const { switchChain, isPending: switching } = useSwitchChain()
  const { refresh } = useIndexer()
  const now = useNow()

  const product = useReadContract({
    address: ROUTER_ADDRESS,
    abi: routerAbi,
    functionName: 'getProduct',
    args: [BigInt(productId)],
    chainId: CHAIN_ID,
  })
  const merchantId = product.data?.merchantId
  const merchant = useReadContract({
    address: ROUTER_ADDRESS,
    abi: routerAbi,
    functionName: 'getMerchant',
    args: merchantId !== undefined ? [merchantId] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: merchantId !== undefined },
  })
  const balance = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: Boolean(address), refetchInterval: 8000 },
  })
  const subscription = useReadContract({
    address: ROUTER_ADDRESS,
    abi: routerAbi,
    functionName: 'subscriptionOf',
    args: address ? [BigInt(productId), address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: Boolean(address) && product.data?.billing === 1 },
  })

  const { writeContractAsync, isPending, data: hash, reset } = useWriteContract()
  const confirming = useWaitForTransactionReceipt({ hash, chainId: CHAIN_ID })
  const [error, setError] = useState<string | null>(null)

  const refetchBalance = balance.refetch
  useEffect(() => {
    if (confirming.isSuccess) {
      void refresh()
      void refetchBalance()
    }
  }, [confirming.isSuccess, refresh, refetchBalance])

  if (product.isLoading || (product.data && merchant.isLoading)) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <Skeleton className="h-64" />
      </div>
    )
  }
  if (product.isError || !product.data || !merchant.data) {
    return (
      <div className="mx-auto max-w-md card">
        <EmptyState title="Payment link not found" body="This product does not exist on the RevProof contract." />
      </div>
    )
  }

  const p = product.data
  const m = merchant.data
  const monthly = p.billing === 1
  const price = BigInt(p.price)
  const isOwner = Boolean(address) && (address?.toLowerCase() === m.owner.toLowerCase() || address?.toLowerCase() === m.payout.toLowerCase())
  const funds = balance.data
  const insufficient = funds !== undefined && funds < price
  const wrongChain = isConnected && chainId !== CHAIN_ID
  const activeUntil = subscription.data && subscription.data[0] > BigInt(now) ? subscription.data[0] : null

  if (hash && (confirming.isSuccess || confirming.isLoading)) {
    return (
      <div className="mx-auto max-w-md">
        {confirming.isSuccess ? (
          <Receipt hash={hash} productName={p.name} merchantName={m.name} slug={m.slug} />
        ) : (
          <div className="card flex flex-col items-center gap-3 p-10 text-center" aria-live="polite">
            <Spinner className="h-6 w-6" />
            <p className="font-semibold">Confirming on Arc…</p>
            <ExplorerLink href={txUrl(hash)} className="text-sm">
              Follow the transaction
            </ExplorerLink>
          </div>
        )}
      </div>
    )
  }

  const pay = async () => {
    setError(null)
    try {
      const value = usdcToGasToken(CHAIN_ID, Amount.fromRaw(price, USDC_DECIMALS)).raw
      await writeContractAsync({
        address: ROUTER_ADDRESS,
        abi: routerAbi,
        functionName: 'pay',
        args: [BigInt(productId), orderRefToBytes32(orderRef)],
        value,
        chainId: CHAIN_ID,
      })
    } catch (e) {
      const message = parseOnchainError(e)
      if (message) {
        setError(message)
        toast.error(message)
      }
      reset()
    }
  }

  let cta: ReactNode
  if (!isConnected) {
    cta = (
      <ConnectKitButton.Custom>
        {({ show }) => (
          <button type="button" className="btn btn-primary w-full" onClick={show}>
            Connect wallet to pay
          </button>
        )}
      </ConnectKitButton.Custom>
    )
  } else if (wrongChain) {
    cta = (
      <button type="button" className="btn btn-primary w-full" disabled={switching} onClick={() => switchChain({ chainId: CHAIN_ID })}>
        {switching ? <Spinner /> : null} Switch to {CHAIN.name}
      </button>
    )
  } else {
    cta = (
      <button type="button" className="btn btn-primary w-full" disabled={isPending || !p.active || isOwner || insufficient} onClick={() => void pay()}>
        {isPending ? (
          <>
            <Spinner /> Confirm in your wallet
          </>
        ) : insufficient ? (
          'Not enough USDC'
        ) : (
          `Pay ${fmtUsd(price)}`
        )}
      </button>
    )
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="card p-6 sm:p-8">
        <Link to={`/m/${m.slug}`} className="eyebrow hover:underline">
          {m.name}
        </Link>
        <h1 className="display mt-2 text-balance text-2xl font-semibold">{p.name}</h1>
        <p className="display num mt-6 text-5xl font-bold leading-none">
          {fmtUsd(price)}
          <span className="ml-2 align-middle text-base font-medium text-[color:var(--muted)]">
            USDC{monthly ? ' / month' : ''}
          </span>
        </p>

        <dl className="mt-6 divide-y divide-[color:var(--border)] rounded-2xl bg-[color:var(--surface-muted)] px-4 text-sm">
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-[color:var(--muted)]">Billing</dt>
            <dd className="font-semibold">{monthly ? `${BILLING_LABEL[1]}, 30 days per payment` : BILLING_LABEL[0]}</dd>
          </div>
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-[color:var(--muted)]">Goes directly to</dt>
            <dd>
              <ExplorerLink href={addressUrl(m.payout)} className="mono font-semibold">
                {shortAddress(m.payout)}
              </ExplorerLink>
            </dd>
          </div>
          {orderRef && (
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-[color:var(--muted)]">Order reference</dt>
              <dd className="mono max-w-[60%] truncate font-semibold">{orderRef}</dd>
            </div>
          )}
          {isConnected && funds !== undefined && (
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-[color:var(--muted)]">Your balance</dt>
              <dd className="num font-semibold">{fmtUsd(funds)} USDC</dd>
            </div>
          )}
        </dl>

        <div className="mt-6 space-y-3">
          {!p.active && <Notice tone="error">This product is paused by the merchant, so it cannot be paid right now.</Notice>}
          {isOwner && <Notice tone="error">This is your own product. Use a different wallet to test a payment.</Notice>}
          {activeUntil !== null && (
            <Notice>Your plan is active until {fmtDate(activeUntil)}. Paying again adds 30 more days.</Notice>
          )}
          {insufficient && !wrongChain && (
            <Notice>
              You need {fmtUsd(price)} plus a small network fee in USDC. {IS_MAINNET ? 'Add USDC to your wallet on Arc Mainnet to continue.' : 'Use "Get test USDC" in the Arc Studio sidebar to top up.'}
            </Notice>
          )}
          {error && <Notice tone="error">{error}</Notice>}
          {cta}
        </div>
      </div>
      <p className="flex items-start gap-2 px-2 text-xs text-[color:var(--muted)]">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        One transaction, no approval step. The contract sends your USDC straight to the merchant and never holds it. Network
        fees are paid in USDC.
      </p>
    </div>
  )
}
