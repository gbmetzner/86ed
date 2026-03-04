import { NextRequest } from 'next/server'
import redis from '@/lib/redis'
import { messagesKey } from '@/lib/rooms'
import { createSubscriber } from '@/lib/redis-local'

export const dynamic = 'force-dynamic'

const FIVE_MIN_MS = 5 * 60 * 1000
const PING_INTERVAL_MS = 15_000

function streamIdGt(a: string, b: string): boolean {
  const [aMs, aSeq] = a.split('-').map(Number)
  const [bMs, bSeq] = b.split('-').map(Number)
  return aMs > bMs || (aMs === bMs && aSeq > bSeq)
}

export async function GET(
  req: NextRequest,
  { params }: { params: { roomId: string } },
) {
  const { roomId } = params
  const streamKey = messagesKey(roomId)
  const encoder = new TextEncoder()
  const sub = createSubscriber()
  const channel = `room:${roomId}:events`
  let lastId = '0'
  let closed = false
  let pingTimer: ReturnType<typeof setTimeout> | null = null

  const stream = new ReadableStream({
    async start(controller) {
      function cleanup() {
        closed = true
        if (pingTimer) clearTimeout(pingTimer)
        sub.unsubscribe(channel).catch(() => {})
        sub.quit().catch(() => {})
      }

      // Subscribe FIRST to avoid race between history and new events
      await sub.subscribe(channel)

      // One-time XREAD to replay recent history
      const history = await redis.xread(streamKey, '0', { count: 200 }) as
        [string, [string, string[]][]][] | null

      if (history && history.length > 0) {
        const [, entries] = history[0]
        const now = Date.now()
        for (const [entryId, fields] of entries) {
          lastId = entryId
          const entryTs = parseInt(entryId.split('-')[0], 10)
          if (now - entryTs > FIVE_MIN_MS) continue

          const obj: Record<string, string> = {}
          for (let i = 0; i < fields.length; i += 2) {
            obj[fields[i]] = fields[i + 1]
          }
          const data = JSON.stringify({ type: 'message', id: entryId, ...obj })
          controller.enqueue(encoder.encode(`data: ${data}\n\n`))
        }
      }

      // Forward Pub/Sub events
      sub.on('message', (ch: string, raw: string) => {
        if (closed) return
        try {
          const event = JSON.parse(raw)
          if (event.type === 'message') {
            // Dedup: skip if this message was already sent from history
            if (lastId !== '0' && !streamIdGt(event.id, lastId)) return
            lastId = event.id
          }
          controller.enqueue(encoder.encode(`data: ${raw}\n\n`))
        } catch {
          // malformed event — ignore
        }
      })

      function schedulePing() {
        if (closed) return
        controller.enqueue(encoder.encode(': ping\n\n'))
        pingTimer = setTimeout(schedulePing, PING_INTERVAL_MS)
      }
      pingTimer = setTimeout(schedulePing, PING_INTERVAL_MS)

      req.signal.addEventListener('abort', () => {
        cleanup()
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
