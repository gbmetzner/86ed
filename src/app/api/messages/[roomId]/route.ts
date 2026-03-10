import { NextRequest, NextResponse } from 'next/server'
import redis from '@/lib/redis'
import { messagesKey, membersKey } from '@/lib/rooms'

export async function POST(
  req: NextRequest,
  { params }: { params: { roomId: string } },
) {
  const { roomId } = params
  const { handle, text, sessionId } = await req.json()

  if (!handle || !text || !sessionId) {
    return NextResponse.json({ error: 'handle, text, and sessionId required' }, { status: 400 })
  }

  // Verify presence and get colorIndex from hash field
  const raw = await redis.hget(membersKey(roomId), sessionId)
  if (!raw) {
    return NextResponse.json({ error: 'not in room' }, { status: 403 })
  }

  // Parse "handle:colorIndex:expiresAt"
  const lastColon = raw.lastIndexOf(':')
  const rest = raw.slice(0, lastColon)
  const colorIndex = parseInt(rest.slice(rest.lastIndexOf(':') + 1), 10)

  const id = await redis.xadd(
    messagesKey(roomId),
    '*',
    { handle, text },
    { trim: { type: 'MAXLEN', comparison: '~', threshold: 200 } },
  )

  if (id) {
    await redis.publish(
      `room:${roomId}:events`,
      JSON.stringify({ type: 'message', id, handle, text, colorIndex }),
    )
  }

  return NextResponse.json({ id })
}
