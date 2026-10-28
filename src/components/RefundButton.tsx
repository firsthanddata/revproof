import { useState } from 'react'
import { Amount, usdcToGasToken } from '@/onchain-money'
import type { PaymentRec } from '@/lib/indexer'
import { CHAIN_ID, ROUTER_ADDRESS, USDC_DECIMALS, routerAbi } from '@/lib/contract'
import { fmtUsd, shortAddress } from '@/lib/format'
import { useRouterTx } from '@/lib/useRouterTx'
import { Spinner } from './ui'

/** Two-step refund: the merchant funds it from their own wallet and the contract forwards it to the payer. */
export function RefundButton({ payment }: { payment: PaymentRec }) {
  const { write, run, busy } = useRouterTx()
  const [confirming, setConfirming] = useState(false)

  if (payment.refund) return null

  if (!confirming) {
    return (
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(true)}>
        Refund
      </button>
    )
  }

  const refund = async () => {
    const value = usdcToGasToken(CHAIN_ID, Amount.fromRaw(payment.amount, USDC_DECIMALS)).raw
    const ok = await run(
      () =>
        write({
          address: ROUTER_ADDRESS,
          abi: routerAbi,
          functionName: 'refund',
          args: [BigInt(payment.id)],
          value,
          chainId: CHAIN_ID,
        }),
      'Refund sent',
    )
    if (ok) setConfirming(false)
  }

  return (
    <span className="flex items-center gap-2">
      <span className="hidden text-xs text-[color:var(--muted)] sm:inline">
        Send {fmtUsd(payment.amount)} to {shortAddress(payment.payer)}?
      </span>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => void refund()} disabled={busy}>
        {busy ? <Spinner /> : null} Confirm
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)} disabled={busy}>
        Cancel
      </button>
    </span>
  )
}
