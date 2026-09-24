import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const startedAt = Date.now()
  try {
    await pool.query('SELECT 1')
    return NextResponse.json(
      {
        status: 'ok',
        database: 'reachable',
        response_time_ms: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    )
  } catch {
    return NextResponse.json(
      {
        status: 'degraded',
        database: 'unreachable',
        timestamp: new Date().toISOString(),
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    )
  }
}
