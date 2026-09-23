import Link from 'next/link'

/**
 * A whole-card link rendered as an absolutely positioned overlay.
 *
 * Why not wrap the card itself in a <Link>: these cards contain their own links (book, narrator),
 * and an <a> inside an <a> is invalid HTML. The usual trick is to let the inner link stop the click
 * with onClick — but that handler would be created in a server component and passed to a client
 * <Link>, which React refuses ("Event handlers cannot be passed to Client Component props"), so the
 * whole page fails to render. An overlay keeps the card clickable with no handler at all.
 *
 * Usage: make the card `relative`, put <StretchedLink> first inside it, give any inner links
 * `relative z-10`, and they stay clickable above the overlay.
 */
export default function StretchedLink({ href, label }: { href: string; label?: string }) {
  return <Link href={href} className="absolute inset-0" aria-label={label} />
}
