'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import PresenceBar from '@/components/PresenceBar'
import MessageList from '@/components/MessageList'
import MessageInput from '@/components/MessageInput'
import TypingIndicator from '@/components/TypingIndicator'

export default function SnugPage() {
  const { id: roomId } = useParams<{ id: string }>()
  const router = useRouter()

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [handle, setHandle] = useState<string | null>(null)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [copied, setCopied] = useState(false)
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

    heartbeatRef.current = setInterval(() => {
      fetch('/api/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, sessionId: sid, handle: h }),
      }).catch(() => {})
    }, 20_000)

    function onUnload() {
      navigator.sendBeacon('/api/leave', JSON.stringify({ roomId, sessionId: sid }))
    }
    window.addEventListener('beforeunload', onUnload)

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [roomId, router])

  function copyRoomLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2_000)
    }).catch(() => {})
  }

  if (!sessionId || !handle) {
    return (
      <div className="h-screen flex items-center justify-center text-dim text-xs">
        redirecting...
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col items-center">
      {/* Centered column — comfortable on 4K/ultrawide screens */}
      <div className="w-full max-w-3xl flex flex-col h-full min-h-0">

        <header className="px-4 py-3 border-b border-amber-pub/10 flex items-center justify-between shrink-0">
          <span className="text-amber-pub text-xs tracking-widest uppercase">86ed</span>
          <div className="flex items-center gap-4">
            {/* Copy room link */}
            <button
              onClick={copyRoomLink}
              className="text-dim text-xs opacity-50 hover:opacity-90 transition-opacity"
              title="copy room link"
            >
              {copied ? 'copied!' : roomId.slice(0, 8)}
            </button>

            {/* Sound toggle */}
            <button
              onClick={() => setSoundEnabled(p => !p)}
              className="text-dim text-xs opacity-40 hover:opacity-80 transition-opacity"
              title={soundEnabled ? 'mute sounds' : 'unmute sounds'}
            >
              {soundEnabled ? '🔔' : '🔕'}
            </button>
          </div>
        </header>

        <PresenceBar roomId={roomId} currentHandle={handle} />

        <MessageList
          roomId={roomId}
          sessionId={sessionId}
          handle={handle}
          soundEnabled={soundEnabled}
        />

        <TypingIndicator roomId={roomId} sessionId={sessionId} />

        <MessageInput roomId={roomId} sessionId={sessionId} handle={handle} />

      </div>
    </div>
  )
}
