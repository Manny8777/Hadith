export const dynamic = 'force-dynamic'

import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'

interface Aya {
  id: number
  aya_num: number
  text: string
  has_tafsser: boolean
  has_qera: boolean
  kerat_text: string | null
  service_main_id: number | null
}

interface Sura {
  id: number
  name: string
  has_tafsser: boolean
  has_qera: boolean
}

async function getData(suraId: number): Promise<{ sura: Sura; ayat: Aya[] } | null> {
  const [suraRes, ayatRes] = await Promise.all([
    pool.query<Sura>('SELECT * FROM quran_suras WHERE id = $1', [suraId]),
    pool.query<Aya>(
      `SELECT a.id, a.aya_num, a.text, a.has_tafsser, a.has_qera, a.kerat_text,
              qs.service_main_id
       FROM quran_ayat a
       LEFT JOIN quran_ayat_services qs ON qs.sura = $1 AND qs.aya = a.aya_num
       WHERE a.sora_id = $1
       ORDER BY a.aya_num`,
      [suraId]
    )
  ])
  if (suraRes.rows.length === 0) return null
  return { sura: suraRes.rows[0], ayat: ayatRes.rows }
}

export default async function SuraPage({ params }: { params: Promise<{ sura: string }> }) {
  const { sura } = await params
  const suraId = parseInt(sura, 10)
  if (isNaN(suraId)) notFound()

  const data = await getData(suraId)
  if (!data) notFound()

  const { sura: suraData, ayat } = data
  const ayatWithTafseer = ayat.filter(a => a.has_tafsser || a.service_main_id)

  return (
    <div dir="rtl">
      <nav className="text-xs text-gray-500 mb-4 flex items-center gap-1">
        <Link href="/quran" className="hover:text-green-700">القرآن الكريم</Link>
        <span>/</span>
        <span className="text-green-800 font-medium">سورة {suraData.name}</span>
      </nav>

      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-green-900 mb-1">
            سورة {suraData.name}
          </h1>
          <p className="text-sm text-gray-500">
            {ayat.length} آية ·{' '}
            <span className="text-amber-700 font-medium">{ayatWithTafseer.length}</span> آية لها تفسير
          </p>
        </div>
        <div className="flex gap-2">
          {suraData.has_tafsser && (
            <span className="text-sm bg-amber-50 text-amber-700 border border-amber-200 rounded-lg px-3 py-1">تفسير</span>
          )}
          {suraData.has_qera && (
            <span className="text-sm bg-blue-50 text-blue-700 border border-blue-200 rounded-lg px-3 py-1">قراءات</span>
          )}
        </div>
      </div>

      {/* Ayat list */}
      <div className="space-y-2">
        {ayat.map(aya => (
          <div
            key={aya.id}
            className={`rounded-xl border p-4 transition-all ${
              aya.has_tafsser || aya.service_main_id
                ? 'bg-white border-amber-200 hover:shadow-sm'
                : 'bg-gray-50 border-gray-100'
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="text-xs font-mono text-gray-400 mt-1 w-8 text-center shrink-0">
                {aya.aya_num}
              </span>
              <div className="flex-1">
                <p className="text-lg leading-loose text-green-950 font-arabic">{aya.text}</p>
                {aya.kerat_text && (
                  <p className="text-xs text-blue-600 mt-1 leading-relaxed">{aya.kerat_text}</p>
                )}
                {aya.service_main_id && (
                  <div className="mt-2 flex items-center gap-2">
                    <Link
                      href={`/service-content/${aya.service_main_id}`}
                      className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 hover:bg-amber-100"
                    >
                      عرض التفسير →
                    </Link>
                  </div>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                {aya.has_tafsser && (
                  <span className="text-[9px] bg-amber-50 text-amber-600 border border-amber-200 rounded px-1 py-0.5">ت</span>
                )}
                {aya.has_qera && (
                  <span className="text-[9px] bg-blue-50 text-blue-600 border border-blue-200 rounded px-1 py-0.5">ق</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Navigation */}
      <div className="mt-8 flex items-center justify-between gap-3">
        {suraId > 1 && (
          <Link
            href={`/quran/${suraId - 1}`}
            className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm"
          >
            ← السورة السابقة
          </Link>
        )}
        <Link href="/quran" className="px-4 py-2 rounded-lg bg-green-800 text-white text-sm hover:bg-green-700">
          فهرس السور
        </Link>
        {suraId < 114 && (
          <Link
            href={`/quran/${suraId + 1}`}
            className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm"
          >
            السورة التالية →
          </Link>
        )}
      </div>
    </div>
  )
}
