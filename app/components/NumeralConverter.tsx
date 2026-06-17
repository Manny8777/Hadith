'use client'

import { useEffect } from 'react'
import { useNumeral } from '@/lib/numeralContext'

const ARABIC = '٠١٢٣٤٥٦٧٨٩'
const WESTERN_RE = /[0-9]/
const ARABIC_RE = /[٠-٩]/

function convert(text: string, pref: 'western' | 'arabic'): string {
  if (pref === 'arabic') return text.replace(/[0-9]/g, d => ARABIC[Number(d)])
  return text.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
}

// Don't touch digits inside these — they're code, inputs, or intentionally fixed.
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'PRE', 'NOSCRIPT', 'KBD', 'SAMP'])

function isSkipped(node: Node): boolean {
  let el = node.parentElement
  while (el) {
    if (SKIP_TAGS.has(el.tagName)) return true
    if (el.hasAttribute('data-no-convert')) return true
    el = el.parentElement
  }
  return false
}

function convertTextNode(node: Text, pref: 'western' | 'arabic') {
  const v = node.nodeValue
  if (!v) return
  // Fast path: nothing of the source style to convert
  if (pref === 'arabic' ? !WESTERN_RE.test(v) : !ARABIC_RE.test(v)) return
  if (isSkipped(node)) return
  const next = convert(v, pref)
  if (next !== v) node.nodeValue = next
}

function convertTree(root: Node, pref: 'western' | 'arabic') {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  let n = walker.nextNode()
  while (n) {
    nodes.push(n as Text)
    n = walker.nextNode()
  }
  for (const t of nodes) convertTextNode(t, pref)
}

/**
 * Globally renders all visible digits in the chosen style (Latin vs Arabic-Indic)
 * by normalizing text nodes after render, and keeps newly-rendered/async content in
 * sync via a MutationObserver. Inputs, code and [data-no-convert] subtrees are left alone.
 */
export default function NumeralConverter() {
  const { pref } = useNumeral()

  useEffect(() => {
    convertTree(document.body, pref)

    const observer = new MutationObserver(mutations => {
      // Pause observation while we write so our own edits don't re-trigger us.
      observer.disconnect()
      for (const m of mutations) {
        if (m.type === 'characterData' && m.target.nodeType === Node.TEXT_NODE) {
          convertTextNode(m.target as Text, pref)
        } else if (m.type === 'childList') {
          m.addedNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) convertTextNode(node as Text, pref)
            else if (node.nodeType === Node.ELEMENT_NODE) convertTree(node, pref)
          })
        }
      }
      observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    })

    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [pref])

  return null
}
