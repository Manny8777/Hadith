'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

interface NarratorInChain {
  narrator_id: number
  name: string
  abb_name: string | null
  is_companion: boolean
  martaba_ibn_hajar: string | null
  tabaqa: string | null
  pos: number
  reliability: string
}

interface ChainData {
  chain_id: number
  chain_length: number | null
  narrators: NarratorInChain[]
  has_weak: boolean
  weak_count: number
  all_authentic: boolean
}

interface Props {
  hadithId: number
}


export default function ChainAnalysis({ hadithId }: Props) {
  const [data, setData] = useState<{ chains: ChainData[]; total_chains: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  function load() {
    if (data) { setOpen(o => !o); return }
    setLoading(true)
    fetch(`/api/hadith/${hadithId}/chain-analysis`)
      .then(r => r.json())
      .then(d => { setData(d); setOpen(true) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  if (!open && !loading) {
    return (
      <button
        onClick={load}
        className="text-xs text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
      >
        تحليل رجال السند
      </button>
    )
  }

  if (loading) {
    return <span className="text-xs text-gray-400">جاري التحليل...</span>
  }

  if (!data || data.chains.length === 0) {
    return <span className="text-xs text-gray-400">لا تتوفر بيانات الإسناد</span>
  }

  const bestChain = data.chains[0]

  return (
    <div className="mt-4 bg-white rounded-xl border border-blue-100 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-blue-900">
          تحليل رجال السند
          <span className="text-xs font-normal text-gray-400 mr-2">({data.total_chains} سند)</span>
        </h3>
        <button onClick={() => setOpen(false)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
      </div>

      {/* Best chain summary */}
      <div className={`rounded-lg p-3 mb-3 ${bestChain.all_authentic ? 'bg-green-50 border border-green-200' : bestChain.weak_count === 1 ? 'bg-yellow-50 border border-yellow-200' : 'bg-red-50 border border-red-200'}`}>
        <div className="text-xs font-medium mb-1">
          {bestChain.all_authentic
            ? '✓ أفضل إسناد: رجاله كلهم موثقون'
            : bestChain.weak_count === 1
            ? `⚠ أفضل إسناد: فيه ${bestChain.weak_count} راوٍ مضعَّف`
            : `✗ أفضل إسناد: فيه ${bestChain.weak_count} رواة مضعَّفون`}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {bestChain.narrators.map((n, idx) => (
            <span key={idx} className="flex items-center gap-1">
              <Link
                href={`/narrator/${n.narrator_id}`}
                className="text-xs px-2 py-0.5 rounded border border-gray-200 bg-gray-50 text-gray-800 hover:border-gray-400 hover:bg-white transition-all"
                title={n.name}
              >
                {(n.abb_name || n.name).split('،')[0].trim().split(' ').slice(0, 2).join(' ')}
              </Link>
              {idx < bestChain.narrators.length - 1 && (
                <span className="text-gray-300 text-xs">←</span>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Other chains summary */}
      {data.chains.length > 1 && (
        <div className="space-y-2">
          {data.chains.slice(1, 4).map(chain => (
            <div key={chain.chain_id} className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                chain.all_authentic ? 'bg-green-100 text-green-700' :
                chain.weak_count <= 1 ? 'bg-yellow-100 text-yellow-700' :
                'bg-red-100 text-red-600'
              }`}>
                {chain.chain_length ? `${chain.chain_length} رجال` : 'سند'}
              </span>
              {chain.narrators.slice(0, 4).map((n, idx) => (
                <span key={idx} className="flex items-center gap-1">
                  <Link
                    href={`/narrator/${n.narrator_id}`}
                    className="text-xs px-1.5 py-0.5 rounded border border-gray-200 bg-gray-50 text-gray-800 hover:border-gray-400 transition-all"
                    title={n.name}
                  >
                    {(n.abb_name || n.name).split('،')[0].trim().split(' ')[0]}
                  </Link>
                  {idx < Math.min(3, chain.narrators.length - 1) && (
                    <span className="text-gray-300 text-xs">←</span>
                  )}
                </span>
              ))}
              {chain.narrators.length > 4 && (
                <span className="text-xs text-gray-400">... +{chain.narrators.length - 4}</span>
              )}
            </div>
          ))}
          {data.chains.length > 4 && (
            <p className="text-xs text-gray-400">
              + {data.chains.length - 4} أسانيد أخرى —{' '}
              <Link href={`/hadith/${hadithId}/chains`} className="text-blue-600 hover:underline">
                عرض مقارنة الأسانيد
              </Link>
            </p>
          )}
        </div>
      )}

    </div>
  )
}
