'use client'

import { useEffect, useRef, useState } from 'react'
import { handleColor } from '@/lib/handle-color'

interface Message {
  id: string
  handle: string
  text: string
}

interface Props {
  roomId: string
  sessionId: string
  handle: string
  soundEnabled: boolean
  onSseEvent: React.MutableRefObject<((e: MessageEvent) => void) | null>
}

const FIVE_MIN_MS = 5 * 60 * 1000
const TWO_MIN_MS = 2 * 60 * 1000

function msgTs(id: string): number {
  return parseInt(id.split('-')[0], 10)
}

function relativeTime(tsMs: number, now: number): string {
  const diff = now - tsMs
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  return `${Math.floor(diff / 3_600_000)}h ago`
}

function expiresIn(tsMs: number, now: number): string | null {
  const remaining = FIVE_MIN_MS - (now - tsMs)
  if (remaining > TWO_MIN_MS || remaining <= 0) return null
  const mins = Math.floor(remaining / 60_000)
  const secs = Math.floor((remaining % 60_000) / 1000)
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
}

function playChime() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15)
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
    osc.start()
    osc.stop(ctx.currentTime + 0.4)
  } catch {
    // AudioContext unavailable
  }
}

export default function MessageList({ roomId, sessionId, handle, soundEnabled, onSseEvent }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [now, setNow] = useState(Date.now())
  const [unread, setUnread] = useState(0)

  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  // Use a ref so the SSE handler always reads the latest soundEnabled
  // without needing to reconnect when the toggle changes
  const soundRef = useRef(soundEnabled)
  useEffect(() => { soundRef.current = soundEnabled }, [soundEnabled])

  // Register SSE event handler via ref (EventSource is owned by the page)
  useEffect(() => {
    onSseEvent.current = (e: MessageEvent) => {
      const event = JSON.parse(e.data)
      const isMsg = !event.type || event.type === 'message'
      if (!isMsg) return
      setMessages(prev => [...prev, { id: event.id, handle: event.handle, text: event.text }])
      if (soundRef.current && event.handle !== handle) {
        playChime()
      }
    }
    return () => { onSseEvent.current = null }
  }, [handle, onSseEvent])

  // Expiry purge every 30 s
  useEffect(() => {
    const timer = setInterval(() => {
      const cutoff = Date.now() - FIVE_MIN_MS
      setMessages(prev => prev.filter(msg => msgTs(msg.id) > cutoff))
    }, 30_000)
    return () => clearInterval(timer)
  }, [])

  // Clock tick every 10 s — drives timestamps and expiry badges
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(timer)
  }, [])

  // Auto-scroll when at bottom; count unread when scrolled away
  useEffect(() => {
    if (messages.length === 0) return
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60
    if (atBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    } else {
      setUnread(prev => prev + 1)
    }
  }, [messages])

  function handleScroll() {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60
    if (atBottom) setUnread(0)
  }

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    setUnread(0)
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-dim text-xs opacity-40">
        nothing yet — be first
      </div>
    )
  }

  return (
    <div className="flex-1 relative">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="absolute inset-0 overflow-y-auto px-4 py-3 flex flex-col gap-1"
      >
        {messages.map((msg, i) => {
          const isMine = msg.handle === handle
          const prevSender = i > 0 ? messages[i - 1].handle : null
          const nextSender = i < messages.length - 1 ? messages[i + 1].handle : null
          const isNewSender = msg.handle !== prevSender
          const isLastInGroup = msg.handle !== nextSender
          const ts = msgTs(msg.id)
          const expiryLabel = expiresIn(ts, now)
          const timeLabel = expiryLabel ? `⏱ ${expiryLabel}` : relativeTime(ts, now)

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} ${isNewSender && i > 0 ? 'mt-3' : 'mt-0.5'}`}
            >
              {!isMine && isNewSender && (
                <span
                  className="text-xs mb-1 px-1 font-medium"
                  style={{ color: handleColor(msg.handle) }}
                >
                  {msg.handle}
                </span>
              )}

              <div
                className={`
                  max-w-[72%] px-3 py-2 text-sm leading-relaxed break-words
                  ${isMine
                    ? 'bg-amber-pub/15 border border-amber-pub/25 text-warm'
                    : 'bg-warm/5 border border-warm/10 text-warm'
                  }
                  ${isNewSender && isLastInGroup
                    ? 'rounded-xl'
                    : isNewSender
                      ? isMine ? 'rounded-xl rounded-br-md' : 'rounded-xl rounded-bl-md'
                      : isLastInGroup
                        ? isMine ? 'rounded-md rounded-xl rounded-tr-md' : 'rounded-md rounded-xl rounded-tl-md'
                        : isMine ? 'rounded-md rounded-r-xl' : 'rounded-md rounded-l-xl'
                  }
                `}
              >
                {msg.text}
              </div>

              {isLastInGroup && (
                <span
                  className={`text-[10px] mt-1 px-1 tabular-nums select-none ${
                    expiryLabel ? 'text-amber-pub/50' : 'text-dim opacity-40'
                  }`}
                >
                  {timeLabel}
                </span>
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {unread > 0 && (
        <button
          onClick={scrollToBottom}
          className="
            absolute bottom-3 left-1/2 -translate-x-1/2
            bg-amber-pub/20 border border-amber-pub/40 text-amber-pub
            text-xs px-3 py-1 rounded-full
            hover:bg-amber-pub/30 transition-colors
          "
        >
          ↓ {unread} new
        </button>
      )}
    </div>
  )
}
