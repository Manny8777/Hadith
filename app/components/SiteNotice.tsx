export default function SiteNotice() {
  return (
    <div
      className="bg-amber-100 border-b border-amber-300 text-amber-950 text-sm leading-relaxed px-4 py-2.5"
      dir="rtl"
    >
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p className="font-semibold">
          <span className="text-amber-800">تنبيه:</span>{' '}
          الموقع لا يزال قيد التطوير وغير جاهز للاستخدام بعد.
        </p>
        <p className="text-amber-900">
          إن رغبت في المساهمة في هذا المشروع، تواصل معي عبر واتساب:{' '}
          <a
            href="https://wa.me/61426047327"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-green-800 hover:text-green-900 underline underline-offset-2"
          >
            <bdi dir="ltr" className="tabular-nums">
              +61 426 047 327
            </bdi>
          </a>
        </p>
      </div>
    </div>
  )
}
