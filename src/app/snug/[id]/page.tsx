'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import PresenceBar from '@/components/PresenceBar'
import MessageList from '@/components/MessageList'
import MessageInput from '@/components/MessageInput'

export default function SnugPage() {
  const { id: roomId } = useParams<{ id: string }>()
  const router = useRouter()

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [handle, setHandle] = useState<string | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const sid = sessionStorage.getItem('sessionId')
    const h = sessionStorage.getItem('handle')
    const storedRoom = sessionStorage.getItem('roomId')

    if (!sid || !h || storedRoom !== roomId) {
      router.replace('/')
      return
    }

    setSessionId(sid)
    setHandle(h)

    // Heartbeat every 20s
    heartbeatRef.current = setInterval(() => {
      fetch('/api/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, sessionId: sid, handle: h }),
      }).catch(() => {})
    }, 20_000)

    // Leave on tab close
    function onUnload() {
      navigator.sendBeacon(
        '/api/leave',
        JSON.stringify({ roomId, sessionId: sid }),
      )
    }
    window.addEventListener('beforeunload', onUnload)

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [roomId, router])

  if (!sessionId || !handle) {
    return (
      <div className="h-screen flex items-center justify-center text-dim text-xs">
        redirecting...
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col">
      <header className="px-4 py-3 border-b border-amber-pub/10 flex items-center justify-between">
        <span className="text-amber-pub text-xs tracking-widest uppercase">86ed</span>
        <span className="text-dim text-xs opacity-50 truncate max-w-[180px]">{roomId.slice(0, 8)}</span>
      </header>

      <PresenceBar roomId={roomId} />

      <MessageList roomId={roomId} sessionId={sessionId} handle={handle} />

      <MessageInput roomId={roomId} sessionId={sessionId} handle={handle} />
    </div>
  )
}
