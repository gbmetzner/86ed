import { NextRequest, NextResponse } from 'next/server'
import redis from '@/lib/redis'
import { messagesKey, presenceKey } from '@/lib/rooms'

export async function POST(
  req: NextRequest,
  { params }: { params: { roomId: string } },
) {
  const { roomId } = params
  const { handle, text, sessionId } = await req.json()

  if (!handle || !text || !sessionId) {
    return NextResponse.json({ error: 'handle, text, and sessionId required' }, { status: 400 })
  }

  // Verify the sender is present
  const isPresent = await redis.exists(presenceKey(roomId, sessionId))
  if (!isPresent) {
    return NextResponse.json({ error: 'not in room' }, { status: 403 })
  }

  const id = await redis.xadd(
    messagesKey(roomId),
    '*',
    { handle, text },
    { maxlen: { count: 200, approximate: true } },
  )

  return NextResponse.json({ id })
}
