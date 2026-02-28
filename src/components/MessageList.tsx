'use client'

import { useEffect, useRef, useState } from 'react'

interface Message {
  id: string
  handle: string
  text: string
}

interface Props {
  roomId: string
  sessionId: string
}

export default function MessageList({ roomId, sessionId }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const es = new EventSource(`/api/stream/${roomId}?sessionId=${sessionId}`)

    es.onmessage = (e) => {
      const msg: Message = JSON.parse(e.data)
      setMessages(prev => [...prev, msg])
    }

    es.onerror = () => {
      // SSE will auto-reconnect; nothing to do
    }

    return () => es.close()
  }, [roomId, sessionId])

  useEffect(() => {
    const FIVE_MIN_MS = 5 * 60 * 1000
    const timer = setInterval(() => {
      const cutoff = Date.now() - FIVE_MIN_MS
      setMessages(prev => prev.filter(msg => parseInt(msg.id.split('-')[0], 10) > cutoff))
    }, 30_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-dim text-xs opacity-40">
        nothing yet — be first
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
      {messages.map(msg => (
        <div key={msg.id} className="flex flex-col gap-0.5">
          <span className="text-amber-pub text-xs font-medium">{msg.handle}</span>
          <span className="text-warm text-sm leading-relaxed">{msg.text}</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
