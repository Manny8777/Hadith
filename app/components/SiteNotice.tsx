export default function SiteNotice() {
  return (
    <div
      className="bg-amber-50/70 border-b border-amber-200/60 text-amber-900 text-[11px] sm:text-xs leading-tight px-4 py-1 font-sans"
      dir="rtl"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-center gap-x-2 gap-y-0.5 flex-wrap px-3 sm:px-6 lg:px-7 text-center">
        <span>
          <span className="font-semibold text-amber-700">تنبيه:</span>{' '}
          الموقع قيد التطوير.
        </span>
        <span className="hidden sm:inline text-amber-300">·</span>
        <span className="text-amber-800/80">
          نحن بحاجة لطلاب علم لإرشادنا ومساعدتنا — تواصل واتساب:{' '}
          <a
            href="https://wa.me/61426047327"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-green-700 hover:text-green-800 underline underline-offset-2"
          >
            <bdi dir="ltr" className="tabular-nums" data-no-convert>+61 426 047 327</bdi>
          </a>
        </span>
      </div>
    </div>
  )
}
