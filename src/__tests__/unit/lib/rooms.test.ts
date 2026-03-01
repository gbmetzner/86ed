import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/redis', () => ({
  default: {
    scan: vi.fn(),
    mget: vi.fn(),
    smembers: vi.fn(),
    srem: vi.fn(),
    sadd: vi.fn(),
    set: vi.fn(),
  },
}))

import redis from '@/lib/redis'
import {
  presenceKey,
  messagesKey,
  getPresence,
  cleanStaleRooms,
  allocateRoom,
} from '@/lib/rooms'

const r = vi.mocked(redis)

// ---------------------------------------------------------------------------
// Pure key helpers
// ---------------------------------------------------------------------------

describe('presenceKey', () => {
  it('formats the presence key correctly', () => {
    expect(presenceKey('room-abc', 'sess-xyz')).toBe('room:room-abc:presence:sess-xyz')
  })
})

describe('messagesKey', () => {
  it('formats the messages key correctly', () => {
    expect(messagesKey('room-abc')).toBe('room:room-abc:messages')
  })
})

// ---------------------------------------------------------------------------
// getPresence
// ---------------------------------------------------------------------------

describe('getPresence', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns an empty array when no presence keys exist', async () => {
    r.scan.mockResolvedValue([0, []])
    expect(await getPresence('room-1')).toEqual([])
    expect(r.mget).not.toHaveBeenCalled()
  })

  it('returns all handles in the room', async () => {
    r.scan.mockResolvedValue([0, [
      'room:room-1:presence:s1',
      'room:room-1:presence:s2',
    ]])
    r.mget.mockResolvedValue(['alice', 'bob'])
    expect(await getPresence('room-1')).toEqual(['alice', 'bob'])
  })

  it('filters out null values from expired keys', async () => {
    r.scan.mockResolvedValue([0, [
      'room:room-1:presence:s1',
      'room:room-1:presence:s2',
    ]])
    r.mget.mockResolvedValue(['alice', null])
    expect(await getPresence('room-1')).toEqual(['alice'])
  })

  it('handles paginated SCAN responses', async () => {
    r.scan
      .mockResolvedValueOnce([42, ['room:room-1:presence:s1']])
      .mockResolvedValueOnce([0, ['room:room-1:presence:s2']])
    r.mget.mockResolvedValue(['alice', 'bob'])

    const result = await getPresence('room-1')

    expect(r.scan).toHaveBeenCalledTimes(2)
    expect(r.mget).toHaveBeenCalledWith(
      'room:room-1:presence:s1',
      'room:room-1:presence:s2',
    )
    expect(result).toEqual(['alice', 'bob'])
  })
})

// ---------------------------------------------------------------------------
// cleanStaleRooms
// ---------------------------------------------------------------------------

describe('cleanStaleRooms', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does nothing when rooms:active is empty', async () => {
    r.smembers.mockResolvedValue([])
    await cleanStaleRooms()
    expect(r.scan).not.toHaveBeenCalled()
    expect(r.srem).not.toHaveBeenCalled()
  })

  it('does not remove rooms that have active presence keys', async () => {
    r.smembers.mockResolvedValue(['active-room'])
    r.scan.mockResolvedValue([0, ['room:active-room:presence:s1']])
    await cleanStaleRooms()
    expect(r.srem).not.toHaveBeenCalled()
  })

  it('removes rooms that have no active presence keys', async () => {
    r.smembers.mockResolvedValue(['stale-room', 'active-room'])
    r.scan
      .mockResolvedValueOnce([0, []])                                     // stale-room: empty
      .mockResolvedValueOnce([0, ['room:active-room:presence:s1']])       // active-room: has users
    r.srem.mockResolvedValue(1)

    await cleanStaleRooms()

    expect(r.srem).toHaveBeenCalledTimes(1)
    expect(r.srem).toHaveBeenCalledWith('rooms:active', 'stale-room')
  })
})

// ---------------------------------------------------------------------------
// allocateRoom
// ---------------------------------------------------------------------------

describe('allocateRoom', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a new room when no rooms exist', async () => {
    // cleanStaleRooms + allocateRoom both call smembers — both return []
    r.smembers.mockResolvedValue([])
    r.scan.mockResolvedValue([0, []])
    r.sadd.mockResolvedValue(1)
    r.set.mockResolvedValue('OK')

    const roomId = await allocateRoom('alice', 'sess-1')

    expect(typeof roomId).toBe('string')
    expect(roomId.length).toBeGreaterThan(0)
    expect(r.sadd).toHaveBeenCalledWith('rooms:active', roomId)
    expect(r.set).toHaveBeenCalledWith(
      `room:${roomId}:presence:sess-1`,
      'alice',
      { ex: 30 },
    )
  })

  it('joins an existing room that has space', async () => {
    // cleanStaleRooms: smembers → [] (no stale rooms)
    // allocateRoom:   smembers → ['existing-room'] with 1 user
    r.smembers
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(['existing-room'])
    r.scan.mockResolvedValue([0, ['room:existing-room:presence:s1']])
    r.mget.mockResolvedValue(['alice'])
    r.set.mockResolvedValue('OK')

    const roomId = await allocateRoom('bob', 'new-sess')

    expect(roomId).toBe('existing-room')
    expect(r.sadd).not.toHaveBeenCalled()
    expect(r.set).toHaveBeenCalledWith(
      'room:existing-room:presence:new-sess',
      'bob',
      { ex: 30 },
    )
  })

  it('creates a new room when all existing rooms are full (6 users)', async () => {
    const fullKeys = Array.from({ length: 6 }, (_, i) => `room:full:presence:s${i + 1}`)
    const fullHandles = Array.from({ length: 6 }, (_, i) => `user${i + 1}`)

    r.smembers
      .mockResolvedValueOnce([])         // cleanStaleRooms
      .mockResolvedValueOnce(['full'])    // allocateRoom
    r.scan.mockResolvedValue([0, fullKeys])
    r.mget.mockResolvedValue(fullHandles)
    r.sadd.mockResolvedValue(1)
    r.set.mockResolvedValue('OK')

    const roomId = await allocateRoom('new-user', 'new-sess')

    expect(roomId).not.toBe('full')
    expect(r.sadd).toHaveBeenCalledWith('rooms:active', roomId)
    expect(r.set).toHaveBeenCalledWith(
      `room:${roomId}:presence:new-sess`,
      'new-user',
      { ex: 30 },
    )
  })

  it('returns the room id of the joined room', async () => {
    r.smembers
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(['room-xyz'])
    r.scan.mockResolvedValue([0, ['room:room-xyz:presence:s1']])
    r.mget.mockResolvedValue(['carol'])
    r.set.mockResolvedValue('OK')

    const roomId = await allocateRoom('dave', 'sess-dave')
    expect(roomId).toBe('room-xyz')
  })
})
