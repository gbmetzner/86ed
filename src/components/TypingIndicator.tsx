'use client'

import { useEffect, useState } from 'react'

interface Props {
  roomId: string
  sessionId: string
}

export default function TypingIndicator({ roomId, sessionId }: Props) {
  const [typing, setTyping] = useState<string[]>([])

  useEffect(() => {
    let active = true

    async function poll() {
      try {
        const res = await fetch(`/api/typing/${roomId}?sessionId=${sessionId}`)
        if (res.ok && active) {
          const { handles } = await res.json()
          setTyping(handles)
        }
      } catch {
        // silent
      }
    }

    poll()
    const interval = setInterval(poll, 2_000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [roomId, sessionId])

  if (typing.length === 0) return null

  const names = typing.slice(0, 3) // cap display at 3 names
  const label =
    names.length === 1
      ? `${names[0]} is typing`
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} are typing`

  return (
    <div className="px-4 py-1 text-xs text-dim opacity-50 italic select-none">
      {label}…
    </div>
  )
}
