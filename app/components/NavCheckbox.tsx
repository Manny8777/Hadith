'use client'

/**
 * A read-only checkbox that navigates when clicked — the filter toggles on this page are links in
 * disguise.
 *
 * It has to be a client component: the handler was previously attached in a server component, and
 * React refuses to serialize a function into a client component's props ("Event handlers cannot be
 * passed to Client Component props"), which took the whole page down with a 500.
 */
export default function NavCheckbox({
  checked,
  href,
  className,
}: {
  checked: boolean
  href: string
  className?: string
}) {
  return (
    <input
      type="checkbox"
      readOnly
      checked={checked}
      onClick={() => {
        window.location.href = href
      }}
      className={className}
    />
  )
}
