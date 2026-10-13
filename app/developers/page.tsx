import { MCP_LIMITS } from '@/lib/mcp/limits'
import { TOOLS as SITE_TOOLS } from '@/lib/mcp/tools'
import { LIBRARY_TOOLS } from '@/lib/mcp/libraryTools'

const TOOLS = [...SITE_TOOLS, ...LIBRARY_TOOLS]
import { pageMeta } from '@/lib/siteMeta'
import McpSetup from './McpSetup'

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
    <div dir="rtl" className="max-w-6xl mx-auto space-y-8">
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
        <video controls preload="metadata" playsInline poster="/media/connect-poster.jpg"
          aria-label="اربط الجامع بمساعدك الذكي في ثلاث خطوات"
          className="w-full aspect-video rounded-xl border border-[#D9C9A8] bg-[#0F3D2E]">
          <source src="/media/connect.mp4" type="video/mp4" />
          <track kind="captions" src="/media/connect.ar.vtt" srcLang="ar" label="العربية" />
        </video>
        <div>
          <h2 className="text-lg font-bold text-green-900 mb-2">خادم MCP</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            <b>MCP</b> (Model Context Protocol) معيارٌ تتصل به مساعدات الذكاء الاصطناعي بمصادر البيانات. أضِف الخادم إلى مساعدك،
            ثم اسأله مثلًا: «خرّج حديث إنما الأعمال بالنيات، واذكر أحكام العلماء عليه».
          </p>
        </div>

        <McpSetup />

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
