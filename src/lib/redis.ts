import Redis from 'ioredis'

declare global {
  // eslint-disable-next-line no-var
  var _redis: Redis | undefined
}

function createRedis(): Redis {
  const url = process.env.REDIS_URL
  if (!url) throw new Error('REDIS_URL is not set')
  return new Redis(url, { maxRetriesPerRequest: null })
}

// Singleton per process — avoids exhausting connections in dev hot-reload
const redis: Redis = globalThis._redis ?? createRedis()
if (process.env.NODE_ENV !== 'production') globalThis._redis = redis

export default redis
