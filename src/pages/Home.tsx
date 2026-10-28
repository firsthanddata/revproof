import { ArrowRight, Link2, ShieldCheck, Wallet } from 'lucide-react'
import { Link } from '@/lib/nav'
import { Leaderboard } from '@/components/Leaderboard'

const STEPS = [
  {
    icon: Wallet,
    title: 'Get paid in USDC',
    body: 'Customers pay through your link in one transaction. The contract forwards the USDC to your wallet instantly and never holds it.',
  },
  {
    icon: ShieldCheck,
    title: 'Revenue proves itself',
    body: 'Totals, MRR, customers and refunds are computed from onchain events only. No integrations, no screenshots.',
  },
  {
    icon: Link2,
    title: 'Share the proof',
    body: 'Send buyers and investors your public revenue page, or drop the live badge on your site.',
  },
]

export function Home() {
  return (
    <div className="space-y-14">
      <section className="pt-4 sm:pt-10">
        <p className="eyebrow">Verified onchain revenue</p>
        <h1 className="display mt-3 max-w-2xl text-balance text-4xl font-bold leading-[1.05] sm:text-6xl">
          Revenue you can prove, paid in USDC.
        </h1>
        <p className="mt-5 max-w-xl text-pretty text-lg text-[color:var(--ink-2)]">
          Revenue sites only verify card processors. RevProof gives founders paid in stablecoins a public page where every
          number links to the transaction behind it.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/dashboard" className="btn btn-primary">
            Start accepting USDC <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link to="/leaderboard" className="btn btn-ghost">
            See the leaderboard
          </Link>
        </div>
      </section>

      <section aria-labelledby="top-title">
        <div className="mb-4 flex items-end justify-between gap-3">
          <h2 id="top-title" className="display text-2xl font-semibold">
            Top businesses by MRR
          </h2>
          <Link to="/leaderboard" className="link text-sm">
            View all
          </Link>
        </div>
        <Leaderboard limit={5} />
      </section>

      <section className="grid gap-4 sm:grid-cols-3" aria-label="How it works">
        {STEPS.map(({ icon: Icon, title, body }) => (
          <div key={title} className="card p-5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[color:var(--surface-muted)]">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <h3 className="display mt-4 text-lg font-semibold">{title}</h3>
            <p className="mt-1.5 text-pretty text-sm text-[color:var(--muted)]">{body}</p>
          </div>
        ))}
      </section>
    </div>
  )
}
