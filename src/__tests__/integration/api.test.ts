import Redis from 'ioredis'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as POST_join } from '@/app/api/join/route'
import { POST as POST_messages } from '@/app/api/messages/[roomId]/route'
import { POST as POST_heartbeat } from '@/app/api/heartbeat/route'
import { POST as POST_leave } from '@/app/api/leave/route'
import { GET as GET_presence } from '@/app/api/presence/[roomId]/route'
import { membersKey, messagesKey } from '@/lib/rooms'

// ---------------------------------------------------------------------------
// Use local Redis when REDIS_URL is set (Docker), otherwise skip
// ---------------------------------------------------------------------------

const REDIS_URL = process.env.REDIS_URL
const canTest = !!REDIS_URL

const redis = canTest ? new Redis(REDIS_URL!) : null

beforeEach(async () => {
  await redis?.flushdb()
})

afterAll(async () => {
  await redis?.flushdb()
  await redis?.quit()
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

describe.skipIf(!canTest)('POST /api/join', () => {
  it('returns 400 when handle is missing', async () => {
    const res = await POST_join(post('http://localhost/api/join', {}))
    expect(res.status).toBe(400)
  })

  it('returns 400 when handle is whitespace-only', async () => {
    const res = await POST_join(post('http://localhost/api/join', { handle: '   ' }))
    expect(res.status).toBe(400)
  })

  it('returns 200 with roomId, sessionId, and colorIndex on valid handle', async () => {
    const res = await POST_join(post('http://localhost/api/join', { handle: 'alice' }))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(typeof body.roomId).toBe('string')
    expect(typeof body.sessionId).toBe('string')
    expect(typeof body.colorIndex).toBe('number')
    expect(body.colorIndex).toBe(0)
  })

  it('registers presence in the members hash after joining', async () => {
    const res = await POST_join(post('http://localhost/api/join', { handle: 'alice' }))
    const { roomId, sessionId } = await res.json()

    const raw = await redis!.hget(membersKey(roomId), sessionId)
    expect(raw).toMatch(/^alice:0:\d+$/)
  })

  it('assigns unique color slots to consecutive joiners', async () => {
    const res1 = await POST_join(post('http://localhost/api/join', { handle: 'alice' }))
    const { colorIndex: ci1 } = await res1.json()

    const res2 = await POST_join(post('http://localhost/api/join', { handle: 'bob' }))
    const { colorIndex: ci2 } = await res2.json()

    expect(ci1).not.toBe(ci2)
  })
})

// ---------------------------------------------------------------------------
// POST /api/messages/[roomId]
// ---------------------------------------------------------------------------

describe.skipIf(!canTest)('POST /api/messages/[roomId]', () => {
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

describe.skipIf(!canTest)('POST /api/heartbeat', () => {
  it('returns 400 when fields are missing', async () => {
    const res = await POST_heartbeat(
      post('http://localhost/api/heartbeat', { roomId: 'r1' }),
    )
    expect(res.status).toBe(400)
  })

  it('returns 200 and refreshes the member expiresAt', async () => {
    // First join to set up the hash
    const joinRes = await POST_join(post('http://localhost/api/join', { handle: 'alice' }))
    const { roomId, sessionId } = await joinRes.json()

    // Get current expiresAt
    const before = await redis!.hget(membersKey(roomId), sessionId)
    const beforeExpiry = parseInt(before!.split(':').pop()!, 10)

    await new Promise(r => setTimeout(r, 10)) // small delay

    const res = await POST_heartbeat(
      post('http://localhost/api/heartbeat', { roomId, sessionId, handle: 'alice', colorIndex: 0 }),
    )
    expect(res.status).toBe(200)

    // expiresAt should be updated to a later time
    const after = await redis!.hget(membersKey(roomId), sessionId)
    const afterExpiry = parseInt(after!.split(':').pop()!, 10)
    expect(afterExpiry).toBeGreaterThanOrEqual(beforeExpiry)
  })

  it('refreshes the hash-level TTL', async () => {
    const joinRes = await POST_join(post('http://localhost/api/join', { handle: 'alice' }))
    const { roomId, sessionId } = await joinRes.json()

    await POST_heartbeat(
      post('http://localhost/api/heartbeat', { roomId, sessionId, handle: 'alice', colorIndex: 0 }),
    )

    const ttl = await redis!.ttl(membersKey(roomId))
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(90)
  })
})

// ---------------------------------------------------------------------------
// POST /api/leave
// ---------------------------------------------------------------------------

describe.skipIf(!canTest)('POST /api/leave', () => {
  it('returns 400 when fields are missing', async () => {
    const res = await POST_leave(
      post('http://localhost/api/leave', { roomId: 'r1' }),
    )
    expect(res.status).toBe(400)
  })

  it('returns 200 and removes the member from the hash', async () => {
    const joinRes = await POST_join(post('http://localhost/api/join', { handle: 'alice' }))
    const { roomId, sessionId } = await joinRes.json()

    const res = await POST_leave(
      post('http://localhost/api/leave', { roomId, sessionId }),
    )
    expect(res.status).toBe(200)

    const raw = await redis!.hget(membersKey(roomId), sessionId)
    expect(raw).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// GET /api/presence/[roomId]
// ---------------------------------------------------------------------------

describe.skipIf(!canTest)('GET /api/presence/[roomId]', () => {
  it('returns an empty handles array for a room with no users', async () => {
    const res = await GET_presence(
      get('http://localhost/api/presence/empty-room'),
      { params: { roomId: 'empty-room' } },
    )
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.handles).toEqual([])
  })

  it('returns the presence entries with handle and colorIndex', async () => {
    const join1 = await POST_join(post('http://localhost/api/join', { handle: 'alice' }))
    const { roomId } = await join1.json()
    await POST_join(post('http://localhost/api/join', { handle: 'bob' }))

    const res = await GET_presence(
      get(`http://localhost/api/presence/${roomId}`),
      { params: { roomId } },
    )
    const body = await res.json()

    expect(body.handles).toHaveLength(2)
    const handles = body.handles.map((e: { handle: string }) => e.handle)
    expect(handles).toContain('alice')
    expect(handles).toContain('bob')

    // Each entry has a colorIndex
    body.handles.forEach((entry: { handle: string; colorIndex: number }) => {
      expect(typeof entry.colorIndex).toBe('number')
    })
  })
})
