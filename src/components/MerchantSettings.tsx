import { useState, type FormEvent } from 'react'
import { isAddress } from 'viem'
import type { MerchantRec } from '@/lib/indexer'
import { CHAIN_ID, ROUTER_ADDRESS, routerAbi } from '@/lib/contract'
import { useRouterTx } from '@/lib/useRouterTx'
import { Field, Spinner } from './ui'

export function MerchantSettings({ merchant }: { merchant: MerchantRec }) {
  const { write, run, busy } = useRouterTx()
  const [name, setName] = useState(merchant.name)
  const [payout, setPayout] = useState<string>(merchant.payout)

  const saveName = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim() || name.trim() === merchant.name) return
    await run(
      () =>
        write({
          address: ROUTER_ADDRESS,
          abi: routerAbi,
          functionName: 'setName',
          args: [BigInt(merchant.id), name.trim()],
          chainId: CHAIN_ID,
        }),
      'Name updated',
    )
  }

  const savePayout = async (event: FormEvent) => {
    event.preventDefault()
    if (!isAddress(payout) || payout.toLowerCase() === merchant.payout.toLowerCase()) return
    await run(
      () =>
        write({
          address: ROUTER_ADDRESS,
          abi: routerAbi,
          functionName: 'setPayout',
          args: [BigInt(merchant.id), payout],
          chainId: CHAIN_ID,
        }),
      'Payout wallet updated',
    )
  }

  return (
    <section className="card space-y-5 p-5 sm:p-6">
      <h2 className="display text-xl font-semibold">Business settings</h2>
      <form onSubmit={(e) => void saveName(e)} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field label="Business name">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={64} />
        </Field>
        <button type="submit" className="btn btn-ghost" disabled={busy || !name.trim() || name.trim() === merchant.name}>
          {busy ? <Spinner /> : null} Save name
        </button>
      </form>
      <form onSubmit={(e) => void savePayout(e)} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field label="Payout wallet" hint="New payments go here. Past payments are unaffected.">
          <input
            className="field mono"
            value={payout}
            onChange={(e) => setPayout(e.target.value.trim())}
            aria-invalid={!isAddress(payout)}
          />
        </Field>
        <button
          type="submit"
          className="btn btn-ghost"
          disabled={busy || !isAddress(payout) || payout.toLowerCase() === merchant.payout.toLowerCase()}
        >
          {busy ? <Spinner /> : null} Save payout
        </button>
      </form>
    </section>
  )
}
