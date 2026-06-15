export const dynamic = 'force-dynamic'

import pool from '@/lib/db'
import Link from 'next/link'

interface Sura {
  id: number
  name: string
  has_tafsser: boolean
  has_qera: boolean
  aya_count: number
}

async function getSuras(): Promise<Sura[]> {
  const { rows } = await pool.query<Sura>(
    `SELECT s.id, s.name, s.has_tafsser, s.has_qera,
            COUNT(a.id)::int AS aya_count
     FROM quran_suras s
     LEFT JOIN quran_ayat a ON a.sora_id = s.id
     GROUP BY s.id, s.name, s.has_tafsser, s.has_qera
     ORDER BY s.id`
  )
  return rows
}

export default async function QuranPage() {
  const suras = await getSuras()

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-green-900 mb-2">القرآن الكريم</h1>
        <p className="text-gray-600 text-sm">
          فهرس الآيات القرآنية المُستشهد بها في الأحاديث النبوية الشريفة — {suras.length} سورة
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
        {suras.map(s => (
          <Link
            key={s.id}
            href={`/quran/${s.id}`}
            className="bg-white rounded-xl border border-amber-100 hover:shadow-md hover:border-green-300 transition-all p-3 flex flex-col"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400 font-mono">{s.id}</span>
              <div className="flex gap-1">
                {s.has_tafsser && (
                  <span className="text-[9px] bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-1.5 py-0.5">تفسير</span>
                )}
                {s.has_qera && (
                  <span className="text-[9px] bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-1.5 py-0.5">قراءة</span>
                )}
              </div>
            </div>
            <span className="font-bold text-green-900 text-base leading-snug">{s.name}</span>
            <span className="text-xs text-gray-400 mt-1">{s.aya_count} آية</span>
          </Link>
        ))}
      </div>

      <div className="mt-8 bg-green-50 border border-green-100 rounded-xl p-4 text-xs text-green-800">
        <p className="font-semibold mb-1">الآيات والأحاديث</p>
        <p className="leading-relaxed">
          يعرض هذا القسم الآيات القرآنية التي وردت في شروح الأحاديث النبوية أو ارتبطت بأسباب الورود.
          انقر على أي سورة لعرض آياتها وما يرتبط بها من أحاديث.
        </p>
      </div>
    </div>
  )
}
