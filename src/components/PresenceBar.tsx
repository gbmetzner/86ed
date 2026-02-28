'use client'

import { useEffect, useState } from 'react'

interface Props {
  roomId: string
}

export default function PresenceBar({ roomId }: Props) {
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
    <div className="flex gap-3 flex-wrap px-4 py-2 border-b border-amber-pub/10 text-xs text-dim">
      {handles.map(h => (
        <span key={h} className="opacity-60">{h}</span>
      ))}
    </div>
  )
}
