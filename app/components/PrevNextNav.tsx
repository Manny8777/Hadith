import Link from 'next/link'

interface Props {
  prevId: number | null
  nextId: number | null
}

export default function PrevNextNav({ prevId, nextId }: Props) {
  return (
    <div dir="rtl" className="flex justify-between border-t border-gray-200 pt-3 mt-2 font-sans">
      <div>
        {prevId !== null && (
          <Link
            href={`/hadith/${prevId}`}
            className="text-xs text-gray-500 hover:text-green-800 hover:underline"
          >
            السابق →
          </Link>
        )}
      </div>
      <div>
        {nextId !== null && (
          <Link
            href={`/hadith/${nextId}`}
            className="text-xs text-gray-500 hover:text-green-800 hover:underline"
          >
            ← التالي
          </Link>
        )}
      </div>
    </div>
  )
}
