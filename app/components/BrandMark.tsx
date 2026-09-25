export default function BrandMark({ size = 56, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="brand-gold" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#E6C77A" />
          <stop offset="1" stopColor="#A77A32" />
        </linearGradient>
      </defs>
      <path d="M32 3 37.4 10.8 46.7 8.9 45 18.2 53 23.5 45 28.8 46.7 38.1 37.4 36.2 32 44 26.6 36.2 17.3 38.1 19 28.8 11 23.5l8-5.3-1.7-9.3 9.3 1.9z" fill="url(#brand-gold)" />
      <path d="M32 10v33M19 25.5c4.2-2.6 8.4-2.6 13 0 4.6-2.6 8.8-2.6 13 0M18 44c5.2-2.7 9.6-2.7 14 0 4.4-2.7 8.8-2.7 14 0" fill="none" stroke="#123B32" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 47c3.5-2 6.5-2 10 0 3.5-2 6.5-2 10 0" fill="none" stroke="#F3E8C9" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
