'use client'

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded-lg transition-colors bg-white"
      title="طباعة الحديث"
    >
      طباعة
    </button>
  )
}
