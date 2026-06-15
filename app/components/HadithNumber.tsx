'use client'
import { useNumbering } from '@/lib/numberingContext'

interface Props {
  harf: string | null | undefined
  matboa: string | null | undefined
  className?: string
}

export default function HadithNumber({ harf, matboa, className = '' }: Props) {
  const { pref, toggle } = useNumbering()

  const h = harf?.trim() || null
  const m = matboa?.trim() || null

  if (!h && !m) return null

  return (
    <span className={`inline-flex items-center rounded-md border border-gray-200 overflow-hidden text-[11px] font-mono ${className}`}>
      {h && (
        <button
          onClick={toggle}
          title="ترقيم حرف"
          className={`flex items-center gap-1 px-2 py-0.5 transition-colors ${
            pref === 'harf'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-400 hover:bg-gray-50'
          }`}
        >
          <span className="font-sans font-bold text-[9px] opacity-80">ح</span>
          {h}
        </button>
      )}
      {h && m && <span className="w-px bg-gray-200 self-stretch shrink-0" />}
      {m && (
        <button
          onClick={toggle}
          title="ترقيم مطبوع"
          className={`flex items-center gap-1 px-2 py-0.5 transition-colors ${
            pref === 'matboa'
              ? 'bg-amber-600 text-white'
              : 'bg-white text-gray-400 hover:bg-gray-50'
          }`}
        >
          <span className="font-sans font-bold text-[9px] opacity-80">ط</span>
          {m}
        </button>
      )}
    </span>
  )
}
