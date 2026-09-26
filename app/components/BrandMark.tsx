import Image from 'next/image'

/** The complete supplied Al-Jami artwork, with only transparent canvas trimmed. */
export default function BrandMark({
  size = 56,
  className = '',
}: { size?: number; className?: string }) {
  return (
    <span
      className={['brand-mark', 'brand-mark-full', className].join(' ')}
      style={{ width: size, height: size * 1.42 }}
      aria-hidden="true"
    >
      <Image
        src="/assets/brand/al-jami-logo.png"
        alt=""
        width={1536}
        height={1024}
        sizes={Math.ceil(size * 2.33) + 'px'}
        className="brand-mark-image"
      />
    </span>
  )
}
