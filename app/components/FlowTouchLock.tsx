'use client'

import { useEffect, useState } from 'react'

// On touch screens a React Flow canvas takes every one-finger drag, so the page stops scrolling
// once the reader's finger reaches the diagram. Keep the diagram still on touch screens until the
// reader taps "تحريك المخطط"; the zoom buttons and node taps keep working while it is locked.
export function useFlowTouchLock() {
  const [touch, setTouch] = useState(false)
  const [unlocked, setUnlocked] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)')
    const update = () => setTouch(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  const locked = touch && !unlocked
  // Spread onto <ReactFlow>. Unlocked (or on desktop), React Flow keeps its own defaults.
  const flowProps = locked
    ? { panOnDrag: false, zoomOnPinch: false, zoomOnScroll: false, zoomOnDoubleClick: false, preventScrolling: false, nodesDraggable: false }
    : {}

  return { touch, locked, flowProps, toggle: () => setUnlocked(u => !u) }
}

// Place inside a `relative` container that wraps the <ReactFlow>.
export function FlowTouchToggle({ touch, locked, toggle }: { touch: boolean; locked: boolean; toggle: () => void }) {
  if (!touch) return null
  return (
    <button
      type="button"
      onClick={toggle}
      className={`absolute top-2 left-2 z-10 rounded-full border px-3 py-1.5 text-xs font-sans shadow-sm ${
        locked
          ? 'bg-surface border-border text-gray-700'
          : 'bg-green-700 border-green-800 text-white'
      }`}
    >
      {locked ? '✋ تحريك المخطط' : '✓ إيقاف التحريك'}
    </button>
  )
}
