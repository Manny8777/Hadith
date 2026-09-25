import pool from '@/lib/db'
import Link from 'next/link'
import UiIcon, { type IconName } from '@/app/components/UiIcon'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'خريطة الفقه — جامع خادم الحرمين' }

interface ChapterHadith {
  hadith_id: number
  hadith_text: string
  book_name: string
  chapter_name: string
  chain_count: number
  judgment: string | null
}

interface CategoryStat {
  hadith_count: number
  chapter_count: number
}

const FIQH_CATEGORIES = [
  {
    key: 'tahara',
    name: 'الطهارة',
    icon: 'droplet' as IconName,
    color: 'bg-cyan-50 border-cyan-200 text-cyan-900',
    pattern: 'طهار|وضوء|غسل|تيمم|نجاس|حيض|نفاس|استنج',
  },
  {
    key: 'salah',
    name: 'الصلاة',
    icon: 'landmark' as IconName,
    color: 'bg-green-50 border-green-200 text-green-900',
    pattern: 'صلا|أذان|إقام|قبلة|إمام|جماعة|جمعة|عيد|تسبيح|سجد|ركع|قنوت',
  },
  {
    key: 'zakah',
    name: 'الزكاة',
    icon: 'herb' as IconName,
    color: 'bg-yellow-50 border-yellow-200 text-yellow-900',
    pattern: 'زكا|صدق|فطر|عشر|نصاب',
  },
  {
    key: 'sawm',
    name: 'الصوم',
    icon: 'moon' as IconName,
    color: 'bg-indigo-50 border-indigo-200 text-indigo-900',
    pattern: 'صوم|صيام|رمضان|إفطار|سحور|اعتكاف',
  },
  {
    key: 'hajj',
    name: 'الحج والعمرة',
    icon: 'kaaba' as IconName,
    color: 'bg-amber-50 border-amber-200 text-amber-900',
    pattern: 'حج|عمرة|طواف|سعي|إحرام|مكة|منى|عرفات|مزدلفة',
  },
  {
    key: 'janazah',
    name: 'الجنائز',
    icon: 'grave' as IconName,
    color: 'bg-gray-50 border-gray-300 text-gray-800',
    pattern: 'جناز|ميت|قبر|موت|دفن|كفن|وصي',
  },
  {
    key: 'nikah',
    name: 'النكاح والطلاق',
    icon: 'people' as IconName,
    color: 'bg-pink-50 border-pink-200 text-pink-900',
    pattern: 'نكاح|زواج|طلاق|خلع|رضاع|صداق|مهر|نفقة|عدة',
  },
  {
    key: 'buyuu',
    name: 'البيوع والمعاملات',
    icon: 'handshake' as IconName,
    color: 'bg-orange-50 border-orange-200 text-orange-900',
    pattern: 'بيع|شراء|ربا|قرض|إجار|رهن|وكال|شرك|مضارب|وقف|هب',
  },
  {
    key: 'hudud',
    name: 'الحدود والجنايات',
    icon: 'scale' as IconName,
    color: 'bg-red-50 border-red-200 text-red-900',
    pattern: 'حد|قصاص|دية|سرق|زنا|قتل|جلد|قطع',
  },
  {
    key: 'jihad',
    name: 'الجهاد والسير',
    icon: 'archery' as IconName,
    color: 'bg-red-50 border-red-200 text-red-900',
    pattern: 'جهاد|غزو|سير|خيل|غنيم|فيء|جزية|أسر|معرك',
  },
  {
    key: 'qada',
    name: 'القضاء والشهادات',
    icon: 'landmark' as IconName,
    color: 'bg-purple-50 border-purple-200 text-purple-900',
    pattern: 'قضاء|شهاد|حكم|قاض|بين|يمين|دعو',
  },
  {
    key: 'adab',
    name: 'الأخلاق والآداب',
    icon: 'flower' as IconName,
    color: 'bg-rose-50 border-rose-200 text-rose-900',
    pattern: 'أدب|أخلاق|حسن|صبر|شكر|توكل|ورع|زهد',
  },
]

export default async function FiqhMapPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>
}) {
  const sp = await searchParams
  const activeCat = sp.cat || ''

  const activeCategory = FIQH_CATEGORIES.find(c => c.key === activeCat)

  const [countsRes, hadithsRes] = await Promise.all([
    // Count hadiths per category
    Promise.all(FIQH_CATEGORIES.map(cat =>
      pool.query<CategoryStat>(
        `SELECT
           COUNT(DISTINCT ht.main_id)::int AS hadith_count,
           COUNT(DISTINCT ht.chapter_text)::int AS chapter_count
         FROM hadith_toc ht
         WHERE ht.is_leaf = true AND ht.is_paragraph = true AND ht.chapter_text ~* $1`,
        [cat.pattern]
      ).catch(() => ({ rows: [{ hadith_count: 0, chapter_count: 0 }] as CategoryStat[] }))
    )),

    // Load hadiths for active category
    activeCategory ? pool.query<ChapterHadith>(
      `SELECT DISTINCT ON (ht.chapter_text, ht.book_id)
              ht.main_id AS hadith_id,
              LEFT(regexp_replace(coalesce(ht.tarf,''), '<[^>]+>', ' ', 'g'), 200) AS hadith_text,
              b.title AS book_name,
              ht.chapter_text AS chapter_name,
              (SELECT COUNT(DISTINCT ic.id)::int FROM isnad_chains ic
               JOIN isnad_hadiths ih ON ih.isnad_id = ic.id WHERE ih.hadith_id = ht.main_id) AS chain_count,
              (SELECT hj.say_text FROM hadith_judgments hj WHERE hj.hadith_id = ht.main_id LIMIT 1) AS judgment
       FROM hadith_toc ht
       JOIN books b ON b.id = ht.book_id
       WHERE ht.is_leaf = true AND ht.is_paragraph = true AND ht.chapter_text ~* $1
       ORDER BY ht.chapter_text, ht.book_id, ht.main_id
       LIMIT 60`,
      [activeCategory.pattern]
    ).catch(() => ({ rows: [] as ChapterHadith[] })) : Promise.resolve({ rows: [] as ChapterHadith[] }),
  ])

  const categoriesWithCounts = FIQH_CATEGORIES.map((cat, i) => ({
    ...cat,
    hadith_count: countsRes[i].rows[0]?.hadith_count || 0,
    chapter_count: countsRes[i].rows[0]?.chapter_count || 0,
  }))

  const hadiths = hadithsRes.rows
  const totalHadiths = categoriesWithCounts.reduce((a, c) => a + c.hadith_count, 0)

  // Group hadiths by chapter for display
  const chapterGroups = new Map<string, ChapterHadith[]>()
  for (const h of hadiths) {
    const key = `${h.chapter_name}|||${h.book_name}`
    if (!chapterGroups.has(key)) chapterGroups.set(key, [])
    chapterGroups.get(key)!.push(h)
  }

  function judgmentColor(j: string | null) {
    if (!j) return 'text-gray-400'
    if (/صحيح/.test(j)) return 'text-green-700'
    if (/حسن/.test(j)) return 'text-blue-700'
    if (/ضعيف/.test(j)) return 'text-red-600'
    return 'text-gray-500'
  }

  return (
    <div dir="rtl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-green-900 mb-1">خريطة أحاديث الفقه الإسلامي</h1>
        <p className="text-sm text-gray-500">
          تصنيف الأحاديث بحسب أبواب الفقه الإسلامي — مبني على أسماء الأبواب في كتب الحديث
        </p>
        <div className="text-xs text-gray-400 mt-1">
          {totalHadiths.toLocaleString('ar-EG')} حديث في {FIQH_CATEGORIES.length} موضوعاً فقهياً
        </div>
      </div>

      {/* Category grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-6">
        {categoriesWithCounts.map(cat => (
          <a key={cat.key}
            href={`/hadiths/fiqh-map?cat=${cat.key}`}
            className={`rounded-xl border p-3 hover:shadow-md transition-all text-right
              ${activeCat === cat.key
                ? `${cat.color} shadow-md ring-2 ring-offset-1 ring-current`
                : 'bg-white border-gray-100 hover:border-gray-200'}`}>
            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg border border-current/15 bg-white/45">
              <UiIcon name={cat.icon} size={20} />
            </div>
            <div className={`font-bold text-sm mb-1 ${activeCat === cat.key ? '' : 'text-green-900'}`}>
              {cat.name}
            </div>
            <div className="text-xs text-gray-400">
              {cat.hadith_count.toLocaleString('ar-EG')} حديث
            </div>
            <div className="text-xs text-gray-300">
              {cat.chapter_count} باب
            </div>
          </a>
        ))}
      </div>

      {/* Active category content */}
      {activeCategory && (
        <div>
          <div className={`rounded-xl border px-4 py-3 mb-4 ${activeCategory.color}`}>
            <div className="flex items-center gap-2">
              <UiIcon name={activeCategory.icon} size={26} />
              <div>
                <h2 className="font-bold text-base">{activeCategory.name}</h2>
                <p className="text-xs opacity-70">
                  {(categoriesWithCounts.find(c => c.key === activeCat)?.hadith_count || 0).toLocaleString('ar-EG')} حديث في {(categoriesWithCounts.find(c => c.key === activeCat)?.chapter_count || 0)} باب
                </p>
              </div>
            </div>
          </div>

          {/* Hadith chapters */}
          <div className="space-y-3">
            {Array.from(chapterGroups.entries()).map(([key, groupHadiths]) => {
              const [chapterName, bookName] = key.split('|||')
              return (
                <div key={key} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <div className="bg-green-50 px-4 py-2 border-b border-gray-100 flex items-center gap-3">
                    <span className="font-bold text-green-900 text-sm">{chapterName}</span>
                    <span className="text-xs text-gray-400">— {bookName}</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {groupHadiths.map(h => (
                      <div key={h.hadith_id} className="px-4 py-2.5 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 leading-relaxed">
                            {h.hadith_text}
                            {h.hadith_text?.length === 200 && '...'}
                          </p>
                          {h.judgment && (
                            <span className={`text-xs ${judgmentColor(h.judgment)}`}>
                              {h.judgment.slice(0, 50)}
                            </span>
                          )}
                        </div>
                        <Link href={`/hadith/${h.hadith_id}`}
                          className="text-xs text-green-700 hover:underline shrink-0">←</Link>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {hadiths.length === 60 && (
            <div className="mt-3 text-center">
              <Link href={`/hadiths/chapters?q=${encodeURIComponent(activeCategory.name)}`}
                className="text-sm text-green-700 hover:underline">
                عرض جميع أبواب {activeCategory.name} في فهرس الأبواب ←
              </Link>
            </div>
          )}
        </div>
      )}

      {!activeCategory && (
        <div className="bg-green-50 rounded-xl border border-green-100 p-6 text-center">
          <p className="text-sm text-green-800 mb-2">اختر موضوعاً فقهياً من الأعلى لعرض الأحاديث</p>
          <p className="text-xs text-green-600">
            يمكنك أيضاً استخدام <Link href="/hadiths/chapters" className="underline">فهرس الأبواب</Link> للبحث في أسماء الأبواب مباشرة
          </p>
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/hadiths/chapters" className="text-green-700 hover:underline">← فهرس الأبواب</Link>
        <Link href="/hadiths/dua" className="text-green-700 hover:underline">← الأدعية والأذكار</Link>
        <Link href="/topics" className="text-green-700 hover:underline">← الفهارس الموضوعية</Link>
      </div>
    </div>
  )
}
