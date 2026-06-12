import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET() {
  const { rows } = await pool.query(
    `SELECT b.id, b.title, b.takhrij_author, b.takhrij_death, b.fame, b.strong,
            a.short_name AS author_short
     FROM books b
     LEFT JOIN authors a ON b.author_id = a.id
     ORDER BY b.tarteeb, b.id`
  )
  return NextResponse.json(rows)
}
