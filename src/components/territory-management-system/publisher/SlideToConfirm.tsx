'use client'

import { useRef, useState } from 'react'
import { ChevronsRight, RefreshCw } from 'lucide-react'

const HANDLE_SIZE = 48 // px — matches h-12/w-12 below

// iPhone-style "slide to confirm" control — a deliberate drag gesture stands in for the tap +
// branded-modal confirmation these two actions (Early Out, Release Assignment) used to require.
// A gesture that takes a full deliberate drag across the track is already hard to trigger by
// accident, so there's no second confirmation step once the slide completes.
export default function SlideToConfirm({
  label,
  draggingLabel = 'Confirm',
  confirmingLabel,
  onConfirm,
  disabled,
  tone = 'primary',
}: {
  label: string
  // Shown mid-drag, replacing the static label — gives feedback that the gesture registered
  // before the handle actually reaches the end.
  draggingLabel?: string
  confirmingLabel: string
  onConfirm: () => void | Promise<void>
  disabled?: boolean
  tone?: 'primary' | 'danger'
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const maxXRef = useRef(0)
  const startXRef = useRef(0)
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const locked = disabled || confirming

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (locked || !trackRef.current) return
    maxXRef.current = trackRef.current.clientWidth - HANDLE_SIZE
    startXRef.current = e.clientX - dragX
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return
    const next = Math.min(Math.max(0, e.clientX - startXRef.current), maxXRef.current)
    setDragX(next)
  }

  async function handlePointerUp() {
    if (!dragging) return
    setDragging(false)
    const threshold = maxXRef.current * 0.85
    if (dragX < threshold || maxXRef.current <= 0) {
      setDragX(0)
      return
    }
    setDragX(maxXRef.current)
    setConfirming(true)
    try {
      await onConfirm()
    } finally {
      setConfirming(false)
      setDragX(0)
    }
  }

  const trackTone =
    tone === 'danger' ? 'border-red-200 bg-gradient-to-r from-red-50 to-rose-50' : 'border-blue-100 bg-gradient-to-r from-blue-50 to-sky-50'
  const handleTone = tone === 'danger' ? 'bg-gradient-to-r from-red-500 to-rose-500' : 'bg-gradient-to-r from-[#2563EB] to-[#38BDF8]'
  const textTone = tone === 'danger' ? 'text-red-600' : 'text-[#2563EB]'

  return (
    <div
      ref={trackRef}
      className={`relative h-16 w-full select-none overflow-hidden rounded-full border ${trackTone} ${disabled ? 'opacity-50' : ''}`}
    >
      <div className={`pointer-events-none absolute inset-0 flex items-center justify-center px-14 text-center text-base font-bold ${textTone}`}>
        {confirming ? confirmingLabel : dragging ? draggingLabel : label}
      </div>
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ transform: `translate(${dragX}px, -50%)`, transition: dragging ? 'none' : 'transform 0.25s ease' }}
        className={`absolute left-1 top-1/2 flex h-12 w-12 items-center justify-center rounded-full text-white shadow-md ${handleTone} ${
          locked ? '' : 'cursor-grab touch-none active:cursor-grabbing'
        }`}
      >
        {confirming ? <RefreshCw className="h-5 w-5 animate-spin" /> : <ChevronsRight className="h-5 w-5" />}
      </div>
    </div>
  )
}
