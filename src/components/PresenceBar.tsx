'use client'

import { useEffect, useState } from 'react'
import { handleColor } from '@/lib/handle-color'

interface Props {
  roomId: string
  currentHandle: string
}

export default function PresenceBar({ roomId, currentHandle }: Props) {
  const [handles, setHandles] = useState<string[]>([])

  useEffect(() => {
    let active = true

    async function fetchPresence() {
      try {
        const res = await fetch(`/api/presence/${roomId}`)
        if (!res.ok) return
        const { handles } = await res.json()
        if (active) setHandles(handles)
      } catch {
        // silent
      }
    }

    fetchPresence()
    const interval = setInterval(fetchPresence, 10_000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [roomId])

  if (handles.length === 0) return null

  return (
    <div className="flex gap-3 flex-wrap px-4 py-2 border-b border-amber-pub/10 text-xs">
      {handles.map(h => (
        <span
          key={h}
          className="font-medium"
          style={{
            color: h === currentHandle ? 'rgb(200 146 42 / 0.9)' : handleColor(h),
            opacity: h === currentHandle ? 1 : 0.75,
          }}
        >
          {h === currentHandle ? `${h} (you)` : h}
        </span>
      ))}
    </div>
  )
}
