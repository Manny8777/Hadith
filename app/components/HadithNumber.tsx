'use client'
import { useNumbering } from '@/lib/numberingContext'

interface Props {
  harf: string | null | undefined
  matboa: string | null | undefined
  className?: string
}

export default function HadithNumber({ harf, matboa, className = '' }: Props) {
  const { pref } = useNumbering()

  const h = harf?.trim() || null
  const m = matboa?.trim() || null

  if (!h && !m) return null

  const primary   = pref === 'harf' ? h : m
  const secondary = pref === 'harf' ? m : h

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {primary && (
        <span className="font-mono bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded text-xs">
          {primary}
        </span>
      )}
      {secondary && (
        <span className="font-mono text-gray-400 text-[10px]">
          ({secondary})
        </span>
      )}
    </span>
  )
}
