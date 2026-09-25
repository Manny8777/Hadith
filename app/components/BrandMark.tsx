export default function BrandMark({ size = 56, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 72 72"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="brand-seal-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E6C77A" />
          <stop offset="0.55" stopColor="#C79A45" />
          <stop offset="1" stopColor="#9A6C2A" />
        </linearGradient>
      </defs>
      <path
        d="M36 3C19.5 3 7 15.5 7 32v37h58V32C65 15.5 52.5 3 36 3Z"
        fill="#123B32"
        stroke="url(#brand-seal-gold)"
        strokeWidth="2"
      />
      <path
        d="M36 9C23 9 13 19 13 32v31h46V32C59 19 49 9 36 9Z"
        fill="none"
        stroke="#E6C77A"
        strokeWidth="1.25"
        opacity="0.78"
      />
      <path
        d="m36 15 2.5 6.5 6.7-1.9-1.9 6.7 6.5 2.5-6.5 2.5 1.9 6.7-6.7-1.9L36 43l-2.5-6.4-6.7 1.9 1.9-6.7-6.5-2.5 6.5-2.5-1.9-6.7 6.7 1.9z"
        fill="none"
        stroke="url(#brand-seal-gold)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M21 38c5.3-3 10.3-3 15 0 4.7-3 9.7-3 15 0v11c-5.3-3-10.3-3-15 0-4.7-3-9.7-3-15 0z"
        fill="#F3E8C9"
        stroke="#B28A43"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M36 38v11" stroke="#123B32" strokeWidth="1.15" />
      <path d="M25 50c3.5-1.5 7-1.5 11 0 4-1.5 7.5-1.5 11 0" fill="none" stroke="#B28A43" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  )
}
