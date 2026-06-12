import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const narratorId = parseInt(id, 10)
  if (isNaN(narratorId)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
  }

  try {
    // Base narrator info
    const narratorRes = await pool.query(
      `SELECT id, name, abb_name, kunia, death_year, death_year_num,
              birth_year, death_city, birth_city, tabaqa, tabaqa_num,
              hadiths_count, martaba_ibn_hajar, martaba_zahabi, is_companion
       FROM narrators WHERE id = $1`,
      [narratorId]
    )

    if (narratorRes.rows.length === 0) {
      return NextResponse.json({ error: 'Narrator not found' }, { status: 404 })
    }

    // Books this narrator appears in
    const booksRes = await pool.query(
      `SELECT b.id, b.title
       FROM narrator_books nb
       JOIN books b ON b.id = nb.book_id
       WHERE nb.narrator_id = $1
       ORDER BY b.title`,
      [narratorId]
    )

    // Teachers (شيوخه): is_sheikh=true means second_id IS the sheikh.
    // So first_id=narrator is the student, second_id are his teachers.
    const teachersRes = await pool.query(
      `SELECT n.id, n.name
       FROM narrator_relations nr
       JOIN narrators n ON n.id = nr.second_id
       WHERE nr.first_id = $1 AND nr.is_sheikh = true
       ORDER BY n.name
       LIMIT 100`,
      [narratorId]
    )

    // Students (تلاميذه): is_sheikh=true means second_id IS the sheikh.
    // So second_id=narrator is the teacher, first_id are his students.
    const studentsRes = await pool.query(
      `SELECT n.id, n.name
       FROM narrator_relations nr
       JOIN narrators n ON n.id = nr.first_id
       WHERE nr.second_id = $1 AND nr.is_sheikh = true
       ORDER BY n.name
       LIMIT 100`,
      [narratorId]
    )

    // جرح وتعديل — all scholar criticisms/gradings grouped by scientist
    const criticismRes = await pool.query(
      `SELECT scientist_name, say_text, say_sort, scientist_noun_id
       FROM narrator_criticism
       WHERE narrator_id = $1
       ORDER BY scientist_noun_id, say_sort, id`,
      [narratorId]
    )

    // Group criticism by scientist_name
    const criticismByScientist: Record<string, { scientistNounId: number | null; saySort: number; texts: string[] }> = {}
    for (const row of criticismRes.rows) {
      const name = row.scientist_name || 'غير معروف'
      if (!criticismByScientist[name]) {
        criticismByScientist[name] = { scientistNounId: row.scientist_noun_id, saySort: row.say_sort, texts: [] }
      }
      if (row.say_text) criticismByScientist[name].texts.push(row.say_text)
    }

    const criticism = Object.entries(criticismByScientist).map(([name, data]) => ({
      scientist_name: name,
      scientist_noun_id: data.scientistNounId,
      texts: data.texts,
    }))

    // Biography from classical books, deduplicated by main_id
    const biographyRes = await pool.query(
      `SELECT DISTINCT ON (main_id) book_name, book_id, title, content
       FROM narrator_biography WHERE narrator_id = $1
       ORDER BY main_id, book_name`,
      [narratorId]
    )

    // Group biography by book
    const bioMap: Record<string, { book_id: number; entries: { title: string; content: string }[] }> = {}
    for (const row of biographyRes.rows) {
      const bname = row.book_name || 'غير معروف'
      if (!bioMap[bname]) bioMap[bname] = { book_id: row.book_id, entries: [] }
      const content = (row.content || '').trim()
      if (!content || content.length < 10) continue
      const already = bioMap[bname].entries.some(e => e.content === content)
      if (!already) bioMap[bname].entries.push({ title: row.title || '', content })
    }
    const biography = Object.entries(bioMap)
      .filter(([, v]) => v.entries.length > 0)
      .map(([book_name, v]) => ({ book_name, book_id: v.book_id, entries: v.entries }))

    return NextResponse.json({
      narrator: narratorRes.rows[0],
      books: booksRes.rows,
      students: studentsRes.rows,
      teachers: teachersRes.rows,
      criticism,
      biography,
    })
  } catch (err) {
    console.error('Narrator API error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
