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
  const [typingHandles, setTypingHandles] = useState<string[]>([])

  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const onSseMessage = useRef<((e: MessageEvent) => void) | null>(null)
  const handleRef = useRef<string | null>(null)
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

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
    handleRef.current = h

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

  // Own the single EventSource and route events to consumers
  useEffect(() => {
    if (!sessionId) return

    const timers = typingTimers.current
    const es = new EventSource(`/api/stream/${roomId}?sessionId=${sessionId}`)

    es.onmessage = (e: MessageEvent) => {
      try {
        const event = JSON.parse(e.data)
        if (event.type === 'message' || !event.type) {
          onSseMessage.current?.(e)
        } else if (event.type === 'typing') {
          const typingHandle = event.handle as string
          if (typingHandle === handleRef.current) return

          setTypingHandles(prev => {
            if (prev.includes(typingHandle)) return prev
            return [...prev, typingHandle]
          })

          // Cancel any existing timer for this handle and set a new one
          const existing = timers.get(typingHandle)
          if (existing) clearTimeout(existing)
          const timer = setTimeout(() => {
            setTypingHandles(prev => prev.filter(h => h !== typingHandle))
            timers.delete(typingHandle)
          }, 4_000)
          timers.set(typingHandle, timer)
        }
      } catch {
        // malformed event — ignore
      }
    }

    es.onerror = () => {
      // SSE auto-reconnects
    }

    return () => {
      es.close()
      timers.forEach(t => clearTimeout(t))
      timers.clear()
    }
  }, [roomId, sessionId])

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
          onSseEvent={onSseMessage}
        />

        <TypingIndicator handles={typingHandles} />

        <MessageInput roomId={roomId} sessionId={sessionId} handle={handle} />

      </div>
    </div>
  )
}
