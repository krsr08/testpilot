import { Queue } from 'bullmq';

export const QUEUE_NAME = 'testpilot';

export function redisConnection() {
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:56379');
  return {
    host: url.hostname, port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: Number(url.pathname.slice(1) || '0'),
    maxRetriesPerRequest: null,
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}

export function createQueue() {
  return new Queue(QUEUE_NAME, { connection: redisConnection() });
}
