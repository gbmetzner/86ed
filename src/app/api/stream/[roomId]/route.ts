import { NextRequest } from 'next/server'
import redis from '@/lib/redis'
import { messagesKey } from '@/lib/rooms'

export const dynamic = 'force-dynamic'

const FIVE_MIN_MS = 5 * 60 * 1000
const POLL_INTERVAL_MS = 500
const PING_INTERVAL_MS = 15_000

export async function GET(
  req: NextRequest,
  { params }: { params: { roomId: string } },
) {
  const { roomId } = params
  const streamKey = messagesKey(roomId)

  const encoder = new TextEncoder()
  let lastId = '0'
  let pingTimer: ReturnType<typeof setTimeout> | null = null
  let pollTimer: ReturnType<typeof setTimeout> | null = null
  let closed = false

  const stream = new ReadableStream({
    start(controller) {
      function cleanup() {
        closed = true
        if (pingTimer) clearTimeout(pingTimer)
        if (pollTimer) clearTimeout(pollTimer)
      }

      async function poll() {
        if (closed) return
        try {
          // XREAD returns null when no new entries
          // Result shape: [[streamName, [[msgId, [f1, v1, f2, v2, ...]], ...]], ...] | null
          const results = await redis.xread(streamKey, lastId, { count: 20 }) as
            [string, [string, string[]][]][] | null

          if (results && results.length > 0) {
            const [, entries] = results[0]
            const now = Date.now()

            for (const [entryId, fields] of entries) {
              lastId = entryId
              const entryTs = parseInt(entryId.split('-')[0], 10)
              if (now - entryTs > FIVE_MIN_MS) continue

              const obj: Record<string, string> = {}
              for (let i = 0; i < fields.length; i += 2) {
                obj[fields[i]] = fields[i + 1]
              }
              const data = JSON.stringify({ id: entryId, ...obj })
              controller.enqueue(encoder.encode(`data: ${data}\n\n`))
            }
          }
        } catch {
          cleanup()
          controller.close()
          return
        }

        if (!closed) {
          pollTimer = setTimeout(poll, POLL_INTERVAL_MS)
        }
      }

      function schedulePing() {
        if (closed) return
        controller.enqueue(encoder.encode(': ping\n\n'))
        pingTimer = setTimeout(schedulePing, PING_INTERVAL_MS)
      }

      poll()
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
