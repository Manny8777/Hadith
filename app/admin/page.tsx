import { notFound, redirect } from 'next/navigation'
import pool from '@/lib/db'
import { currentUser } from '@/lib/auth'
import { isAdmin, passwordSet, unlocked } from '@/lib/adminGate'
import UnlockForm from './UnlockForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'الإحصاءات — الجامع', robots: { index: false, follow: false } }

// Private statistics: sign-ups, MCP use and site traffic. Behind sign-in, an admin email
// (ADMIN_EMAILS) and the ADMIN_PASSWORD (lib/adminGate.ts). Anyone else gets a 404, so the page's
// existence is not shown.

type Row = Record<string, unknown>
const q = async <T extends Row>(sql: string, params: unknown[] = []) =>
  (await pool.query<T>(sql, params).catch(e => { console.error('[admin]', e.message); return { rows: [] as T[] } })).rows

const n = (v: unknown) => Number(v ?? 0).toLocaleString('en')
const day = (v: unknown) => String(v ?? '').slice(5, 10)
const when = (v: unknown) => v ? new Date(String(v)).toISOString().slice(0, 16).replace('T', ' ') : '—'

// The last 30 days, oldest first, with zeros where nothing happened
function days30<T extends { d: string }>(rows: T[]): (T | { d: string })[] {
  const by = new Map(rows.map(r => [String(r.d).slice(0, 10), r]))
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10)
    return by.get(d) ?? { d }
  })
}

function Bars({ rows, series }: { rows: Row[]; series: { key: string; label: string; color: string }[] }) {
  const max = Math.max(1, ...rows.map(r => series.reduce((a, s) => a + Number(r[s.key] ?? 0), 0)))
  return (
    <div>
      <div className="flex items-end gap-[3px] h-36 border-b border-border" dir="ltr">
        {rows.map((r, i) => (
          <div key={i} className="flex-1 h-full flex flex-col-reverse min-w-0" title={`${day(r.d)} — ${series.map(s => `${s.label}: ${n(r[s.key])}`).join(' · ')}`}>
            {series.map(s => (
              <div key={s.key} style={{ height: `${(Number(r[s.key] ?? 0) / max) * 100}%`, background: s.color }} />
            ))}
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-gray-400 mt-1" dir="ltr">
        <span>{day(rows[0]?.d)}</span><span>{day(rows[rows.length - 1]?.d)}</span>
      </div>
      <div className="flex gap-4 text-xs text-gray-500 mt-1">
        {series.map(s => <span key={s.key} className="inline-flex items-center gap-1.5"><i className="inline-block w-3 h-3 rounded-sm" style={{ background: s.color }} />{s.label}</span>)}
      </div>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="ui-card rounded-xl p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl font-bold text-green-900 mt-1" dir="ltr">{value}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}

function Table({ head, rows }: { head: string[]; rows: (string | number | null)[][] }) {
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-xs text-gray-500 border-b border-border">{head.map((h, i) => <th key={i} className="text-right font-medium py-1.5 px-2">{h}</th>)}</tr></thead>
      <tbody>
        {rows.length ? rows.map((r, i) => (
          <tr key={i} className="border-b border-border/60">
            {r.map((c, j) => <td key={j} className={`py-1.5 px-2 ${j === 0 ? 'max-w-[22rem] truncate' : 'text-gray-600'}`} dir={j === 0 ? 'auto' : 'ltr'}>{c ?? '—'}</td>)}
          </tr>
        )) : <tr><td colSpan={head.length} className="py-3 px-2 text-gray-400">لا بيانات بعد</td></tr>}
      </tbody>
    </table>
  )
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-3">
    <h2 className="text-lg font-bold text-green-900">{title}</h2>
    {children}
  </section>
)

export default async function AdminPage() {
  const user = await currentUser()
  if (!user) redirect('/login?next=/admin')
  if (!isAdmin(user)) notFound()
  if (!(await unlocked(user))) {
    return (
      <div dir="rtl" className="max-w-sm mx-auto ui-card rounded-2xl p-6">
        <h1 className="text-xl font-bold text-green-900 mb-1">الإحصاءات</h1>
        {passwordSet()
          ? <><p className="text-sm text-gray-500 mb-4">أدخل كلمة مرور لوحة الإحصاءات؛ تبقى مفتوحةً ١٢ ساعة.</p><UnlockForm /></>
          : <p className="text-sm text-gray-600 leading-relaxed">اللوحة مقفلة: لم تُضبط كلمة المرور. أضف المتغير <code dir="ltr" className="bg-paper px-1 rounded">ADMIN_PASSWORD</code> في إعدادات الخادم على Railway.</p>}
      </div>
    )
  }

  const [
    userTotals, signupDays, recentUsers,
    mcpTotals, mcpDays, tools, clients, topUsers,
    viewTotals, viewDays, topPages, sections, referrers, devices,
  ] = await Promise.all([
    q(`SELECT COUNT(*) total,
              COUNT(*) FILTER (WHERE created_at > now() - interval '7 days') AS week_n,
              COUNT(*) FILTER (WHERE created_at > now() - interval '30 days') AS month_n,
              COUNT(*) FILTER (WHERE last_login_at > now() - interval '30 days') active,
              (SELECT COUNT(DISTINCT user_id) FROM api_tokens WHERE revoked_at IS NULL) with_tokens,
              (SELECT COUNT(DISTINCT user_id) FROM oauth_tokens WHERE kind = 'access') with_oauth
       FROM users`),
    q<{ d: string }>(`SELECT to_char(created_at, 'YYYY-MM-DD') d, COUNT(*) n FROM users
       WHERE created_at > now() - interval '30 days' GROUP BY 1`),
    q(`SELECT u.email, u.created_at, u.last_login_at,
              (SELECT COALESCE(SUM(calls), 0) FROM mcp_usage m WHERE m.subject = 'u:' || u.id) calls,
              (SELECT COUNT(*) FROM api_tokens t WHERE t.user_id = u.id AND t.revoked_at IS NULL) tokens
       FROM users u ORDER BY u.created_at DESC LIMIT 20`),

    q(`SELECT COALESCE(SUM(calls) FILTER (WHERE day = current_date), 0) today,
              COALESCE(SUM(calls) FILTER (WHERE day > current_date - 7), 0) AS week_n,
              COALESCE(SUM(calls) FILTER (WHERE day > current_date - 30), 0) AS month_n,
              COUNT(DISTINCT subject) FILTER (WHERE day > current_date - 30 AND subject LIKE 'ip:%') anon_users,
              COUNT(DISTINCT subject) FILTER (WHERE day > current_date - 30 AND subject LIKE 'u:%') signed_users
       FROM mcp_usage`),
    q<{ d: string }>(`SELECT to_char(day, 'YYYY-MM-DD') d, SUM(calls) FILTER (WHERE subject LIKE 'u:%') signed, SUM(calls) FILTER (WHERE subject LIKE 'ip:%') anon
       FROM mcp_usage WHERE day > current_date - 30 GROUP BY 1`),
    q(`SELECT tool, COUNT(*) calls, COUNT(*) FILTER (WHERE NOT ok) errors, ROUND(AVG(ms)) ms
       FROM mcp_events WHERE kind = 'call' AND ts > now() - interval '30 days' GROUP BY 1 ORDER BY 2 DESC`),
    q(`SELECT COALESCE(split_part(client, ' ', 1), '(unnamed)') client, COUNT(*) connects, COUNT(DISTINCT subject) users
       FROM mcp_events WHERE kind = 'connect' AND ts > now() - interval '30 days' GROUP BY 1 ORDER BY 2 DESC LIMIT 15`),
    q(`SELECT COALESCE(u.email, m.subject) who, SUM(m.calls) calls, to_char(MAX(m.day), 'YYYY-MM-DD') last_day
       FROM mcp_usage m LEFT JOIN users u ON m.subject = 'u:' || u.id
       WHERE m.day > current_date - 30 GROUP BY 1 ORDER BY 2 DESC LIMIT 15`),

    q(`SELECT COUNT(*) FILTER (WHERE NOT is_bot AND ts > now() - interval '1 day') views_day,
              COUNT(DISTINCT visitor) FILTER (WHERE NOT is_bot AND ts > now() - interval '1 day') visitors_day,
              COUNT(*) FILTER (WHERE NOT is_bot) views_30,
              COUNT(DISTINCT visitor) FILTER (WHERE NOT is_bot) visitors_30,
              COUNT(*) FILTER (WHERE is_bot) bot_views_30,
              MIN(ts) since
       FROM page_views WHERE ts > now() - interval '30 days'`),
    q<{ d: string }>(`SELECT to_char(ts, 'YYYY-MM-DD') d,
              COUNT(*) FILTER (WHERE NOT is_bot) human, COUNT(*) FILTER (WHERE is_bot) bot,
              COUNT(DISTINCT visitor) FILTER (WHERE NOT is_bot) visitors
       FROM page_views WHERE ts > now() - interval '30 days' GROUP BY 1`),
    q(`SELECT path, COUNT(*) views, COUNT(DISTINCT visitor) visitors FROM page_views
       WHERE NOT is_bot AND ts > now() - interval '30 days' GROUP BY 1 ORDER BY 2 DESC LIMIT 20`),
    q(`SELECT '/' || split_part(path, '/', 2) section, COUNT(*) views, COUNT(*) FILTER (WHERE is_bot) bots FROM page_views
       WHERE ts > now() - interval '30 days' GROUP BY 1 ORDER BY 2 DESC LIMIT 15`),
    q(`SELECT COALESCE(referrer_host, '(مباشر)') ref, COUNT(*) views FROM page_views
       WHERE NOT is_bot AND ts > now() - interval '30 days' GROUP BY 1 ORDER BY 2 DESC LIMIT 15`),
    q(`SELECT device, COUNT(*) views FROM page_views WHERE NOT is_bot AND ts > now() - interval '30 days' GROUP BY 1`),
  ])

  const ut = userTotals[0] ?? {}, mt = mcpTotals[0] ?? {}, vt = viewTotals[0] ?? {}
  const devTotal = devices.reduce((a, r) => a + Number(r.views), 0) || 1

  return (
    <div dir="rtl" className="max-w-6xl mx-auto space-y-10">
      <header className="relative">
        <form action="/api/admin/lock" method="post" className="absolute left-0 top-0">
          <button type="submit" className="rounded-lg border border-border px-3 py-1.5 text-xs text-gray-600 hover:border-red-300 hover:text-red-700">قفل</button>
        </form>
        <h1 className="text-2xl font-bold text-green-900">الإحصاءات</h1>
        <p className="text-sm text-gray-500">آخر ٣٠ يومًا · خاصة بك وحدك · الزوار يُعدّون بلا ملفات تعريف: بصمةٌ لعنوان الشبكة والمتصفح تتجدد كل يوم</p>
      </header>

      <Section title="التسجيل">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="الحسابات" value={n(ut.total)} />
          <Stat label="جديدة هذا الأسبوع" value={n(ut.week_n)} sub={`${n(ut.month_n)} في ٣٠ يومًا`} />
          <Stat label="دخلوا في ٣٠ يومًا" value={n(ut.active)} />
          <Stat label="ربطوا مساعدًا (OAuth)" value={n(ut.with_oauth)} />
          <Stat label="لديهم رموز شخصية" value={n(ut.with_tokens)} />
        </div>
        <div className="ui-card rounded-xl p-4"><Bars rows={days30(signupDays)} series={[{ key: 'n', label: 'تسجيلات جديدة', color: '#2d6a4a' }]} /></div>
        <div className="ui-card rounded-xl p-4 overflow-x-auto">
          <Table head={['البريد', 'التسجيل', 'آخر دخول', 'طلبات MCP', 'رموز']}
            rows={recentUsers.map(r => [String(r.email), when(r.created_at), when(r.last_login_at), n(r.calls), n(r.tokens)])} />
        </div>
      </Section>

      <Section title="خادم MCP">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="طلبات اليوم" value={n(mt.today)} />
          <Stat label="هذا الأسبوع" value={n(mt.week_n)} />
          <Stat label="٣٠ يومًا" value={n(mt.month_n)} />
          <Stat label="مستخدمون بحساب" value={n(mt.signed_users)} />
          <Stat label="مستخدمون دون حساب" value={n(mt.anon_users)} sub="عناوين شبكة مختلفة" />
        </div>
        <div className="ui-card rounded-xl p-4">
          <Bars rows={days30(mcpDays)} series={[{ key: 'signed', label: 'بحساب', color: '#2d6a4a' }, { key: 'anon', label: 'دون حساب', color: '#c9a45c' }]} />
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <div className="ui-card rounded-xl p-4 overflow-x-auto"><h3 className="text-sm font-bold text-gray-700 mb-2">الأدوات</h3>
            <Table head={['الأداة', 'طلبات', 'أخطاء', 'مللي ث']} rows={tools.map(r => [String(r.tool), n(r.calls), n(r.errors), n(r.ms)])} /></div>
          <div className="ui-card rounded-xl p-4 overflow-x-auto"><h3 className="text-sm font-bold text-gray-700 mb-2">التطبيقات المتصلة</h3>
            <Table head={['التطبيق', 'اتصالات', 'مستخدمون']} rows={clients.map(r => [String(r.client), n(r.connects), n(r.users)])} /></div>
          <div className="ui-card rounded-xl p-4 overflow-x-auto"><h3 className="text-sm font-bold text-gray-700 mb-2">الأكثر استعمالًا</h3>
            <Table head={['المستخدم', 'طلبات', 'آخر يوم']} rows={topUsers.map(r => [String(r.who).startsWith('ip:') ? 'دون حساب · ' + String(r.who).slice(3, 11) : String(r.who), n(r.calls), String(r.last_day ?? '').slice(0, 10)])} /></div>
        </div>
        <p className="text-xs text-gray-400">تفاصيل الأدوات والتطبيقات تُسجَّل منذ نشر هذه الصفحة؛ والأعداد اليومية منذ إطلاق الخادم.</p>
      </Section>

      <Section title="زيارات الموقع">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="مشاهدات (٢٤ ساعة)" value={n(vt.views_day)} sub={`${n(vt.visitors_day)} زائرًا`} />
          <Stat label="مشاهدات (٣٠ يومًا)" value={n(vt.views_30)} />
          <Stat label="زوار (مجموع الأيام)" value={n(vt.visitors_30)} />
          <Stat label="زيارات الزواحف" value={n(vt.bot_views_30)} sub="Googlebot وغيره، منفصلة" />
          <Stat label="الجوال" value={`${Math.round((Number(devices.find(r => r.device === 'mobile')?.views ?? 0) / devTotal) * 100)}%`} />
        </div>
        <div className="ui-card rounded-xl p-4">
          <Bars rows={days30(viewDays)} series={[{ key: 'human', label: 'زوار', color: '#2d6a4a' }, { key: 'bot', label: 'زواحف', color: '#d6ccb4' }]} />
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <div className="ui-card rounded-xl p-4 overflow-x-auto"><h3 className="text-sm font-bold text-gray-700 mb-2">أكثر الصفحات (زوار)</h3>
            <Table head={['الصفحة', 'مشاهدات', 'زوار']} rows={topPages.map(r => [String(r.path), n(r.views), n(r.visitors)])} /></div>
          <div className="ui-card rounded-xl p-4 overflow-x-auto"><h3 className="text-sm font-bold text-gray-700 mb-2">الأقسام</h3>
            <Table head={['القسم', 'الكل', 'زواحف']} rows={sections.map(r => [String(r.section), n(r.views), n(r.bots)])} /></div>
          <div className="ui-card rounded-xl p-4 overflow-x-auto"><h3 className="text-sm font-bold text-gray-700 mb-2">من أين يأتون</h3>
            <Table head={['المصدر', 'مشاهدات']} rows={referrers.map(r => [String(r.ref), n(r.views)])} /></div>
        </div>
        <p className="text-xs text-gray-400">
          تُعدّ الزيارات منذ {vt.since ? when(vt.since) : 'نشر هذه الصفحة'} من الصفحة نفسها، فلا تظهر الزواحف التي لا تشغّل جافاسكربت؛ وسجلُّها الكامل في سجلات Railway.
        </p>
      </Section>
    </div>
  )
}
