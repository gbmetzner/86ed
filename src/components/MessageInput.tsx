'use client'

import { useState, KeyboardEvent, useRef } from 'react'

interface Props {
  roomId: string
  sessionId: string
  handle: string
}

const MAX_CHARS = 500

export default function MessageInput({ roomId, sessionId, handle }: Props) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const lastTypingSent = useRef(0)

  function notifyTyping() {
    const now = Date.now()
    if (now - lastTypingSent.current < 2_000) return
    lastTypingSent.current = now
    fetch(`/api/typing/${roomId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, handle }),
    }).catch(() => {})
  }

  async function send() {
    const trimmed = text.trim()
    if (!trimmed || sending) return

    setSending(true)
    setText('')

    try {
      await fetch(`/api/messages/${roomId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle, text: trimmed, sessionId }),
      })
    } catch {
      // silent — ephemeral, not worth retrying
    } finally {
      setSending(false)
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const remaining = MAX_CHARS - text.length
  const charCountColor =
    remaining < 20
      ? 'text-red-400/70'
      : remaining < 80
        ? 'text-amber-pub/60'
        : 'text-dim/30'

  return (
    <div className="border-t border-amber-pub/20 px-4 py-3">
      <textarea
        value={text}
        onChange={e => {
          if (e.target.value.length <= MAX_CHARS) {
            setText(e.target.value)
            notifyTyping()
          }
        }}
        onKeyDown={onKeyDown}
        placeholder="say something..."
        rows={2}
        disabled={sending}
        className="
          w-full bg-transparent text-warm text-sm resize-none outline-none
          placeholder:text-dim/50 disabled:opacity-50 leading-relaxed
        "
      />
      {text.length > 0 && (
        <div className={`text-right text-xs mt-0.5 tabular-nums ${charCountColor}`}>
          {remaining}
        </div>
      )}
    </div>
  )
}
