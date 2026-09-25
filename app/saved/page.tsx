'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import HadithNumber from '@/app/components/HadithNumber'

const STORAGE_KEY = 'hadith_collection'
const NOTES_KEY = 'hadith_notes'

function getNotes(): Record<number, string> {
  try {
    const raw = localStorage.getItem(NOTES_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

interface SavedHadith {
  main_id: number
  book_title: string
  takhrij_author: string | null
  takhrij_death: number | null
  tarf: string | null
  section_text: string | null
  chapter_text: string | null
  part_num: number
  page_num: number
  tarqeem_harf: string | null
  tarqeem_matboa1: string | null
  grade_hint: string | null
  group_id: number | null
}

function stripTags(html: string) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function buildArabicBibliography(hadiths: SavedHadith[], notesMap: Record<number, string> = {}, tagsMap: Record<number, string> = {}): string {
  const lines: string[] = []
  const divider = '═'.repeat(60)
  lines.push('قائمة المصادر — المجموعة البحثية')
  lines.push(divider)
  lines.push('')

  hadiths.forEach((h, i) => {
    let ref = h.book_title
    if (h.takhrij_author) ref += `، ${h.takhrij_author}`
    if (h.takhrij_death) ref += ` (ت ${h.takhrij_death} هـ)`
    const num = h.tarqeem_harf?.trim() || h.tarqeem_matboa1?.trim()
    const vol = h.part_num > 0 ? `ج${h.part_num}` : ''
    const pg = h.page_num > 0 ? `ص${h.page_num}` : ''
    const loc = [vol, pg].filter(Boolean).join(' ')
    const gradeStr = h.grade_hint ? ` [${h.grade_hint}]` : ''

    lines.push(`${i + 1}. ${ref}${gradeStr}`)
    if (num || loc) {
      const detail = [num ? `رقم ${num}` : '', loc].filter(Boolean).join('، ')
      lines.push(`   ${detail}`)
    }
    if (h.tarf) {
      lines.push(`   "${stripTags(h.tarf).slice(0, 120)}..."`)
    }
    if (tagsMap[h.main_id]) {
      lines.push(`   [التصنيف البحثي: ${tagsMap[h.main_id]}]`)
    }
    if (notesMap[h.main_id]) {
      lines.push(`   [ملاحظة الباحث: ${notesMap[h.main_id]}]`)
    }
    lines.push('')
  })

  lines.push(divider)
  lines.push('مُستخرج من موسوعة خادم الحرمين الشريفين للحديث النبوي')
  return lines.join('\n')
}

function buildBibTeXBibliography(hadiths: SavedHadith[]): string {
  return hadiths.map(h => {
    const authorSlug = (h.takhrij_author || h.book_title)
      .replace(/\s+/g, '_').replace(/[^\w؀-ۿ_]/g, '').slice(0, 20)
    const key = `hadith_${authorSlug}_${h.main_id}`
    const num = h.tarqeem_harf?.trim() || h.tarqeem_matboa1?.trim()
    const fields = [
      `  author    = {${h.takhrij_author || h.book_title}}`,
      `  title     = {${h.book_title}}`,
      h.part_num > 0 ? `  volume    = {${h.part_num}}` : null,
      h.page_num > 0 ? `  pages     = {${h.page_num}}` : null,
      num ? `  number    = {${num}}` : null,
      h.takhrij_death
        ? `  year      = {${h.takhrij_death} هـ / ${Math.round(h.takhrij_death - h.takhrij_death / 33)} م}`
        : null,
      `  language  = {arabic}`,
      `  note      = {حديث رقم ${h.main_id}}`,
    ].filter(Boolean).join(',\n')
    return `@book{${key},\n${fields}\n}`
  }).join('\n\n')
}

const TAGS_KEY = 'hadith_tags'

function getTags(): Record<number, string> {
  try {
    const raw = localStorage.getItem(TAGS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function saveTags(tags: Record<number, string>) {
  localStorage.setItem(TAGS_KEY, JSON.stringify(tags))
}

interface RecentEntry { id: number; title: string; ts: number }

export default function SavedPage() {
  const [ids, setIds] = useState<number[]>([])
  const [hadiths, setHadiths] = useState<SavedHadith[]>([])
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [tags, setTags] = useState<Record<number, string>>({})
  const [recentHistory, setRecentHistory] = useState<RecentEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [exportMode, setExportMode] = useState<'arabic' | 'bibtex' | null>(null)
  const [copied, setCopied] = useState(false)
  const [sortMode, setSortMode] = useState<'saved' | 'grade' | 'book' | 'tag'>('saved')
  const [editingTagFor, setEditingTagFor] = useState<number | null>(null)
  const [tagDraft, setTagDraft] = useState('')

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const parsed: number[] = raw ? JSON.parse(raw) : []
      setIds(parsed)
    } catch {
      setIds([])
    }
    setNotes(getNotes())
    setTags(getTags())
    try {
      const raw = localStorage.getItem('hadith_recent')
      setRecentHistory(raw ? JSON.parse(raw) : [])
    } catch {
      setRecentHistory([])
    }
  }, [])

  function setHadithTag(hadithId: number, tag: string) {
    const next = { ...tags }
    if (tag.trim()) {
      next[hadithId] = tag.trim()
    } else {
      delete next[hadithId]
    }
    setTags(next)
    saveTags(next)
    setEditingTagFor(null)
  }

  useEffect(() => {
    if (ids.length === 0) { setHadiths([]); return }
    setLoading(true)
    fetch(`/api/hadiths/bulk?ids=${ids.join(',')}`)
      .then(r => r.json())
      .then(data => setHadiths(data.hadiths || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [ids])

  function removeHadith(id: number) {
    const next = ids.filter(i => i !== id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setIds(next)
  }

  function clearAll() {
    if (window.confirm('هل تريد حذف جميع الأحاديث المحفوظة؟')) {
      localStorage.setItem(STORAGE_KEY, '[]')
      setIds([])
    }
  }

  function downloadText(text: string, filename: string) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleExport(mode: 'arabic' | 'bibtex') {
    const text = mode === 'arabic'
      ? buildArabicBibliography(hadiths, notes, tags)
      : buildBibTeXBibliography(hadiths)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setExportMode(mode)
      setTimeout(() => { setCopied(false); setExportMode(null) }, 2500)
    } catch {
      window.prompt(mode === 'arabic' ? 'نسخ القائمة:' : 'BibTeX:', text)
    }
  }

  function handleDownload(mode: 'arabic' | 'bibtex') {
    const text = mode === 'arabic'
      ? buildArabicBibliography(hadiths, notes, tags)
      : buildBibTeXBibliography(hadiths)
    const ext = mode === 'bibtex' ? '.bib' : '.txt'
    downloadText(text, `مجموعتي_البحثية${ext}`)
  }

  // Compute grade stats from fetched hadiths
  const gradeStats = (() => {
    if (hadiths.length === 0) return null
    const counts: Record<string, number> = { صحيح: 0, حسن: 0, ضعيف: 0, '': 0 }
    hadiths.forEach(h => {
      const g = h.grade_hint?.trim() || ''
      if (g === 'صحيح' || g === 'حسن' || g === 'ضعيف') counts[g]++
      else counts['']++
    })
    return counts
  })()

  const bookGroups = (() => {
    if (hadiths.length === 0) return []
    const map: Record<string, number> = {}
    hadiths.forEach(h => { map[h.book_title] = (map[h.book_title] || 0) + 1 })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  })()

  const GRADE_ORDER: Record<string, number> = { صحيح: 0, حسن: 1, ضعيف: 2 }
  const sortedHadiths = (() => {
    if (sortMode === 'saved') return hadiths
    const copy = [...hadiths]
    if (sortMode === 'grade') {
      copy.sort((a, b) => {
        const ga = GRADE_ORDER[a.grade_hint?.trim() || ''] ?? 3
        const gb = GRADE_ORDER[b.grade_hint?.trim() || ''] ?? 3
        return ga - gb
      })
    } else if (sortMode === 'book') {
      copy.sort((a, b) => a.book_title.localeCompare(b.book_title, 'ar'))
    } else if (sortMode === 'tag') {
      copy.sort((a, b) => {
        const ta = tags[a.main_id] || 'ωωω'
        const tb = tags[b.main_id] || 'ωωω'
        return ta.localeCompare(tb, 'ar')
      })
    }
    return copy
  })()

  // For tag mode: group hadiths by tag
  const tagGroups: Array<{ tag: string; hadiths: SavedHadith[] }> = (() => {
    if (sortMode !== 'tag') return []
    const map: Record<string, SavedHadith[]> = {}
    sortedHadiths.forEach(h => {
      const t = tags[h.main_id] || 'غير مصنف'
      if (!map[t]) map[t] = []
      map[t].push(h)
    })
    return Object.entries(map).map(([tag, hs]) => ({ tag, hadiths: hs }))
  })()

  // Detect parallel transmissions — hadiths sharing the same group_id
  const parallelGroups: Record<number, number[]> = {}
  hadiths.forEach(h => {
    if (h.group_id) {
      if (!parallelGroups[h.group_id]) parallelGroups[h.group_id] = []
      parallelGroups[h.group_id].push(h.main_id)
    }
  })
  const parallelSets = Object.values(parallelGroups).filter(ids => ids.length > 1)

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-green-900">المجموعة البحثية</h1>
          <p className="text-sm text-gray-500 mt-1">الأحاديث المحفوظة للبحث الأكاديمي</p>
        </div>
        {hadiths.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => handleExport('arabic')}
              className={`text-xs px-3 py-2 rounded-lg border transition-colors ${
                exportMode === 'arabic' && copied
                  ? 'bg-green-700 text-white border-green-700'
                  : 'bg-green-50 text-green-800 border-green-200 hover:bg-green-100'
              }`}
            >
              {exportMode === 'arabic' && copied ? '✓ تم النسخ' : 'نسخ القائمة العربية'}
            </button>
            <button
              onClick={() => handleExport('bibtex')}
              className={`text-xs px-3 py-2 rounded-lg border font-mono transition-colors ${
                exportMode === 'bibtex' && copied
                  ? 'bg-purple-700 text-white border-purple-700'
                  : 'bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100'
              }`}
            >
              {exportMode === 'bibtex' && copied ? '✓ Copied' : 'نسخ BibTeX'}
            </button>
            <button
              onClick={() => handleDownload('arabic')}
              className="text-xs px-3 py-2 rounded-lg border border-green-200 bg-green-50 text-green-800 hover:bg-green-100 transition-colors"
              title="تنزيل القائمة كملف نصي"
            >
              تنزيل .txt
            </button>
            <button
              onClick={() => handleDownload('bibtex')}
              className="text-xs px-3 py-2 rounded-lg border border-purple-200 bg-purple-50 text-purple-800 hover:bg-purple-100 font-mono transition-colors"
              title="تنزيل القائمة كملف BibTeX"
            >
              تنزيل .bib
            </button>
            <button
              onClick={clearAll}
              className="text-xs px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
            >
              حذف الكل
            </button>
          </div>
        )}
      </div>

      {loading && <p className="text-gray-500 py-8 text-center">جاري التحميل...</p>}

      {/* Grade stats card */}
      {!loading && gradeStats && hadiths.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-5 flex flex-wrap items-center gap-4">
          <div className="text-sm font-semibold text-gray-700 ml-2">إحصاءات المجموعة:</div>
          {gradeStats['صحيح'] > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-green-500 inline-block"></span>
              <span className="text-sm text-green-700 font-medium">صحيح ({gradeStats['صحيح']})</span>
            </div>
          )}
          {gradeStats['حسن'] > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-amber-500 inline-block"></span>
              <span className="text-sm text-amber-700 font-medium">حسن ({gradeStats['حسن']})</span>
            </div>
          )}
          {gradeStats['ضعيف'] > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-400 inline-block"></span>
              <span className="text-sm text-red-700 font-medium">ضعيف ({gradeStats['ضعيف']})</span>
            </div>
          )}
          {gradeStats[''] > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-gray-300 inline-block"></span>
              <span className="text-sm text-gray-500">غير مصنف ({gradeStats['']})</span>
            </div>
          )}
          {bookGroups.length > 1 && (
            <div className="border-r border-gray-200 pr-4 mr-2 flex flex-wrap gap-1.5">
              {bookGroups.slice(0, 5).map(([title, cnt]) => (
                <span key={title} className="text-xs bg-blue-50 border border-blue-200 text-blue-700 px-2 py-0.5 rounded-full">
                  {title.split('،')[0].split('(')[0].trim().slice(0, 18)} ({cnt})
                </span>
              ))}
              {bookGroups.length > 5 && (
                <span className="text-xs text-gray-400">+{bookGroups.length - 5} أخرى</span>
              )}
            </div>
          )}
          {parallelSets.length > 0 && (
            <div className="text-xs text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-3 py-1.5">
              {parallelSets.length === 1
                ? `روايتان لنفس الحديث محفوظتان في مجموعتك`
                : `${parallelSets.length} مجموعات من الروايات المتوازية في مجموعتك`
              }
            </div>
          )}
        </div>
      )}

      {!loading && ids.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-10 text-center">
          <p className="text-gray-600 text-lg mb-2">لا توجد أحاديث محفوظة بعد</p>
          <p className="text-gray-400 text-sm mb-4">
            استخدم زر "☆ حفظ" في صفحة أي حديث لإضافته إلى مجموعتك البحثية
          </p>
          <Link href="/search" className="text-green-700 hover:underline font-medium text-sm">
            ابدأ البحث في الأحاديث ←
          </Link>
        </div>
      )}

      {/* Recently viewed hadiths */}
      {recentHistory.length > 0 && (
        <div className="mt-8">
          <h2 className="font-bold text-gray-700 text-base mb-3">
            آخر ما اطلعت عليه
            <span className="text-xs text-gray-400 font-normal mr-2">({recentHistory.length})</span>
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {recentHistory.slice(0, 10).map(r => (
              <Link
                key={r.id}
                href={`/hadith/${r.id}`}
                className="flex items-center justify-between bg-white border border-gray-100 rounded-lg px-4 py-2 hover:border-green-200 hover:shadow-sm transition-all group"
              >
                <span className="text-sm text-gray-700 group-hover:text-green-800 truncate flex-1">
                  {r.title}
                </span>
                <span className="text-xs text-gray-400 mr-2 shrink-0">
                  {new Date(r.ts).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })}
                </span>
              </Link>
            ))}
          </div>
          {recentHistory.length > 10 && (
            <p className="text-xs text-gray-400 mt-2 text-center">
              + {recentHistory.length - 10} حديث آخر
            </p>
          )}
        </div>
      )}

      {!loading && hadiths.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <p className="text-sm text-gray-500">
              {hadiths.length} حديث محفوظ
            </p>
            <div className="flex items-center gap-1 text-xs flex-wrap">
              <span className="text-gray-400 ml-1">ترتيب:</span>
              {(['saved', 'grade', 'book', 'tag'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setSortMode(mode)}
                  className={`px-2.5 py-1 rounded-lg border transition-colors ${
                    sortMode === mode
                      ? 'bg-green-700 text-white border-green-700'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
                  }`}
                >
                  {mode === 'saved' ? 'ترتيب الحفظ' : mode === 'grade' ? 'الدرجة' : mode === 'book' ? 'الكتاب' : 'التصنيف'}
                </button>
              ))}
            </div>
          </div>
          {/* Tag-grouped view */}
          {sortMode === 'tag' && tagGroups.length > 0 ? (
            <div className="space-y-8">
              {tagGroups.map(({ tag, hadiths: groupHadiths }) => (
                <div key={tag}>
                  <div className="flex items-center gap-3 mb-3">
                    <span className={`text-sm font-bold px-3 py-1 rounded-full border ${
                      tag === 'غير مصنف'
                        ? 'bg-gray-100 text-gray-600 border-gray-200'
                        : 'bg-blue-100 text-blue-800 border-blue-200'
                    }`}>
                      {tag}
                    </span>
                    <span className="text-xs text-gray-400">({groupHadiths.length} حديث)</span>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    {groupHadiths.map((h, i) => (
                      <HadithCard key={h.main_id} h={h} i={i} tags={tags} notes={notes} parallelSets={parallelSets}
                        removeHadith={removeHadith} editingTagFor={editingTagFor} tagDraft={tagDraft}
                        setEditingTagFor={setEditingTagFor} setTagDraft={setTagDraft} setHadithTag={setHadithTag} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
          <div className="grid grid-cols-1 gap-4">
            {sortedHadiths.map((h, i) => (
              <HadithCard key={h.main_id} h={h} i={i} tags={tags} notes={notes} parallelSets={parallelSets}
                removeHadith={removeHadith} editingTagFor={editingTagFor} tagDraft={tagDraft}
                setEditingTagFor={setEditingTagFor} setTagDraft={setTagDraft} setHadithTag={setHadithTag} />
            ))}
          </div>
          )}
        </>
      )}
    </div>
  )
}

function HadithCard({
  h, i, tags, notes, parallelSets, removeHadith, editingTagFor, tagDraft, setEditingTagFor, setTagDraft, setHadithTag,
}: {
  h: SavedHadith; i: number
  tags: Record<number, string>; notes: Record<number, string>
  parallelSets: number[][]
  removeHadith: (id: number) => void
  editingTagFor: number | null; tagDraft: string
  setEditingTagFor: (id: number | null) => void
  setTagDraft: (v: string) => void
  setHadithTag: (id: number, tag: string) => void
}) {
  const currentTag = tags[h.main_id]
  return (
    <div
      key={h.main_id}
      className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-sm transition-shadow"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-green-800 bg-green-50 px-2 py-1 rounded-full border border-green-100">
            {i + 1}
          </span>
          <Link href={`/hadith/${h.main_id}`} className="text-sm font-semibold text-green-800 hover:underline">
            {h.book_title}
          </Link>
          {h.grade_hint && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              h.grade_hint === 'صحيح' ? 'bg-green-100 text-green-700' :
              h.grade_hint === 'حسن' ? 'bg-amber-100 text-amber-700' :
              h.grade_hint === 'ضعيف' ? 'bg-red-100 text-red-600' :
              'bg-gray-100 text-gray-500'
            }`}>
              {h.grade_hint}
            </span>
          )}
          {h.group_id && parallelSets.some(s => s.includes(h.main_id)) && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
              رواية متوازية
            </span>
          )}
          {currentTag && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              {currentTag}
            </span>
          )}
        </div>
        <button
          onClick={() => removeHadith(h.main_id)}
          className="text-xs text-gray-400 hover:text-red-500 transition-colors shrink-0 px-2 py-1 rounded hover:bg-red-50"
          title="إزالة من المجموعة"
        >
          ✕
        </button>
      </div>

      {/* Location */}
      <div className="flex items-center gap-3 text-xs text-gray-500 mb-3 flex-wrap">
        {h.takhrij_author && (
          <span>{h.takhrij_author}{h.takhrij_death ? ` (ت ${h.takhrij_death} هـ)` : ''}</span>
        )}
        <HadithNumber harf={h.tarqeem_harf} matboa={h.tarqeem_matboa1} />
        {(h.part_num > 0 || h.page_num > 0) && (
          <span>ج{h.part_num} ص{h.page_num}</span>
        )}
        {(h.section_text?.trim() || h.chapter_text?.trim()) && (
          <span className="text-gray-400">
            {[h.section_text?.trim(), h.chapter_text?.trim()].filter(Boolean).join(' — ')}
          </span>
        )}
      </div>

      {/* Tarf */}
      {h.tarf && (
        <p className="text-gray-700 text-sm leading-loose line-clamp-3">
          {(h.tarf || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}
        </p>
      )}

      {/* Researcher note preview */}
      {notes[h.main_id] && (
        <div className="mt-3 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
          <p className="text-xs text-blue-600 font-medium mb-1">ملاحظتك:</p>
          <p className="text-xs text-blue-800 leading-relaxed">{notes[h.main_id]}</p>
        </div>
      )}

      {/* Tag editor */}
      {editingTagFor === h.main_id ? (
        <div className="mt-3 flex items-center gap-2">
          <input
            type="text"
            value={tagDraft}
            onChange={e => setTagDraft(e.target.value)}
            placeholder="التصنيف البحثي (مثل: الدليل الأول، دليل مساعد...)"
            className="flex-1 min-w-0 text-xs border border-blue-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400"
            dir="rtl"
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter') setHadithTag(h.main_id, tagDraft)
              if (e.key === 'Escape') setEditingTagFor(null)
            }}
          />
          <button
            onClick={() => setHadithTag(h.main_id, tagDraft)}
            className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
          >
            حفظ
          </button>
          <button
            onClick={() => setEditingTagFor(null)}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5"
          >
            إلغاء
          </button>
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between">
          <Link href={`/hadith/${h.main_id}`} className="text-xs text-green-600 hover:text-green-800 hover:underline">
            عرض الحديث كاملاً ←
          </Link>
          <button
            onClick={() => { setEditingTagFor(h.main_id); setTagDraft(currentTag || '') }}
            className="text-xs text-gray-400 hover:text-blue-600 transition-colors"
            title="إضافة تصنيف بحثي لهذا الحديث"
          >
            {currentTag ? '✎ تعديل التصنيف' : '+ تصنيف'}
          </button>
        </div>
      )}
    </div>
  )
}
