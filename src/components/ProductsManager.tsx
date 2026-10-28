import { useEffect, useState, type FormEvent } from 'react'
import { ExternalLink, Pause, Pencil, Play } from 'lucide-react'
import { clsx } from 'clsx'
import type { MerchantRec, ProductRec, PaymentRec } from '@/lib/indexer'
import { BILLING_LABEL, CHAIN_ID, ROUTER_ADDRESS, routerAbi, type Billing } from '@/lib/contract'
import { fmtUsd } from '@/lib/format'
import { getShareBase } from '@/lib/share'
import { useRouterTx } from '@/lib/useRouterTx'
import { parseUsdc, formatUsdc } from '@/onchain-money'
import { Link } from '@/lib/nav'
import { CopyButton, EmptyState, Field, Pill, Spinner } from './ui'

function parsePrice(value: string): bigint | null {
  try {
    const raw = parseUsdc(value.trim())
    return raw > 0n ? raw : null
  } catch {
    return null
  }
}

function CreateProduct({ merchantId }: { merchantId: number }) {
  const { write, run, busy } = useRouterTx()
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [billing, setBilling] = useState<Billing>(1)
  const raw = parsePrice(price)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!raw || !name.trim()) return
    const ok = await run(
      () =>
        write({
          address: ROUTER_ADDRESS,
          abi: routerAbi,
          functionName: 'createProduct',
          args: [BigInt(merchantId), name.trim(), raw, billing],
          chainId: CHAIN_ID,
        }),
      'Product created',
    )
    if (ok) {
      setName('')
      setPrice('')
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="grid gap-4 rounded-2xl bg-[color:var(--surface-muted)] p-4 sm:grid-cols-[1fr_140px_auto] sm:items-end">
      <Field label="Product name">
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={64} placeholder="Pro plan" autoComplete="off" />
      </Field>
      <Field label="Price (USDC)">
        <input className="field num" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="29.00" autoComplete="off" />
      </Field>
      <div className="sm:col-span-3 sm:col-start-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-xl border border-[color:var(--border)] bg-white p-1" role="radiogroup" aria-label="Billing">
            {([1, 0] as Billing[]).map((b) => (
              <button
                key={b}
                type="button"
                role="radio"
                aria-checked={billing === b}
                onClick={() => setBilling(b)}
                className={clsx(
                  'min-h-[36px] rounded-lg px-4 text-sm font-semibold transition-colors',
                  billing === b ? 'bg-[color:var(--accent)] text-white' : 'text-[color:var(--muted)] hover:text-[color:var(--ink)]',
                )}
              >
                {BILLING_LABEL[b]}
              </button>
            ))}
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy || !raw || !name.trim()}>
            {busy ? <Spinner /> : null} Create product
          </button>
        </div>
        {billing === 1 && (
          <p className="mt-2 text-xs text-[color:var(--muted)]">
            Monthly plans run 30 days per payment. Customers renew by paying again, and only paid-up plans count toward MRR.
          </p>
        )}
      </div>
    </form>
  )
}

function ProductRow({ product, base, stats }: { product: ProductRec; base: string | null; stats: { count: number; revenue: bigint } }) {
  const { write, run, busy } = useRouterTx()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(product.name)
  const [price, setPrice] = useState(formatUsdc(product.price))
  const raw = parsePrice(price)
  const link = base ? `${base}/pay/${product.id}` : ''

  const startEdit = () => {
    setName(product.name)
    setPrice(formatUsdc(product.price))
    setEditing(true)
  }

  const toggle = () =>
    run(
      () =>
        write({
          address: ROUTER_ADDRESS,
          abi: routerAbi,
          functionName: 'setProductActive',
          args: [BigInt(product.id), !product.active],
          chainId: CHAIN_ID,
        }),
      product.active ? 'Product paused' : 'Product live again',
    )

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!raw || !name.trim()) return
    const ok = await run(
      () =>
        write({
          address: ROUTER_ADDRESS,
          abi: routerAbi,
          functionName: 'updateProduct',
          args: [BigInt(product.id), name.trim(), raw],
          chainId: CHAIN_ID,
        }),
      'Product updated',
    )
    if (ok) setEditing(false)
  }

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold">{product.name}</p>
            <Pill>{BILLING_LABEL[product.billing]}</Pill>
            <Pill tone={product.active ? 'good' : 'warn'}>{product.active ? 'Live' : 'Paused'}</Pill>
          </div>
          <p className="mt-1 text-xs text-[color:var(--muted)]">
            <span className="num">{stats.count}</span> payment{stats.count === 1 ? '' : 's'} ·{' '}
            <span className="num">{fmtUsd(stats.revenue)}</span> received
          </p>
        </div>
        <p className="display num text-xl font-semibold">{fmtUsd(product.price)}</p>
      </div>

      {editing ? (
        <form onSubmit={(e) => void save(e)} className="mt-3 grid gap-3 sm:grid-cols-[1fr_140px_auto_auto] sm:items-end">
          <Field label="Name">
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={64} />
          </Field>
          <Field label="Price (USDC)">
            <input className="field num" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
          </Field>
          <button type="submit" className="btn btn-primary" disabled={busy || !raw || !name.trim()}>
            {busy ? <Spinner /> : null} Save
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <CopyButton value={link} label="Copy payment link" disabled={!link} />
          <Link to={`/pay/${product.id}`} className="btn btn-ghost btn-sm">
            <ExternalLink className="h-4 w-4" aria-hidden /> Open checkout
          </Link>
          <button type="button" className="btn btn-ghost btn-sm" onClick={startEdit}>
            <Pencil className="h-4 w-4" aria-hidden /> Edit
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void toggle()} disabled={busy}>
            {busy ? <Spinner /> : product.active ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
            {product.active ? 'Pause' : 'Resume'}
          </button>
        </div>
      )}
      {link && !editing && <p className="mono mt-2 truncate text-xs text-[color:var(--subtle)]">{link}</p>}
    </li>
  )
}

export function ProductsManager({ merchant, products, payments }: { merchant: MerchantRec; products: ProductRec[]; payments: PaymentRec[] }) {
  const [base, setBase] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void getShareBase().then((b) => live && setBase(b))
    return () => {
      live = false
    }
  }, [])

  return (
    <section className="card space-y-5 p-5 sm:p-6">
      <div>
        <h2 className="display text-xl font-semibold">Products and payment links</h2>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Share a link anywhere. Add <span className="mono">?ref=order-123</span> to a link to attach your own order reference to the receipt.
        </p>
      </div>
      <CreateProduct merchantId={merchant.id} />
      {products.length === 0 ? (
        <EmptyState title="No products yet" body="Create your first product above to get a payment link." />
      ) : (
        <ul className="divide-y divide-[color:var(--border)]">
          {products.map((p) => {
            const mine = payments.filter((x) => x.productId === p.id && !x.refund)
            return (
              <ProductRow
                key={p.id}
                product={p}
                base={base}
                stats={{ count: mine.length, revenue: mine.reduce((a, x) => a + x.amount, 0n) }}
              />
            )
          })}
        </ul>
      )}
    </section>
  )
}
