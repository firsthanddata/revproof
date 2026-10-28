import { useState, type ReactNode } from 'react'
import { Check, Copy, ExternalLink, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import { toast } from 'sonner'

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('animate-spin', className ?? 'h-4 w-4')} aria-hidden />
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-lg bg-[color:var(--surface-muted)]', className)} />
}

export function CopyButton({
  value,
  label = 'Copy',
  disabled,
  className,
}: {
  value: string
  label?: string
  disabled?: boolean
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast.success('Copied to clipboard')
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      toast.error('Copy failed. Select the text and copy it manually.')
    }
  }
  return (
    <button type="button" onClick={() => void copy()} disabled={disabled} className={clsx('btn btn-ghost btn-sm', className)}>
      {copied ? <Check className="h-4 w-4 text-[color:var(--success)]" /> : <Copy className="h-4 w-4" />}
      {copied ? 'Copied' : label}
    </button>
  )
}

export function ExplorerLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={clsx('link inline-flex items-center gap-1', className)}>
      {children}
      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
    </a>
  )
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const tones = {
    neutral: 'bg-[color:var(--surface-muted)] text-[color:var(--ink-2)]',
    good: 'bg-[rgba(26,128,71,0.12)] text-[color:var(--success)]',
    warn: 'bg-[rgba(176,112,0,0.12)] text-[#8a5a00]',
    bad: 'bg-[rgba(186,43,76,0.12)] text-[color:var(--danger)]',
  }
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', tones[tone])}>
      {children}
    </span>
  )
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="display text-lg font-semibold">{title}</p>
      <p className="max-w-sm text-pretty text-sm text-[color:var(--muted)]">{body}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'error' }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={clsx(
        'rounded-xl border px-4 py-3 text-sm',
        tone === 'error'
          ? 'border-[rgba(186,43,76,0.3)] bg-[rgba(186,43,76,0.06)] text-[color:var(--danger)]'
          : 'border-[color:var(--border)] bg-[color:var(--surface-muted)] text-[color:var(--ink-2)]',
      )}
    >
      {children}
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-[color:var(--ink-2)]">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-[color:var(--muted)]">{hint}</span>}
    </label>
  )
}
