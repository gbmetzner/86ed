import { NextRequest, NextResponse } from 'next/server'
import redis from '@/lib/redis'
import { membersKey, publishPresence } from '@/lib/rooms'

export async function POST(req: NextRequest) {
  const { roomId, sessionId } = await req.json()

  if (!roomId || !sessionId) {
    return NextResponse.json({ error: 'roomId and sessionId required' }, { status: 400 })
  }

  await redis.hdel(membersKey(roomId), sessionId)

  // Push updated presence — fire-and-forget, don't block the beacon response
  publishPresence(roomId).catch(() => {})

  return new NextResponse(null, { status: 200 })
}
