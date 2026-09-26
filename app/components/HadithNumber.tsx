'use client'
import { useNumbering } from '@/lib/numberingContext'

interface Props {
  harf: string | null | undefined
  matboa: string | null | undefined
  matboa2?: number | null
  layout?: 'source'
  className?: string
}

export default function HadithNumber({ harf, matboa, matboa2, layout, className = '' }: Props) {
  const { pref, toggle } = useNumbering()

  const h = harf?.trim() || null
  const m = matboa?.trim() || null
  const m2 = matboa2 != null ? String(matboa2) : null

  if (!h && !m && !m2) return null

  if (layout === 'source') {
    return <span className="hadith-source-number-grid">
      {[
        { value: m, label: 'المطبوع', active: pref === 'matboa' },
        { value: h, label: 'حرف', active: pref === 'harf' },
        { value: m2, label: 'المطبوع ٢', active: pref === 'matboa' },
      ].filter(item => item.value).map(item => (
        <button key={item.label} type="button" onClick={toggle} aria-pressed={item.active} title={`ترقيم ${item.label}`}>
          <span>{item.label}</span><strong>{item.value}</strong>
        </button>
      ))}
    </span>
  }

  return (
    <span className={`inline-flex items-center rounded-lg border border-gray-200 overflow-hidden text-[11px] font-mono bg-white ${className}`}>
      {h && (
        <button
          onClick={toggle}
          title="ترقيم حرف"
          className={`flex items-center gap-1 px-2 py-0.5 transition-colors font-sans ${
            pref === 'harf'
              ? 'bg-green-800 text-white'
              : 'bg-white text-gray-400 hover:bg-gray-50 hover:text-gray-600'
          }`}
        >
          <span className="font-bold text-[9px] opacity-80">ح</span>
          {h}
        </button>
      )}
      {h && m && <span className="w-px bg-gray-200 self-stretch shrink-0" />}
      {m && (
        <button
          onClick={toggle}
          title="ترقيم مطبوع"
          className={`flex items-center gap-1 px-2 py-0.5 transition-colors font-sans ${
            pref === 'matboa'
              ? 'bg-amber-700 text-white'
              : 'bg-white text-gray-400 hover:bg-gray-50 hover:text-gray-600'
          }`}
        >
          <span className="font-bold text-[9px] opacity-80">ط</span>
          {m}
        </button>
      )}
      {(m || h) && m2 && <span className="w-px bg-gray-200 self-stretch shrink-0" />}
      {m2 && (
        <button
          onClick={toggle}
          title="ترقيم مطبوع ٢"
          className={`flex items-center gap-1 px-2 py-0.5 transition-colors font-sans ${
            pref === 'matboa'
              ? 'bg-amber-700 text-white'
              : 'bg-white text-gray-400 hover:bg-gray-50 hover:text-gray-600'
          }`}
        >
          <span className="font-bold text-[9px] opacity-80">ط٢</span>
          {m2}
        </button>
      )}
    </span>
  )
}
