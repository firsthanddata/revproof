import { useState, type FormEvent } from 'react'
import { isAddress } from 'viem'
import { useAccount, useReadContract } from 'wagmi'
import { CHAIN_ID, ROUTER_ADDRESS, routerAbi } from '@/lib/contract'
import { useRouterTx } from '@/lib/useRouterTx'
import { navigate } from '@/lib/nav'
import { Field, Spinner } from './ui'

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/
const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '')

export function RegisterMerchant({ onDone }: { onDone?: () => void }) {
  const { address } = useAccount()
  const { write, run, busy } = useRouterTx()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [payout, setPayout] = useState('')

  const effectiveSlug = slugTouched ? slug : slugify(name)
  const effectivePayout = payout || address || ''
  const slugValid = SLUG_RE.test(effectiveSlug)
  const payoutValid = isAddress(effectivePayout)
  const nameValid = name.trim().length > 0 && name.trim().length <= 64

  const taken = useReadContract({
    address: ROUTER_ADDRESS,
    abi: routerAbi,
    functionName: 'merchantIdBySlug',
    args: [effectiveSlug],
    chainId: CHAIN_ID,
    query: { enabled: slugValid },
  })
  const slugTaken = slugValid && taken.data !== undefined && taken.data > 0n

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!nameValid || !slugValid || !payoutValid || slugTaken) return
    const ok = await run(
      () =>
        write({
          address: ROUTER_ADDRESS,
          abi: routerAbi,
          functionName: 'registerMerchant',
          args: [name.trim(), effectiveSlug, effectivePayout],
          chainId: CHAIN_ID,
        }),
      'Business registered',
    )
    if (ok) {
      onDone?.()
      navigate('/dashboard')
    }
  }

  let slugHint = 'Your public page will live at /m/' + (effectiveSlug || 'your-business')
  if (effectiveSlug && !slugValid) slugHint = 'Use 3-32 lowercase letters, numbers and dashes, not starting or ending with a dash.'
  else if (slugTaken) slugHint = 'That URL is already taken. Try another.'
  else if (slugValid && taken.data !== undefined) slugHint = `Available. Your public page will live at /m/${effectiveSlug}`

  return (
    <form onSubmit={(e) => void submit(e)} className="card mx-auto max-w-lg space-y-5 p-6 sm:p-8">
      <div>
        <h2 className="display text-2xl font-semibold">Register your business</h2>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          One transaction. The URL is permanent, and you can change the payout wallet later.
        </p>
      </div>
      <Field label="Business name">
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={64} placeholder="Acme Analytics" autoComplete="off" />
      </Field>
      <Field label="Public URL" hint={slugHint}>
        <input
          className="field mono"
          value={effectiveSlug}
          onChange={(e) => {
            setSlugTouched(true)
            setSlug(e.target.value.toLowerCase())
          }}
          maxLength={32}
          placeholder="acme-analytics"
          autoComplete="off"
          aria-invalid={Boolean(effectiveSlug) && (!slugValid || slugTaken)}
        />
      </Field>
      <Field label="Payout wallet" hint="Customer payments are forwarded here in the same transaction.">
        <input
          className="field mono"
          value={payout}
          onChange={(e) => setPayout(e.target.value.trim())}
          placeholder={address ?? '0x…'}
          autoComplete="off"
          aria-invalid={Boolean(payout) && !payoutValid}
        />
      </Field>
      <button type="submit" className="btn btn-primary w-full" disabled={busy || !nameValid || !slugValid || !payoutValid || slugTaken}>
        {busy ? (
          <>
            <Spinner /> Registering
          </>
        ) : (
          'Register business'
        )}
      </button>
    </form>
  )
}
