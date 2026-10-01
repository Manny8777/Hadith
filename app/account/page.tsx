import { redirect } from 'next/navigation'
import pool from '@/lib/db'
import { currentUser } from '@/lib/auth'
import { MCP_LIMITS } from '@/lib/mcp/limits'
import TokenManager from './TokenManager'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'حسابي — الجامع', robots: { index: false } }

export default async function AccountPage() {
  const user = await currentUser()
  if (!user) redirect('/login?next=/account')

  const [tokens, usage] = await Promise.all([
    pool.query<{ id: number; name: string; created_at: string; last_used_at: string | null }>(
      `SELECT id, name, created_at, last_used_at FROM api_tokens WHERE user_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC`,
      [user.id]),
    pool.query<{ calls: number }>(`SELECT calls FROM mcp_usage WHERE subject = $1 AND day = current_date`, [`u:${user.id}`]),
  ])
  const used = usage.rows[0]?.calls ?? 0

  return (
    <div dir="rtl" className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-green-900">حسابي</h1>
          <p className="text-sm text-gray-500" dir="ltr">{user.email}</p>
        </div>
        <div className="flex items-center gap-2">
        {(process.env.ADMIN_EMAILS || 'manny@vcdesks.com').split(',').map(x => x.trim().toLowerCase()).includes(user.email.toLowerCase()) && (
          <a href="/admin" className="rounded-lg border border-green-300 px-4 py-2 text-sm text-green-800 hover:bg-green-50">الإحصاءات</a>
        )}
        <form action="/api/auth/logout" method="post">
          <button type="submit" className="rounded-lg border border-border px-4 py-2 text-sm text-gray-700 hover:border-red-300 hover:text-red-700">تسجيل الخروج</button>
        </form>
        </div>
      </div>

      <section className="ui-card rounded-2xl p-5">
        <h2 className="text-base font-bold text-green-900 mb-1">خادم MCP</h2>
        <p className="text-sm text-gray-600 mb-3 leading-relaxed">
          استعمالك اليوم: <b>{used.toLocaleString('ar-EG')}</b> من <b>{MCP_LIMITS.user.toLocaleString('ar-EG')}</b> طلبًا
          (دون حساب: {MCP_LIMITS.anon.toLocaleString('ar-EG')} طلبًا في اليوم).
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5 mb-1 list-disc pr-5">
          <li>في Claude أو ChatGPT: أضف الموصِّل <code dir="ltr" className="text-xs bg-paper px-1 rounded">https://hadith.dev/mcp/account</code> وسجّل الدخول حين يُطلب منك.</li>
          <li>في Claude Code أو غيره مما يقبل ترويسة: أنشئ رمزًا شخصيًا أدناه واستعمله مع <code dir="ltr" className="text-xs bg-paper px-1 rounded">https://hadith.dev/mcp</code>.</li>
        </ul>
        <a href="/developers#mcp" className="text-sm text-green-700 hover:underline">شرح الإعداد كاملًا ←</a>
      </section>

      <section className="ui-card rounded-2xl p-5">
        <h2 className="text-base font-bold text-green-900 mb-3">الرموز الشخصية</h2>
        <TokenManager tokens={tokens.rows} />
      </section>
    </div>
  )
}
