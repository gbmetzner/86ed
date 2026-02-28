import { GenericContainer, type StartedTestContainer } from 'testcontainers'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import type { Redis } from 'ioredis'

// ---------------------------------------------------------------------------
// Types for dynamically-imported route handlers
// ---------------------------------------------------------------------------
type JoinRoute = typeof import('@/app/api/join/route')
type MessagesRoute = typeof import('@/app/api/messages/[roomId]/route')
type HeartbeatRoute = typeof import('@/app/api/heartbeat/route')
type LeaveRoute = typeof import('@/app/api/leave/route')
type PresenceRoute = typeof import('@/app/api/presence/[roomId]/route')
type RoomsModule = typeof import('@/lib/rooms')

let container: StartedTestContainer
let redisClient: Redis

let POST_join: JoinRoute['POST']
let POST_messages: MessagesRoute['POST']
let POST_heartbeat: HeartbeatRoute['POST']
let POST_leave: LeaveRoute['POST']
let GET_presence: PresenceRoute['GET']
let presenceKey: RoomsModule['presenceKey']
let messagesKey: RoomsModule['messagesKey']

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
// Suite setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  container = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .start()

  const url = `redis://${container.getHost()}:${container.getMappedPort(6379)}`
  process.env.REDIS_URL = url

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any)._redis

  ;({ POST: POST_join } = await import('@/app/api/join/route'))
  ;({ POST: POST_messages } = await import('@/app/api/messages/[roomId]/route'))
  ;({ POST: POST_heartbeat } = await import('@/app/api/heartbeat/route'))
  ;({ POST: POST_leave } = await import('@/app/api/leave/route'))
  ;({ GET: GET_presence } = await import('@/app/api/presence/[roomId]/route'))
  ;({ presenceKey, messagesKey } = await import('@/lib/rooms'))

  const { default: redisModule } = await import('@/lib/redis')
  redisClient = redisModule
})

afterAll(async () => {
  await redisClient?.quit()
  await container?.stop()
})

beforeEach(async () => {
  await redisClient.flushdb()
})

// ---------------------------------------------------------------------------
// POST /api/join
// ---------------------------------------------------------------------------

describe('POST /api/join', () => {
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

    const handle = await redisClient.get(presenceKey(roomId, sessionId))
    expect(handle).toBe('alice')
  })
})

// ---------------------------------------------------------------------------
// POST /api/messages/[roomId]
// ---------------------------------------------------------------------------

describe('POST /api/messages/[roomId]', () => {
  let roomId: string
  let sessionId: string

  beforeEach(async () => {
    // Join a room to get a valid roomId + sessionId with presence
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

    const len = await redisClient.xlen(messagesKey(roomId))
    expect(len).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// POST /api/heartbeat
// ---------------------------------------------------------------------------

describe('POST /api/heartbeat', () => {
  it('returns 400 when fields are missing', async () => {
    const res = await POST_heartbeat(
      post('http://localhost/api/heartbeat', { roomId: 'r1' }),
    )
    expect(res.status).toBe(400)
  })

  it('returns 200 and refreshes the presence TTL', async () => {
    const roomId = 'hb-room'
    const sessionId = 'hb-sess'
    await redisClient.set(presenceKey(roomId, sessionId), 'alice', 'EX', 5)

    const res = await POST_heartbeat(
      post('http://localhost/api/heartbeat', { roomId, sessionId, handle: 'alice' }),
    )
    expect(res.status).toBe(200)

    const ttl = await redisClient.ttl(presenceKey(roomId, sessionId))
    expect(ttl).toBeGreaterThan(5) // refreshed to 30 s
  })
})

// ---------------------------------------------------------------------------
// POST /api/leave
// ---------------------------------------------------------------------------

describe('POST /api/leave', () => {
  it('returns 400 when fields are missing', async () => {
    const res = await POST_leave(
      post('http://localhost/api/leave', { roomId: 'r1' }),
    )
    expect(res.status).toBe(400)
  })

  it('returns 200 and removes the presence key', async () => {
    const roomId = 'leave-room'
    const sessionId = 'leave-sess'
    await redisClient.set(presenceKey(roomId, sessionId), 'alice', 'EX', 30)

    const res = await POST_leave(
      post('http://localhost/api/leave', { roomId, sessionId }),
    )
    expect(res.status).toBe(200)

    const exists = await redisClient.exists(presenceKey(roomId, sessionId))
    expect(exists).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// GET /api/presence/[roomId]
// ---------------------------------------------------------------------------

describe('GET /api/presence/[roomId]', () => {
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
    await redisClient.set(presenceKey(roomId, 'sess-1'), 'alice', 'EX', 30)
    await redisClient.set(presenceKey(roomId, 'sess-2'), 'bob', 'EX', 30)

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
