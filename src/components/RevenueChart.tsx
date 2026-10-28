import { useState } from 'react'
import type { MonthBucket } from '@/lib/metrics'
import { fmtUsd } from '@/lib/format'

/** Net revenue per UTC month, drawn from refund-adjusted payment events. */
export function RevenueChart({ months }: { months: MonthBucket[] }) {
  const [active, setActive] = useState<number | null>(null)
  const max = months.reduce((m, b) => (b.net > m ? b.net : m), 0n)
  const hasData = months.some((m) => m.net !== 0n)
  const focus = active !== null ? months[active] : months[months.length - 1]

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <p className="eyebrow">Monthly revenue (net of refunds)</p>
          <p className="display num mt-1 text-2xl font-semibold">{fmtUsd(focus.net)}</p>
        </div>
        <p className="text-sm text-[color:var(--muted)]">
          {new Date(focus.start * 1000).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
        </p>
      </div>
      <div className="flex h-44 items-end gap-1.5 sm:gap-2" role="list" aria-label="Net revenue by month">
        {months.map((month, i) => {
          const pct = max > 0n && month.net > 0n ? Math.max(4, Number((month.net * 100n) / max)) : 0
          const isActive = (active ?? months.length - 1) === i
          return (
            <button
              key={month.start}
              type="button"
              role="listitem"
              className="group flex h-full flex-1 flex-col items-center justify-end gap-2 focus:outline-none"
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              aria-label={`${month.label}: ${fmtUsd(month.net)}`}
            >
              <div className="flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t-md transition-all duration-300"
                  style={{
                    height: `${pct}%`,
                    minHeight: pct === 0 ? 2 : undefined,
                    background: isActive ? 'var(--accent)' : 'rgba(18,45,69,0.22)',
                  }}
                />
              </div>
              <span className="text-[10px] font-medium text-[color:var(--subtle)] sm:text-xs">{month.label}</span>
            </button>
          )
        })}
      </div>
      {!hasData && <p className="mt-3 text-sm text-[color:var(--muted)]">No payments recorded onchain yet.</p>}
    </div>
  )
}
