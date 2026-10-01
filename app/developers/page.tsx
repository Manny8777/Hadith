import { MCP_LIMITS } from '@/lib/mcp/limits'
import { TOOLS } from '@/lib/mcp/tools'
import { pageMeta } from '@/lib/siteMeta'

export const metadata = pageMeta({
  title: 'للمطورين — الجامع',
  description: 'خادم MCP لموسوعة الحديث النبوي «الجامع»، ومستودع الموقع على GitHub.',
  path: '/developers',
})

const REPO = 'https://github.com/Manny8777/Hadith'

function Code({ children }: { children: React.ReactNode }) {
  return <pre dir="ltr" className="mt-2 overflow-x-auto rounded-lg bg-[#0F3D2E] text-[#F8F1E4] text-xs leading-relaxed px-4 py-3 font-mono whitespace-pre-wrap break-all">{children}</pre>
}

export default function DevelopersPage() {
  return (
    <div dir="rtl" className="max-w-3xl mx-auto space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-green-900 mb-1">للمطورين</h1>
        <p className="text-sm text-gray-600 leading-relaxed">
          الموسوعة مفتوحة للمبرمجين والباحثين: شيفرة الموقع على GitHub، وخادم MCP يتيح لمساعدات الذكاء الاصطناعي
          (Claude وChatGPT وغيرهما) أن تبحث في الأحاديث والرواة والتخريج وتنقل النصوص كما هي مع روابطها.
        </p>
      </header>

      <section id="github" className="ui-card rounded-2xl p-5 scroll-mt-28">
        <h2 className="text-lg font-bold text-green-900 mb-2">المستودع على GitHub</h2>
        <p className="text-sm text-gray-600 mb-3 leading-relaxed">
          شيفرة الموقع (Next.js وPostgreSQL)، وأفلام الميزات، وخطط العمل.
        </p>
        <a href={REPO} target="_blank" rel="noopener" dir="ltr"
          className="inline-flex items-center gap-2 rounded-lg bg-[#0F3D2E] px-4 py-2 text-sm font-semibold text-[#F8F1E4] hover:bg-[#15503d]">
          github.com/Manny8777/Hadith ↗
        </a>
      </section>

      <section id="mcp" className="ui-card rounded-2xl p-5 scroll-mt-28 space-y-4">
        <video controls preload="metadata" playsInline poster="/media/mcp-poster.jpg"
          aria-label="الجامع في مساعدك الذكي — خادم MCP"
          className="w-full aspect-video rounded-xl border border-[#D9C9A8] bg-[#0F3D2E]">
          <source src="/media/mcp.mp4" type="video/mp4" />
          <track kind="captions" src="/media/mcp.ar.vtt" srcLang="ar" label="العربية" />
        </video>
        <div>
          <h2 className="text-lg font-bold text-green-900 mb-2">خادم MCP</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            <b>MCP</b> (Model Context Protocol) معيارٌ تتصل به مساعدات الذكاء الاصطناعي بمصادر البيانات. أضِف الخادم إلى مساعدك،
            ثم اسأله مثلًا: «خرّج حديث إنما الأعمال بالنيات، واذكر أحكام العلماء عليه».
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-border p-3">
            <p className="font-semibold text-gray-800 mb-1">دون حساب</p>
            <code dir="ltr" className="text-xs bg-paper px-1.5 py-0.5 rounded">https://hadith.dev/mcp</code>
            <p className="text-xs text-gray-500 mt-1.5">{MCP_LIMITS.anon} طلبًا في اليوم</p>
          </div>
          <div className="rounded-xl border border-green-300 bg-green-50/40 p-3">
            <p className="font-semibold text-gray-800 mb-1">بحسابٍ مجاني</p>
            <code dir="ltr" className="text-xs bg-paper px-1.5 py-0.5 rounded">https://hadith.dev/mcp/account</code>
            <p className="text-xs text-gray-500 mt-1.5">{MCP_LIMITS.user.toLocaleString('ar-EG')} طلب في اليوم — <a href="/login?next=/account" className="text-green-700 hover:underline">أنشئ حسابًا</a></p>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-bold text-gray-800">Claude (الموقع أو التطبيق)</h3>
          <p className="text-sm text-gray-600 mt-1 leading-relaxed">
            الإعدادات ← الموصِّلات (Connectors) ← إضافة موصِّل مخصص، والصق أحد الرابطين أعلاه. برابط الحساب يفتح Claude صفحة الدخول ثم يطلب إذنك.
          </p>
        </div>
        <div>
          <h3 className="text-sm font-bold text-gray-800">Claude Code</h3>
          <Code>claude mcp add --transport http hadith https://hadith.dev/mcp</Code>
          <p className="text-xs text-gray-500 mt-1.5">وللحد الأعلى: أنشئ رمزًا شخصيًا من <a href="/account" className="text-green-700 hover:underline">حسابي</a> وأضِفه:</p>
          <Code>{'claude mcp add --transport http hadith https://hadith.dev/mcp --header "Authorization: Bearer hd_…"'}</Code>
        </div>
        <div>
          <h3 className="text-sm font-bold text-gray-800">ChatGPT وCursor وVS Code وغيرها</h3>
          <p className="text-sm text-gray-600 mt-1">أضف خادم MCP بعيدًا (Streamable HTTP) بأحد الرابطين؛ ورابط الحساب يدعم تسجيل الدخول (OAuth).</p>
          <Code>{`{
  "mcpServers": {
    "hadith": { "url": "https://hadith.dev/mcp" }
  }
}`}</Code>
        </div>

        <div>
          <h3 className="text-sm font-bold text-gray-800 mb-2">الأدوات</h3>
          <ul className="divide-y divide-border rounded-xl border border-border text-sm">
            {TOOLS.map(t => (
              <li key={t.name} className="px-3 py-2">
                <code dir="ltr" className="text-xs font-semibold text-green-800">{t.name}</code>
                <span className="text-gray-700"> — {t.title}</span>
                <p className="text-xs text-gray-500 mt-0.5" dir="ltr">{t.description}</p>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-gray-500 leading-relaxed">
          الخادم للقراءة فقط. تُنقل النصوص كما في مصادرها، وأحكام الأحاديث منسوبةٌ إلى قائليها كما لخّصتها الدرر السنية؛ ولا يحكم الخادم على حديثٍ من عنده.
        </p>
      </section>
    </div>
  )
}
