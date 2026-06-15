'use client'
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

type Pref = 'harf' | 'matboa'

const NumberingContext = createContext<{
  pref: Pref
  toggle: () => void
}>({ pref: 'harf', toggle: () => {} })

export function NumberingProvider({ children }: { children: ReactNode }) {
  const [pref, setPref] = useState<Pref>('harf')

  useEffect(() => {
    const stored = localStorage.getItem('hadith-numbering') as Pref | null
    if (stored === 'harf' || stored === 'matboa') setPref(stored)
  }, [])

  function toggle() {
    setPref(p => {
      const next: Pref = p === 'harf' ? 'matboa' : 'harf'
      localStorage.setItem('hadith-numbering', next)
      return next
    })
  }

  return (
    <NumberingContext.Provider value={{ pref, toggle }}>
      {children}
    </NumberingContext.Provider>
  )
}

export function useNumbering() {
  return useContext(NumberingContext)
}
