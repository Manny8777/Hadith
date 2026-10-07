import pool from '@/lib/db'

// The statistics themselves (sign-ups, MCP use, site traffic), rendered by app/admin/page.tsx once
// the reader is signed in, an admin and unlocked. Sizes are set for this page: the site's root font
// is 70% from 640px up, which left the tables and labels here at 8–10px.

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
  const totals = rows.map(r => series.reduce((a, s) => a + Number(r[s.key] ?? 0), 0))
  const max = Math.max(1, ...totals)
  const sum = totals.reduce((a, b) => a + b, 0)
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2 text-sm sm:text-[1.15rem]">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-gray-600">
          {series.map(s => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <i className="inline-block w-3 h-3 rounded-sm" style={{ background: s.color }} />{s.label}
            </span>
          ))}
        </div>
        <span className="text-gray-500 whitespace-nowrap" dir="ltr">30 days: <b className="text-gray-800 tabular-nums">{n(sum)}</b></span>
      </div>
      <div className="relative" dir="ltr">
        {/* the scale: the busiest day at the top */}
        <span className="absolute -top-0.5 left-0 text-xs sm:text-[1rem] text-gray-400 tabular-nums">{n(max)}</span>
        <div className="flex items-end gap-[3px] h-40 sm:h-48 border-b border-border pt-5">
          {rows.map((r, i) => (
            <div key={i} className="group relative flex-1 h-full flex flex-col-reverse min-w-0 hover:opacity-80"
              title={`${day(r.d)} — ${series.map(s => `${s.label}: ${n(r[s.key])}`).join(' · ')}`}>
              {series.map(s => (
                <div key={s.key} style={{ height: `${(Number(r[s.key] ?? 0) / max) * 100}%`, background: s.color }} />
              ))}
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs sm:text-[1rem] text-gray-400 mt-1 tabular-nums">
          <span>{day(rows[0]?.d)}</span><span>{day(rows[Math.floor(rows.length / 2)]?.d)}</span><span>{day(rows[rows.length - 1]?.d)}</span>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="ui-card rounded-xl p-4 min-w-0">
      <div className="text-sm sm:text-[1.15rem] text-gray-500 leading-snug">{label}</div>
      <div className="text-[1.9rem] sm:text-[2.6rem] font-bold text-green-900 mt-1 leading-none tabular-nums whitespace-nowrap" dir="ltr">{value}</div>
      {sub && <div className="text-xs sm:text-[1rem] text-gray-400 mt-1.5">{sub}</div>}
    </div>
  )
}

// The first column takes the room that is left and is cut with «…» (full text on hover); the
// number columns fit their numbers and are never squeezed
function Table({ head, rows }: { head: string[]; rows: (string | number | null)[][] }) {
  return (
    <table className="w-full text-sm sm:text-[1.15rem]">
      <thead>
        <tr className="text-xs sm:text-[1rem] text-gray-500 border-b border-border">
          {head.map((h, i) => (
            <th key={i} className={`font-medium py-1.5 px-2 whitespace-nowrap ${i === 0 ? 'text-right w-full' : 'text-left'}`}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length ? rows.map((r, i) => (
          <tr key={i} className="border-b border-border/60 hover:bg-surface-sunken/40">
            {r.map((c, j) => j === 0
              ? <td key={j} className="py-1.5 px-2 max-w-0 w-full min-w-[9rem] sm:min-w-[12rem]" title={String(c ?? '')}><span className="block truncate text-right" dir="auto">{c ?? '—'}</span></td>
              : <td key={j} className="py-1.5 px-2 text-left text-gray-700 whitespace-nowrap tabular-nums" dir="ltr">{c ?? '—'}</td>)}
          </tr>
        )) : <tr><td colSpan={head.length} className="py-3 px-2 text-gray-400">لا بيانات بعد</td></tr>}
      </tbody>
    </table>
  )
}

const Card = ({ title, children }: { title?: string; children: React.ReactNode }) => (
  <div className="ui-card rounded-xl p-4 min-w-0 overflow-x-auto">
    {title && <h3 className="text-base sm:text-[1.25rem] font-bold text-gray-700 mb-2">{title}</h3>}
    {children}
  </div>
)

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-3">
    <h2 className="text-xl sm:text-[1.7rem] font-bold text-green-900">{title}</h2>
    {children}
  </section>
)

const STATS = 'grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3'
const TABLES = 'grid md:grid-cols-2 xl:grid-cols-3 gap-3'

export default async function Dashboard({ lockForm }: { lockForm?: React.ReactNode }) {
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
  const mobile = Math.round((Number(devices.find(r => r.device === 'mobile')?.views ?? 0) / devTotal) * 100)

  return (
    <div dir="rtl" className="max-w-[1500px] mx-auto space-y-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-[2.2rem] font-bold text-green-900">الإحصاءات</h1>
          <p className="text-sm sm:text-[1.15rem] text-gray-500 mt-1">آخر ٣٠ يومًا · خاصة بك وحدك · الزوار يُعدّون بلا ملفات تعريف: بصمةٌ لعنوان الشبكة والمتصفح تتجدد كل يوم</p>
        </div>
        {lockForm}
      </header>

      <Section title="التسجيل">
        <div className={STATS}>
          <Stat label="الحسابات" value={n(ut.total)} />
          <Stat label="جديدة هذا الأسبوع" value={n(ut.week_n)} sub={`${n(ut.month_n)} في ٣٠ يومًا`} />
          <Stat label="دخلوا في ٣٠ يومًا" value={n(ut.active)} />
          <Stat label="ربطوا مساعدًا (OAuth)" value={n(ut.with_oauth)} />
          <Stat label="لديهم رموز شخصية" value={n(ut.with_tokens)} />
        </div>
        <Card><Bars rows={days30(signupDays)} series={[{ key: 'n', label: 'تسجيلات جديدة', color: '#2d6a4a' }]} /></Card>
        <Card title="آخر الحسابات">
          <Table head={['البريد', 'التسجيل', 'آخر دخول', 'طلبات MCP', 'رموز']}
            rows={recentUsers.map(r => [String(r.email), when(r.created_at), when(r.last_login_at), n(r.calls), n(r.tokens)])} />
        </Card>
      </Section>

      <Section title="خادم MCP">
        <div className={STATS}>
          <Stat label="طلبات اليوم" value={n(mt.today)} />
          <Stat label="هذا الأسبوع" value={n(mt.week_n)} />
          <Stat label="٣٠ يومًا" value={n(mt.month_n)} />
          <Stat label="مستخدمون بحساب" value={n(mt.signed_users)} />
          <Stat label="مستخدمون دون حساب" value={n(mt.anon_users)} sub="عناوين شبكة مختلفة" />
        </div>
        <Card><Bars rows={days30(mcpDays)} series={[{ key: 'signed', label: 'بحساب', color: '#2d6a4a' }, { key: 'anon', label: 'دون حساب', color: '#c9a45c' }]} /></Card>
        <div className={TABLES}>
          <Card title="الأدوات">
            <Table head={['الأداة', 'طلبات', 'أخطاء', 'مللي ث']} rows={tools.map(r => [String(r.tool), n(r.calls), n(r.errors), n(r.ms)])} />
          </Card>
          <Card title="التطبيقات المتصلة">
            <Table head={['التطبيق', 'اتصالات', 'مستخدمون']} rows={clients.map(r => [String(r.client), n(r.connects), n(r.users)])} />
          </Card>
          <Card title="الأكثر استعمالًا">
            <Table head={['المستخدم', 'طلبات', 'آخر يوم']} rows={topUsers.map(r => [String(r.who).startsWith('ip:') ? 'دون حساب · ' + String(r.who).slice(3, 11) : String(r.who).startsWith('u:') ? 'حساب محذوف · ' + String(r.who).slice(2) : String(r.who), n(r.calls), String(r.last_day ?? '').slice(0, 10)])} />
          </Card>
        </div>
        <p className="text-xs sm:text-[1rem] text-gray-400">تفاصيل الأدوات والتطبيقات تُسجَّل منذ نشر هذه الصفحة؛ والأعداد اليومية منذ إطلاق الخادم.</p>
      </Section>

      <Section title="زيارات الموقع">
        <div className={STATS}>
          <Stat label="مشاهدات (٢٤ ساعة)" value={n(vt.views_day)} sub={`${n(vt.visitors_day)} زائرًا`} />
          <Stat label="مشاهدات (٣٠ يومًا)" value={n(vt.views_30)} />
          <Stat label="زوار (مجموع الأيام)" value={n(vt.visitors_30)} />
          <Stat label="زيارات الزواحف" value={n(vt.bot_views_30)} sub="Googlebot وغيره، منفصلة" />
          <Stat label="الجوال" value={`${mobile}%`} />
        </div>
        {/* people only: the crawlers' tens of thousands would flatten them (they have their own card above) */}
        <Card><Bars rows={days30(viewDays)} series={[{ key: 'human', label: 'مشاهدات الزوار', color: '#2d6a4a' }]} /></Card>
        <div className={TABLES}>
          <Card title="أكثر الصفحات (زوار)">
            <Table head={['الصفحة', 'مشاهدات', 'زوار']} rows={topPages.map(r => [decodeURIComponentSafe(String(r.path)), n(r.views), n(r.visitors)])} />
          </Card>
          <Card title="الأقسام">
            <Table head={['القسم', 'الكل', 'زواحف']} rows={sections.map(r => [String(r.section), n(r.views), n(r.bots)])} />
          </Card>
          <Card title="من أين يأتون">
            <Table head={['المصدر', 'مشاهدات']} rows={referrers.map(r => [String(r.ref), n(r.views)])} />
          </Card>
        </div>
        <p className="text-xs sm:text-[1rem] text-gray-400">
          تُعدّ الزيارات منذ {vt.since ? when(vt.since) : 'نشر هذه الصفحة'} من الصفحة نفسها، فلا تظهر الزواحف التي لا تشغّل جافاسكربت؛ وسجلُّها الكامل في سجلات Railway.
        </p>
      </Section>
    </div>
  )
}

// Paths are stored as requested («/search?q=%D8%B2…»): shown readable
function decodeURIComponentSafe(s: string) {
  try { return decodeURIComponent(s) } catch { return s }
}
