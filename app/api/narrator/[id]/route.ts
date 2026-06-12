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

    return NextResponse.json({
      narrator: narratorRes.rows[0],
      books: booksRes.rows,
      students: studentsRes.rows,
      teachers: teachersRes.rows,
    })
  } catch (err) {
    console.error('Narrator API error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
