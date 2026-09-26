import Image from 'next/image'

/** The supplied Al-Jami artwork, framed to its emblem or complete wordmark. */
export default function BrandMark({
  size = 56,
  className = '',
  full = false,
}: { size?: number; className?: string; full?: boolean }) {
  return (
    <span
      className={['brand-mark', full ? 'brand-mark-full' : 'brand-mark-emblem', className].join(' ')}
      style={{ width: size, height: full ? size * 1.42 : size }}
      aria-hidden="true"
    >
      <Image
        src="/assets/brand/al-jami-logo.png"
        alt=""
        width={1536}
        height={1024}
        sizes={Math.ceil(size * (full ? 2.33 : 2.72)) + 'px'}
        className="brand-mark-image"
      />
    </span>
  )
}
