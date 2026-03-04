import { Redis } from '@upstash/redis'
import localRedis from './redis-local'

// ---------------------------------------------------------------------------
// Read-op logger — only active in development
// Counts every read command (scan, mget, smembers, exists, xread) and prints
// a summary every 10 seconds so we can see where the hot spots are.
// ---------------------------------------------------------------------------

type ReadOp = 'scan' | 'mget' | 'smembers' | 'exists' | 'xread'

const counts: Record<ReadOp, number> = {
  scan: 0, mget: 0, smembers: 0, exists: 0, xread: 0,
}

let logTimer: ReturnType<typeof setInterval> | null = null

function startLogger() {
  if (logTimer) return
  logTimer = setInterval(() => {
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    if (total === 0) return
    console.log(
      `[redis reads/10s] total=${total}`,
      Object.entries(counts)
        .filter(([, n]) => n > 0)
        .map(([op, n]) => `${op}=${n}`)
        .join('  '),
    )
    ;(Object.keys(counts) as ReadOp[]).forEach(k => { counts[k] = 0 })
  }, 10_000)
}

function track(op: ReadOp, base: unknown) {
  if (process.env.NODE_ENV !== 'production') startLogger()
  counts[op]++
  return base
}

// ---------------------------------------------------------------------------
// Pick the right backend
// ---------------------------------------------------------------------------

function makeClient() {
  if (process.env.REDIS_URL) {
    return localRedis
  }
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error('Set REDIS_URL or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN')
  }
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  })
}

const backend = makeClient() as typeof localRedis

// ---------------------------------------------------------------------------
// Thin proxy — intercept read ops for logging, pass writes straight through
// ---------------------------------------------------------------------------

const redis = {
  scan:      (...args: Parameters<typeof backend.scan>)      => { track('scan', null);     return backend.scan(...args) },
  mget:      (...args: Parameters<typeof backend.mget>)      => { track('mget', null);     return backend.mget(...args) },
  smembers:  (...args: Parameters<typeof backend.smembers>)  => { track('smembers', null); return backend.smembers(...args) },
  exists:    (...args: Parameters<typeof backend.exists>)    => { track('exists', null);   return backend.exists(...args) },
  xread:     (...args: Parameters<typeof backend.xread>)     => { track('xread', null);    return backend.xread(...args) },
  // writes
  set:       (...args: Parameters<typeof backend.set>)       => backend.set(...args),
  sadd:      (...args: Parameters<typeof backend.sadd>)      => backend.sadd(...args),
  srem:      (...args: Parameters<typeof backend.srem>)      => backend.srem(...args),
  del:       (...args: Parameters<typeof backend.del>)       => backend.del(...args),
  xadd:      (...args: Parameters<typeof backend.xadd>)      => backend.xadd(...args),
  publish:   (channel: string, message: string) => backend.publish(channel, message),
}

export default redis
