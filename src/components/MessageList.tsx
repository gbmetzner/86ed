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
  handle: string
}

export default function MessageList({ roomId, sessionId, handle }: Props) {
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
    <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-1">
      {messages.map((msg, i) => {
        const isMine = msg.handle === handle
        const prevSender = i > 0 ? messages[i - 1].handle : null
        const isNewSender = msg.handle !== prevSender
        const nextSender = i < messages.length - 1 ? messages[i + 1].handle : null
        const isLastInGroup = msg.handle !== nextSender

        return (
          <div
            key={msg.id}
            className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} ${isNewSender && i > 0 ? 'mt-3' : ''}`}
          >
            {!isMine && isNewSender && (
              <span className="text-dim text-xs mb-1 px-1 opacity-70">{msg.handle}</span>
            )}
            <div
              className={`
                max-w-[72%] px-3 py-2 text-sm leading-relaxed break-words
                ${isMine
                  ? 'bg-amber-pub/15 border border-amber-pub/25 text-warm'
                  : 'bg-warm/5 border border-warm/10 text-warm'
                }
                ${isNewSender && isLastInGroup ? 'rounded-lg' : ''}
                ${isNewSender && !isLastInGroup ? (isMine ? 'rounded-lg rounded-br-sm' : 'rounded-lg rounded-bl-sm') : ''}
                ${!isNewSender && !isLastInGroup ? (isMine ? 'rounded-sm rounded-r-lg' : 'rounded-sm rounded-l-lg') : ''}
                ${!isNewSender && isLastInGroup ? (isMine ? 'rounded-sm rounded-lg rounded-tr-sm' : 'rounded-sm rounded-lg rounded-tl-sm') : ''}
              `}
            >
              {msg.text}
            </div>
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
