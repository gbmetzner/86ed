'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export default function HandleForm() {
  const [handle, setHandle] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = handle.trim()
    if (!trimmed) return

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: trimmed }),
      })

      if (!res.ok) {
        setError('failed to join — try again')
        return
      }

      const { roomId, sessionId } = await res.json()
      sessionStorage.setItem('sessionId', sessionId)
      sessionStorage.setItem('handle', trimmed)
      sessionStorage.setItem('roomId', roomId)
      router.push(`/snug/${roomId}`)
    } catch {
      setError('connection error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-sm">
      <input
        type="text"
        value={handle}
        onChange={e => setHandle(e.target.value)}
        placeholder="your handle"
        maxLength={24}
        disabled={loading}
        autoFocus
        className="
          bg-transparent border-b border-amber-pub text-warm
          placeholder:text-dim text-sm px-0 py-2 outline-none
          focus:border-amber-pub/80 transition-colors
          disabled:opacity-50
        "
      />
      {error && <p className="text-red-400/70 text-xs">{error}</p>}
      <button
        type="submit"
        disabled={loading || !handle.trim()}
        className="
          text-amber-pub text-sm border border-amber-pub/30
          px-4 py-2 hover:border-amber-pub/60 transition-colors
          disabled:opacity-40 disabled:cursor-not-allowed
        "
      >
        {loading ? 'joining...' : 'enter'}
      </button>
    </form>
  )
}
