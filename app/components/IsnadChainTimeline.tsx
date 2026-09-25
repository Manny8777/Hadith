'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Chain, NarratorInChain } from './HadithSidebarLayout'

const AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩']
function toArabicDigits(value: string | number | null | undefined): string {
  if (value == null) return ''
  return String(value).replace(/\d/g, d => AR_DIGITS[Number(d)])
}

function deathLabel(nar: NarratorInChain): string | null {
  if (nar.death_year && nar.death_year.trim()) return toArabicDigits(nar.death_year.trim())
  if (nar.death_year_num != null) return `${toArabicDigits(nar.death_year_num)}هـ`
  return null
}

const DEPTH_LABELS: Record<number, string> = {
  3: 'ثلاثي', 4: 'رباعي', 5: 'خماسي', 6: 'سداسي',
  7: 'سباعي', 8: 'ثماني', 9: 'تساعي', 10: 'عشاري',
}

type GradeTone = {
  dot: string
  text: string
  label: string
}

// Map a narrator's تقريب grade (martaba_ibn_hajar) to a colored signal.
function gradeTone(nar: NarratorInChain): GradeTone | null {
  if (nar.is_companion) return { dot: 'bg-amber-500', text: 'text-amber-800', label: nar.martaba_ibn_hajar || 'صحابي' }
  const g = nar.martaba_ibn_hajar || ''
  if (!g.trim()) return null
  if (/ضعيف|متروك|منكر|متهم|كذاب|وضع|واهٍ|واه|ساقط|مجهول|لا يُعرف/.test(g)) return { dot: 'bg-red-500', text: 'text-red-700', label: g }
  if (/مقبول|لين|صالح|مستور|صدوق سيّئ|يخطئ|يهم|اختلط/.test(g)) return { dot: 'bg-amber-500', text: 'text-amber-700', label: g }
  if (/صدوق|لا بأس/.test(g)) return { dot: 'bg-teal-500', text: 'text-teal-700', label: g }
  if (/ثقة|ثبت|حافظ|حجة|إمام|إِمَام|متقن/.test(g)) return { dot: 'bg-green-600', text: 'text-green-800', label: g }
  return { dot: 'bg-gray-400', text: 'text-gray-600', label: g }
}

function ChainRail({ chain }: { chain: Chain }) {
  const terms = chain.narratorTerms || {}
  return (
    <ol className="m-0 p-0 list-none" dir="rtl">
      {chain.narrators.map((nar, i) => {
        const isLast = i === chain.narrators.length - 1
        const tone = gradeTone(nar)
        const death = deathLabel(nar)
        const term = terms[nar.id]
        return (
          <li key={`${nar.id}-${i}`} className="flex gap-3">
            {/* Rail: node + connector */}
            <div className="flex flex-col items-center shrink-0 pt-1.5">
              <span
                className={`w-3 h-3 rounded-full shrink-0 ring-4 ring-surface ${tone ? tone.dot : 'bg-gray-300'}`}
              />
              {!isLast && <span className="w-px flex-1 bg-border my-1" />}
            </div>

            {/* Card */}
            <div className={`flex-1 min-w-0 ${isLast ? 'pb-1' : 'pb-5'}`}>
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <Link
                  href={`/narrator/${nar.id}`}
                  className="font-bold text-green-800 hover:text-green-600 hover:underline text-[15px] sm:text-base font-serif leading-snug"
                >
                  {nar.abb_name || nar.name}
                </Link>
                {death && (
                  <span className="text-[11px] text-gray-400 shrink-0 font-sans whitespace-nowrap">ت {death}</span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1.5">
                {tone && (
                  <span className={`inline-flex items-center gap-1 text-[11px] font-sans font-medium ${tone.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
                    {tone.label}
                  </span>
                )}
                {nar.tabaqa && (
                  <span className="text-[11px] text-gray-500 font-sans">{nar.tabaqa}</span>
                )}
                {term && (
                  <span className="ms-auto inline-flex items-center text-[11px] font-serif px-2 py-0.5 rounded-full bg-surface-sunken border border-border text-gray-600 whitespace-nowrap">
                    {term}
                  </span>
                )}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export default function IsnadChainTimeline({ chains }: { chains: Chain[] }) {
  const [active, setActive] = useState(0)
  if (chains.length === 0) return null

  const idx = Math.min(active, chains.length - 1)
  const chain = chains[idx]
  const depth = DEPTH_LABELS[chain.narrators.length]

  return (
    <div className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      {/* Chain selector (only when several chains exist) */}
      {chains.length > 1 && (
        <div className="ui-segmented mb-4 overflow-x-auto max-w-full">
          {chains.map((c, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              className={`ui-segmented-item whitespace-nowrap ${i === idx ? 'ui-segmented-item-active' : ''}`}
            >
              السند {toArabicDigits(i + 1)}
              <span className="text-gray-400 mr-1">· {DEPTH_LABELS[c.narrators.length] || `${toArabicDigits(c.narrators.length)} رواة`}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 mb-4">
        <h3 className="font-bold text-green-900 text-sm font-display">
          {chains.length > 1 ? `السند ${toArabicDigits(idx + 1)}` : 'سلسلة الإسناد'}
        </h3>
        <span className="text-xs text-gray-400">
          {depth ? `${depth} · ` : ''}{toArabicDigits(chain.narrators.length)} رواة
        </span>
      </div>

      <ChainRail chain={chain} />
    </div>
  )
}
