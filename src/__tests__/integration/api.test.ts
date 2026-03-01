import { Redis } from '@upstash/redis'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as POST_join } from '@/app/api/join/route'
import { POST as POST_messages } from '@/app/api/messages/[roomId]/route'
import { POST as POST_heartbeat } from '@/app/api/heartbeat/route'
import { POST as POST_leave } from '@/app/api/leave/route'
import { GET as GET_presence } from '@/app/api/presence/[roomId]/route'
import { presenceKey, messagesKey } from '@/lib/rooms'

// ---------------------------------------------------------------------------
// Skip the entire suite when Upstash credentials are not configured.
// ---------------------------------------------------------------------------

const hasUpstash = !!(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
)

const redis = hasUpstash
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null

beforeEach(async () => {
  await redis?.flushdb()
})

afterAll(async () => {
  await redis?.flushdb()
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function post(url: string, body: object): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function get(url: string): NextRequest {
  return new NextRequest(url)
}

// ---------------------------------------------------------------------------
// POST /api/join
// ---------------------------------------------------------------------------

describe.skipIf(!hasUpstash)('POST /api/join', () => {
  it('returns 400 when handle is missing', async () => {
    const res = await POST_join(post('http://localhost/api/join', {}))
    expect(res.status).toBe(400)
  })

  it('returns 400 when handle is whitespace-only', async () => {
    const res = await POST_join(post('http://localhost/api/join', { handle: '   ' }))
    expect(res.status).toBe(400)
  })

  it('returns 200 with roomId and sessionId on valid handle', async () => {
    const res = await POST_join(post('http://localhost/api/join', { handle: 'alice' }))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(typeof body.roomId).toBe('string')
    expect(typeof body.sessionId).toBe('string')
    expect(body.roomId.length).toBeGreaterThan(0)
    expect(body.sessionId.length).toBeGreaterThan(0)
  })

  it('registers presence in Redis after joining', async () => {
    const res = await POST_join(post('http://localhost/api/join', { handle: 'alice' }))
    const { roomId, sessionId } = await res.json()

    const handle = await redis!.get(presenceKey(roomId, sessionId))
    expect(handle).toBe('alice')
  })
})

// ---------------------------------------------------------------------------
// POST /api/messages/[roomId]
// ---------------------------------------------------------------------------

describe.skipIf(!hasUpstash)('POST /api/messages/[roomId]', () => {
  let roomId: string
  let sessionId: string

  beforeEach(async () => {
    const res = await POST_join(post('http://localhost/api/join', { handle: 'alice' }))
    ;({ roomId, sessionId } = await res.json())
  })

  it('returns 400 when required fields are missing', async () => {
    const res = await POST_messages(
      post(`http://localhost/api/messages/${roomId}`, { handle: 'alice', text: 'hi' }),
      { params: { roomId } },
    )
    expect(res.status).toBe(400)
  })

  it('returns 403 when the session is not in the room', async () => {
    const res = await POST_messages(
      post(`http://localhost/api/messages/${roomId}`, {
        handle: 'alice',
        text: 'hi',
        sessionId: 'ghost-session',
      }),
      { params: { roomId } },
    )
    expect(res.status).toBe(403)
  })

  it('returns 200 with a stream entry id on valid message', async () => {
    const res = await POST_messages(
      post(`http://localhost/api/messages/${roomId}`, {
        handle: 'alice',
        text: 'hello',
        sessionId,
      }),
      { params: { roomId } },
    )
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(typeof body.id).toBe('string')
  })

  it('stores the message in the Redis stream', async () => {
    await POST_messages(
      post(`http://localhost/api/messages/${roomId}`, {
        handle: 'alice',
        text: 'stored message',
        sessionId,
      }),
      { params: { roomId } },
    )

    const len = await redis!.xlen(messagesKey(roomId))
    expect(len).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// POST /api/heartbeat
// ---------------------------------------------------------------------------

describe.skipIf(!hasUpstash)('POST /api/heartbeat', () => {
  it('returns 400 when fields are missing', async () => {
    const res = await POST_heartbeat(
      post('http://localhost/api/heartbeat', { roomId: 'r1' }),
    )
    expect(res.status).toBe(400)
  })

  it('returns 200 and refreshes the presence TTL', async () => {
    const roomId = 'hb-room'
    const sessionId = 'hb-sess'
    await redis!.set(presenceKey(roomId, sessionId), 'alice', { ex: 5 })

    const res = await POST_heartbeat(
      post('http://localhost/api/heartbeat', { roomId, sessionId, handle: 'alice' }),
    )
    expect(res.status).toBe(200)

    const ttl = await redis!.ttl(presenceKey(roomId, sessionId))
    expect(ttl).toBeGreaterThan(5)
  })
})

// ---------------------------------------------------------------------------
// POST /api/leave
// ---------------------------------------------------------------------------

describe.skipIf(!hasUpstash)('POST /api/leave', () => {
  it('returns 400 when fields are missing', async () => {
    const res = await POST_leave(
      post('http://localhost/api/leave', { roomId: 'r1' }),
    )
    expect(res.status).toBe(400)
  })

  it('returns 200 and removes the presence key', async () => {
    const roomId = 'leave-room'
    const sessionId = 'leave-sess'
    await redis!.set(presenceKey(roomId, sessionId), 'alice', { ex: 30 })

    const res = await POST_leave(
      post('http://localhost/api/leave', { roomId, sessionId }),
    )
    expect(res.status).toBe(200)

    const exists = await redis!.exists(presenceKey(roomId, sessionId))
    expect(exists).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// GET /api/presence/[roomId]
// ---------------------------------------------------------------------------

describe.skipIf(!hasUpstash)('GET /api/presence/[roomId]', () => {
  it('returns an empty handles array for a room with no users', async () => {
    const res = await GET_presence(
      get('http://localhost/api/presence/empty-room'),
      { params: { roomId: 'empty-room' } },
    )
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.handles).toEqual([])
  })

  it('returns the handles of all users in the room', async () => {
    const roomId = 'presence-room'
    await redis!.set(presenceKey(roomId, 'sess-1'), 'alice', { ex: 30 })
    await redis!.set(presenceKey(roomId, 'sess-2'), 'bob', { ex: 30 })

    const res = await GET_presence(
      get(`http://localhost/api/presence/${roomId}`),
      { params: { roomId } },
    )
    const body = await res.json()

    expect(body.handles).toHaveLength(2)
    expect(body.handles).toContain('alice')
    expect(body.handles).toContain('bob')
  })
})
