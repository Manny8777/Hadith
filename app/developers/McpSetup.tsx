'use client'
// Connecting the MCP server, step by step: choose a link (no account, or with an account), then the
// steps for the reader's own assistant. Steps follow each platform's documentation as of 2026-10
// (Claude: support.claude.com «custom connectors using remote MCP»; ChatGPT: developers.openai.com
// «Connect from ChatGPT»); menu names change, so the troubleshooting box says what to look for.
import { useState } from 'react'

const OPEN = 'https://hadith.dev/mcp'
const ACCOUNT = 'https://hadith.dev/mcp/account'
type Mode = 'open' | 'account'

function Copy({ text, label, plain }: { text: string; label?: string; plain?: boolean }) {
  const [done, setDone] = useState(false)
  return (
    <span className="inline-flex items-center gap-2 max-w-full">
      {plain
        ? <span className="text-sm sm:text-[1.15rem] bg-paper border border-border px-3 py-1.5 rounded-lg">{text}</span>
        : <code dir="ltr" className="text-sm sm:text-[1.1rem] bg-paper border border-border px-2 py-1 rounded-lg break-all">{text}</code>}
      <button type="button" className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs sm:text-[1rem] text-gray-700 hover:border-green-600 hover:text-green-800"
        onClick={() => { navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500) }}>
        {done ? '✓ نُسخ' : label ?? 'نسخ'}
      </button>
    </span>
  )
}

function Block({ children }: { children: string }) {
  const [done, setDone] = useState(false)
  return (
    // The copy button sits in its own bar on the right, above the command, so it never covers it;
    // the command itself stays selectable with the mouse
    <div className="rounded-xl bg-[#1d3a2f] overflow-hidden">
      <div className="flex justify-start border-b border-white/10 px-2 py-1.5">
        <button type="button" className="rounded-md bg-white/10 hover:bg-white/20 text-white text-xs sm:text-[0.95rem] px-3 py-1"
          onClick={() => { navigator.clipboard?.writeText(children); setDone(true); setTimeout(() => setDone(false), 1500) }}>
          {done ? '✓ نُسخ' : 'نسخ'}
        </button>
      </div>
      <pre dir="ltr" className="select-text cursor-text text-[#e8f0ea] selection:bg-amber-300 selection:text-gray-900 text-xs sm:text-[1rem] leading-relaxed p-4 overflow-x-auto whitespace-pre">{children}</pre>
    </div>
  )
}

const Steps = ({ children }: { children: React.ReactNode }) => (
  <ol className="list-decimal pr-6 space-y-2 text-sm sm:text-[1.15rem] text-gray-700 leading-relaxed marker:text-green-700 marker:font-bold">{children}</ol>
)
const K = ({ children }: { children: React.ReactNode }) => <b className="text-gray-900" dir="auto">{children}</b>

// The other way for agents that run commands: a message to paste into the agent itself. It runs the
// command, checks it, and tells the reader to restart — the new tools load only in a new session.
function AgentPrompt({ app, cmd, check, signIn }: { app: string; cmd: string; check: string; signIn?: string }) {
  const text = `أضف خادم MCP «الجامع» (موسوعة الحديث النبوي) بتشغيل هذا الأمر في الطرفية:\n${cmd}\n`
    + `ثم تأكّد أنه أُضيف بالأمر: ${check}\n`
    + `وبعدها أخبرني أن أعيد تشغيل ${app} (أغلقه ثم افتحه من جديد) لأن أدوات الجامع لا تُحمَّل إلا في جلسة جديدة`
    + (signIn ? `، وأن أسجّل الدخول بعد ذلك من ${signIn} (بريدي ثم الرمز الذي يصلني)` : '')
    + `، ثم أن أسألك: «خرّج حديث إنما الأعمال بالنيات من الجامع».`
  const [done, setDone] = useState(false)
  return (
    <div className="rounded-xl border border-green-200 bg-green-50/50 p-3 space-y-2">
      <p className="text-sm sm:text-[1.15rem] font-bold text-green-900">أو دَعْه يضيفه لك: انسخ هذه الرسالة والصقها في {app}</p>
      <p dir="rtl" className="whitespace-pre-wrap text-xs sm:text-[1rem] text-gray-700 bg-white border border-border rounded-lg p-3 leading-relaxed">{text}</p>
      <button type="button" className="rounded-lg bg-green-800 hover:bg-green-900 text-white text-xs sm:text-[1rem] px-3 py-1.5"
        onClick={() => { navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500) }}>
        {done ? '✓ نُسخت الرسالة' : 'نسخ الرسالة'}
      </button>
      <p className="text-xs sm:text-[0.95rem] text-gray-500">سيطلب إذنك قبل تشغيل الأمر. وبعد إضافته <b>أعد تشغيل {app}</b> — وإلا فلن يرى الأدوات.</p>
    </div>
  )
}

// One-click install links (Cursor: base64 of the server's mcp.json entry; VS Code: the URL-encoded
// object that `code --add-mcp` takes). They open the installed app, which asks before adding.
const cursorLink = (url: string) =>
  `cursor://anysphere.cursor-deeplink/mcp/install?name=hadith&config=${encodeURIComponent(btoa(JSON.stringify({ url })))}`
const vscodeLink = (url: string) =>
  `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: 'hadith', type: 'http', url }))}`

function InstallButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="inline-flex items-center gap-2 rounded-lg bg-green-800 hover:bg-green-900 text-white text-sm sm:text-[1.1rem] font-semibold px-4 py-2">
      {children}
    </a>
  )
}

const PLATFORMS =['Claude', 'ChatGPT', 'Claude Code', 'Codex', 'Cursor', 'VS Code', 'Gemini CLI', 'غيرها'] as const
type Platform = typeof PLATFORMS[number]

export default function McpSetup() {
  const [mode, setMode] = useState<Mode>('open')
  const [platform, setPlatform] = useState<Platform>('Claude')
  const url = mode === 'open' ? OPEN : ACCOUNT
  const signIn = mode === 'account'

  return (
    <div className="space-y-6">
      {/* 1 · which link */}
      <div>
        <h3 className="text-base sm:text-[1.35rem] font-bold text-green-900 mb-2">١ · اختر الرابط</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          {([
            ['open', 'دون حساب — الأسهل', 'يعمل فورًا، بلا تسجيل دخول. ٥٠ طلبًا في اليوم.', OPEN],
            ['account', 'بحسابك المجاني', 'يطلب منك مساعدك الدخولَ مرةً: بريدك ثم رمزٌ من ٦ أرقام يصلك فيه. ١٬٠٠٠ طلب في اليوم، ومكتبتك.', ACCOUNT],
          ] as [Mode, string, string, string][]).map(([m, title, hint, u]) => (
            <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m}
              className={`text-right rounded-xl border-2 p-4 transition-colors ${mode === m ? 'border-green-700 bg-green-50/60' : 'border-border hover:border-green-400'}`}>
              <span className="flex items-center gap-2 font-bold text-gray-900 text-sm sm:text-[1.2rem]">
                <span className={`w-4 h-4 rounded-full border-2 ${mode === m ? 'border-green-700 bg-green-700' : 'border-gray-300'}`} />
                {title}
              </span>
              <span className="block text-xs sm:text-[1.05rem] text-gray-600 mt-1.5 leading-relaxed">{hint}</span>
              <code dir="ltr" className="block mt-2 text-xs sm:text-[1rem] text-green-800">{u}</code>
            </button>
          ))}
        </div>
        <div className="mt-3"><Copy text={url} label="نسخ الرابط" /></div>
      </div>

      {/* 2 · the assistant */}
      <div>
        <h3 className="text-base sm:text-[1.35rem] font-bold text-green-900 mb-2">٢ · أضِفه إلى مساعدك</h3>
        <div className="flex flex-wrap gap-1.5 mb-4" role="tablist">
          {PLATFORMS.map(p => (
            <button key={p} type="button" role="tab" aria-selected={platform === p} onClick={() => setPlatform(p)}
              className={`rounded-full px-3.5 py-1.5 text-xs sm:text-[1.05rem] border transition-colors ${platform === p ? 'bg-green-800 text-white border-green-800' : 'border-border text-gray-700 hover:border-green-600'}`}>
              {p}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-border p-4 space-y-3">
          {platform === 'Claude' && (<>
            <p className="text-xs sm:text-[1rem] text-gray-500">claude.ai على المتصفح، أو تطبيق Claude على الحاسوب. يُضاف الموصِّل من هناك، ثم يعمل في تطبيق الجوال أيضًا.</p>
            <Steps>
              <li>افتح <K>Customize</K> ← <K>Connectors</K> (الموصِّلات).</li>
              <li>اضغط <K>+ Add</K> ثم <K>Add custom connector</K>.</li>
              <li>الاسم: <K>الجامع</K> — والرابط: الصق <code dir="ltr" className="text-green-800">{url}</code> ثم <K>Continue</K>.</li>
              {signIn
                ? <li>في <K>Authentication</K> اختر تسجيل الدخول (<K>Sign in</K>) ثم <K>Add</K>. تفتح نافذة الجامع: اكتب بريدك، ثم <b>اكتب الرمز الذي يصلك في النافذة نفسها</b> (لا تفتح الرابط من البريد)، ثم وافق على الإذن.</li>
                : <li>في <K>Authentication</K> اختر بلا تسجيل (<K>No sign in</K>) ثم <K>Add</K>.</li>}
              <li>في المحادثة: زر <K>+</K> أسفل اليسار ← <K>Connectors</K> ← فعّل «الجامع».</li>
            </Steps>
            <p className="text-xs sm:text-[1rem] text-gray-500">الخطة المجانية في Claude تسمح بموصِّل مخصص واحد. في Team وEnterprise يضيفه مالك المنظمة أولًا من <span dir="ltr">Organization settings → Connectors</span>، ثم يتصل به كل عضو.</p>
          </>)}

          {platform === 'ChatGPT' && (<>
            <Steps>
              <li>افتح <a href="https://chatgpt.com/plugins" target="_blank" rel="noopener" className="text-green-700 underline" dir="ltr">chatgpt.com/plugins</a>.</li>
              <li>اضغط <K>+</K> ثم <K>Add custom MCP server</K>.</li>
              <li>الاسم: <K>الجامع</K>، وفي <K>Connection</K> اختر <K>Public endpoint</K> والصق <code dir="ltr" className="text-green-800">{url}</code>.</li>
              {signIn
                ? <li>المصادقة: <K>OAuth</K>. وافق على التنبيه (<K>I understand and want to continue</K>) ثم <K>Create as a plugin</K>. عند الدخول اكتب بريدك، ثم <b>الرمز الذي يصلك في النافذة نفسها</b>.</li>
                : <li>المصادقة: بلا مصادقة (<K>None</K>). وافق على التنبيه (<K>I understand and want to continue</K>) ثم <K>Create as a plugin</K>.</li>}
              <li>ثبّت الإضافة، وابدأ محادثة جديدة، واكتب <K>@</K> واختر «الجامع».</li>
            </Steps>
            <p className="text-xs sm:text-[1rem] text-gray-500">إضافة خوادم MCP المخصصة في ChatGPT تتبع خطتك وسياسات مساحة العمل؛ إن لم تجد الخيار فقد لا يكون متاحًا لحسابك.</p>
          </>)}

          {platform === 'Claude Code' && (<>
            <p className="text-sm sm:text-[1.15rem] text-gray-700">أمرٌ واحد في الطرفية (يُضاف لكل مشاريعك):</p>
            <Block>{`claude mcp add --transport http --scope user hadith ${url}`}</Block>
            <p className="text-xs sm:text-[1rem] text-gray-500">ثم أعد تشغيل Claude Code{signIn ? <>، واكتب داخله <code dir="ltr">/mcp</code> واختر <K>hadith</K> لتسجيل الدخول</> : null}.</p>
            <AgentPrompt app="Claude Code" cmd={`claude mcp add --transport http --scope user hadith ${url}`} check="claude mcp list" signIn={signIn ? '/mcp ثم hadith' : undefined} />
            <details className="text-xs sm:text-[1rem] text-gray-500">
              <summary className="cursor-pointer">برمزٍ شخصي بدل نافذة الدخول</summary>
              <p className="my-2">أنشئ رمزًا من <a href="/account" className="text-green-700 underline">حسابي</a> ثم:</p>
              <Block>{`claude mcp add --transport http --scope user hadith ${OPEN} --header "Authorization: Bearer hd_…"`}</Block>
            </details>
          </>)}

          {platform === 'Codex' && (<>
            <p className="text-sm sm:text-[1.15rem] text-gray-700">أمرٌ واحد في الطرفية:</p>
            <Block>{`codex mcp add hadith --url ${url}`}</Block>
            {signIn && <><p className="text-sm sm:text-[1.15rem] text-gray-700">ثم سجّل الدخول (بريدك، ثم الرمز):</p><Block>{'codex mcp login hadith'}</Block></>}
            <p className="text-xs sm:text-[1rem] text-gray-500">ثم أعد تشغيل Codex. تأكّد بـ <code dir="ltr">codex mcp list</code>، وإن اختلفت الصيغة في إصدارك فانظر <code dir="ltr">codex mcp add --help</code>.</p>
            <AgentPrompt app="Codex" cmd={`codex mcp add hadith --url ${url}`} check="codex mcp list" signIn={signIn ? 'الأمر codex mcp login hadith' : undefined} />
          </>)}

          {platform === 'Cursor' && (<>
            <InstallButton href={cursorLink(url)}>أضِفه إلى Cursor بضغطة</InstallButton>
            <p className="text-xs sm:text-[1rem] text-gray-500">يفتح Cursor ويسألك قبل الإضافة. إن لم يعمل الزر فأضف يدويًا إلى <code dir="ltr">~/.cursor/mcp.json</code>:</p>
            <Block>{`{\n  "mcpServers": {\n    "hadith": { "url": "${url}" }\n  }\n}`}</Block>
            {signIn && <p className="text-xs sm:text-[1rem] text-gray-500">يطلب Cursor الدخول عند أول اتصال: بريدك، ثم الرمز.</p>}
          </>)}

          {platform === 'VS Code' && (<>
            <InstallButton href={vscodeLink(url)}>أضِفه إلى VS Code بضغطة</InstallButton>
            <p className="text-xs sm:text-[1rem] text-gray-500">يفتح VS Code ويسألك قبل الإضافة. أو أمرٌ واحد في الطرفية:</p>
            <Block>{`code --add-mcp '${JSON.stringify({ name: 'hadith', type: 'http', url })}'`}</Block>
            <p className="text-xs sm:text-[1rem] text-gray-500">أو يدويًا في <code dir="ltr">.vscode/mcp.json</code>:</p>
            <Block>{`{\n  "servers": {\n    "hadith": { "type": "http", "url": "${url}" }\n  }\n}`}</Block>
            {signIn && <p className="text-xs sm:text-[1rem] text-gray-500">يطلب VS Code الدخول عند أول اتصال: بريدك، ثم الرمز.</p>}
          </>)}

          {platform === 'Gemini CLI' && (<>
            <p className="text-sm sm:text-[1.15rem] text-gray-700">أمرٌ واحد في الطرفية:</p>
            <Block>{`gemini mcp add --transport http --scope user hadith ${url}`}</Block>
            <p className="text-xs sm:text-[1rem] text-gray-500">ثم أعد تشغيله واكتب <code dir="ltr">/mcp</code> للتأكد{signIn ? <>، و<code dir="ltr">/mcp auth hadith</code> لتسجيل الدخول</> : null}. أو يدويًا في <code dir="ltr">~/.gemini/settings.json</code>:</p>
            <Block>{`{\n  "mcpServers": {\n    "hadith": { "httpUrl": "${url}" }\n  }\n}`}</Block>
            <AgentPrompt app="Gemini CLI" cmd={`gemini mcp add --transport http --scope user hadith ${url}`} check="gemini mcp list" signIn={signIn ? '/mcp auth hadith' : undefined} />
          </>)}

          {platform === 'غيرها' && (<>
            <p className="text-sm sm:text-[1.15rem] text-gray-700 leading-relaxed">
              أي برنامج يقبل خادم MCP بعيدًا من نوع <K>Streamable HTTP</K> (أو «HTTP» فقط): أعطه الرابط أعلاه.
              {signIn ? ' ويكتشف تسجيل الدخول (OAuth) وحده.' : ' ولا يحتاج مصادقة.'}
              {' '}وإن طلب ترويسة بدل الدخول فاستعمل رمزًا شخصيًا من <a href="/account" className="text-green-700 underline">حسابي</a> مع الرابط <code dir="ltr">{OPEN}</code>:
            </p>
            <Block>{'Authorization: Bearer hd_…'}</Block>
          </>)}
        </div>
      </div>

      {/* 3 · try it */}
      <div>
        <h3 className="text-base sm:text-[1.35rem] font-bold text-green-900 mb-2">٣ · جرّبه</h3>
        <p className="text-sm sm:text-[1.15rem] text-gray-700 mb-2">اسأل مساعدك:</p>
        <Copy plain text="خرّج حديث «إنما الأعمال بالنيات» من الجامع، واذكر أحكام العلماء عليه" label="نسخ السؤال" />
      </div>

      <details className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 text-sm sm:text-[1.15rem] text-gray-700">
        <summary className="cursor-pointer font-bold text-amber-900">لم يكتمل الربط؟</summary>
        <ul className="list-disc pr-5 mt-3 space-y-2 leading-relaxed">
          <li><b>طُلب منك الدخول ولم يكتمل:</b> اكتب <b>الرمز</b> الذي يصلك بالبريد في نافذة الدخول نفسها؛ أمّا الرابط في الرسالة فيُفتح في متصفحٍ آخر فلا يعود إلى مساعدك. لم تصلك الرسالة؟ انظر في «الرسائل غير المرغوبة».</li>
          <li><b>الأسهل دائمًا:</b> احذف الموصِّل وأضفه بالرابط دون حساب <code dir="ltr">{OPEN}</code> — بلا أي تسجيل.</li>
          <li><b>أُضيف ولا يُستعمل:</b> فعّله في المحادثة (Claude: زر + ← Connectors؛ ChatGPT: اكتب @ واختره)، أو قل له صراحةً: «استعمل الجامع».</li>
          <li><b>Claude المجاني:</b> يسمح بموصِّل مخصص واحد؛ احذف غيره إن كان موجودًا.</li>
          <li><b>لا تجد الخيار في القائمة:</b> أسماء القوائم تتغير؛ ابحث عن «Connectors» أو «Custom connector» أو «MCP» في إعدادات مساعدك.</li>
        </ul>
      </details>
    </div>
  )
}
