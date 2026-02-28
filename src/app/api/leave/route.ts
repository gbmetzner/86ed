import { NextRequest, NextResponse } from 'next/server'
import redis from '@/lib/redis'
import { presenceKey } from '@/lib/rooms'

export async function POST(req: NextRequest) {
  const { roomId, sessionId } = await req.json()

  if (!roomId || !sessionId) {
    return NextResponse.json({ error: 'roomId and sessionId required' }, { status: 400 })
  }

  await redis.del(presenceKey(roomId, sessionId))
  return new NextResponse(null, { status: 200 })
}
