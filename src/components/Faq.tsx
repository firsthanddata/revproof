import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { routerUrl } from '@/lib/contract'
import { ExplorerLink } from './ui'

const ITEMS: { q: string; a: ReactNode }[] = [
  {
    q: 'What does "verified" mean here?',
    a: (
      <>
        Every number is computed in your browser from the public events of the{' '}
        <ExplorerLink href={routerUrl}>RevProof contract</ExplorerLink>. The contract forwards each payment to the merchant's payout
        wallet in the same transaction, so a counted payment is USDC that really moved onchain. Nothing is self-reported.
      </>
    ),
  },
  {
    q: 'How is MRR calculated?',
    a: 'It adds up the latest price paid by every customer whose monthly plan is still paid up today. One-time sales, expired plans and refunded payments are excluded.',
  },
  {
    q: 'Can a business fake its revenue?',
    a: 'The owner and payout wallets cannot pay their own products, but a founder could still pay from another wallet. That costs real USDC and network fees, and it shows up as a small customer count or one wallet providing most of the revenue. Check those two figures.',
  },
  {
    q: 'Can a refund fail?',
    a: 'Yes, in one case. Refunds go straight from the merchant to the paying wallet through the contract. If that wallet is a contract that rejects USDC, or is blocklisted on Arc, the refund cannot be made and the payment stays counted as revenue. Refunds of an unexpired monthly plan also have to go newest first.',
  },
  {
    q: 'Who holds the money?',
    a: 'Nobody in between. The contract never holds funds, takes no fee and has no admin keys or upgrade path.',
  },
]

export function Faq() {
  return (
    <section className="card p-5 sm:p-6" aria-labelledby="faq-title">
      <h2 id="faq-title" className="display text-xl font-semibold">
        FAQ
      </h2>
      <div className="mt-2 divide-y divide-[color:var(--border)]">
        {ITEMS.map(({ q, a }) => (
          <details key={q} className="group py-3">
            <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 font-semibold">
              {q}
              <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <p className="pb-2 pt-1 text-pretty text-sm text-[color:var(--ink-2)]">{a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
