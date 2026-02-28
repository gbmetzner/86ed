'use client'

import { useState, KeyboardEvent } from 'react'

interface Props {
  roomId: string
  sessionId: string
  handle: string
}

export default function MessageInput({ roomId, sessionId, handle }: Props) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

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

  return (
    <div className="border-t border-amber-pub/20 px-4 py-3">
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="say something..."
        rows={2}
        disabled={sending}
        className="
          w-full bg-transparent text-warm text-sm resize-none outline-none
          placeholder:text-dim/50 disabled:opacity-50 leading-relaxed
        "
      />
    </div>
  )
}
