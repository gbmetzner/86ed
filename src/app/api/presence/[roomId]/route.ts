import { NextRequest, NextResponse } from 'next/server'
import { getPresence } from '@/lib/rooms'

export async function GET(
  _req: NextRequest,
  { params }: { params: { roomId: string } },
) {
  const handles = await getPresence(params.roomId)
  return NextResponse.json({ handles })
}
