// next/link in the offline build: a plain link; the offline router handles the click.
import { forwardRef, type AnchorHTMLAttributes } from 'react'

type Href = string | { pathname?: string; query?: Record<string, string | number | undefined> }
type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: Href; prefetch?: boolean | null; replace?: boolean; scroll?: boolean; shallow?: boolean; passHref?: boolean; legacyBehavior?: boolean
}

function toHref(h: Href): string {
  if (typeof h === 'string') return h
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(h.query ?? {})) if (v !== undefined) q.set(k, String(v))
  const s = q.toString()
  return (h.pathname ?? '') + (s ? `?${s}` : '')
}

const Link = forwardRef<HTMLAnchorElement, Props>(function Link(
  { href, prefetch: _p, replace, scroll: _s, shallow: _sh, passHref: _ph, legacyBehavior: _l, ...rest }, ref,
) {
  return <a ref={ref} href={toHref(href)} data-replace={replace ? '' : undefined} {...rest} />
})
export default Link
