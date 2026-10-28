import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react'

function subscribe(callback: () => void) {
  window.addEventListener('popstate', callback)
  return () => window.removeEventListener('popstate', callback)
}

const snapshot = () => window.location.pathname + window.location.search

/** Current "path?query" of the app, updated on navigation. */
export function useLocation(): { path: string; search: URLSearchParams } {
  const value = useSyncExternalStore(subscribe, snapshot)
  const [path, query = ''] = value.split('?')
  return { path: path || '/', search: new URLSearchParams(query) }
}

export function navigate(to: string, options?: { replace?: boolean }) {
  if (options?.replace) window.history.replaceState({}, '', to)
  else window.history.pushState({}, '', to)
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.scrollTo({ top: 0 })
}

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string
}

/** In-app link: client-side navigation, but still a real anchor for new tabs. */
export function Link({ to, onClick, children, ...rest }: LinkProps) {
  const handle = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || rest.target === '_blank') return
    event.preventDefault()
    navigate(to)
  }
  return (
    <a href={to} onClick={handle} {...rest}>
      {children}
    </a>
  )
}
