'use client'
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

// Display style for digits across the whole site.
//   'western' → 0-9 (Latin)   'arabic' → ٠-٩ (Arabic-Indic)
type NumeralPref = 'western' | 'arabic'

const NumeralContext = createContext<{
  pref: NumeralPref
  toggle: () => void
}>({ pref: 'western', toggle: () => {} })

export function NumeralProvider({ children }: { children: ReactNode }) {
  const [pref, setPref] = useState<NumeralPref>('western')

  useEffect(() => {
    const stored = localStorage.getItem('numeral-style') as NumeralPref | null
    if (stored === 'western' || stored === 'arabic') setPref(stored)
  }, [])

  function toggle() {
    setPref(p => {
      const next: NumeralPref = p === 'western' ? 'arabic' : 'western'
      localStorage.setItem('numeral-style', next)
      return next
    })
  }

  return (
    <NumeralContext.Provider value={{ pref, toggle }}>
      {children}
    </NumeralContext.Provider>
  )
}

export function useNumeral() {
  return useContext(NumeralContext)
}
