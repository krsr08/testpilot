import 'dotenv/config';
import { Worker } from 'bullmq';
import { db } from '../../packages/db';
import { createQueue, QUEUE_NAME, redisConnection } from '../../apps/web/lib/queue';
import { extractSource, ProcessingError } from './extraction';
import { generateCases } from './generation';
import { regenerateCase } from './regenerate';
import { buildExport, cleanupExpiredExports } from './export';

export type JobHandler = (jobId: string) => Promise<void>;
export const handlers: Record<string, JobHandler> = { extract_source: extractSource, generate_cases: generateCases, regenerate_case:regenerateCase, build_export: buildExport };

export async function dispatch(jobId: string) {
  const job = await db.job.findUniqueOrThrow({ where: { id: jobId } });
  if (job.status === 'succeeded') return;
  const handler = handlers[job.kind];
  if (!handler) throw new Error('This job type is not supported by the running worker.');
  await db.job.update({ where: { id: jobId }, data: {
    status: 'running', stage: 'starting', progress: 5,
    attempt: { increment: 1 }, startedAt: new Date(), completedAt: null, error: null,
  } });
  const started = Date.now();
  try {
    await handler(jobId);
    await db.job.update({ where: { id: jobId }, data: {
      status: 'succeeded', stage: 'complete', progress: 100, completedAt: new Date(), error: null,
    } });
    console.info(JSON.stringify({ event: 'job_completed', jobId, kind: job.kind, durationMs: Date.now() - started }));
  } catch (error) {
    const message = error instanceof ProcessingError
      ? error.message.slice(0, 300) : 'Processing failed. Retry the job or check worker configuration.';
    await db.$transaction(async (tx) => {
      await tx.job.update({ where: { id: jobId }, data: {
        status: 'failed', stage: 'failed', error: message, completedAt: new Date(),
      } });
      if (job.kind === 'extract_source') {
        await tx.sourceDocument.update({ where: { id: job.entityId }, data: { status: 'failed', error: message } });
        await tx.auditEvent.create({ data: {
          projectId: job.projectId, actorId: job.createdBy, action: 'extraction_failed',
          entityType: 'source', entityId: job.entityId, afterJson: { category: 'extraction_failure' },
        } });
      }
    });
    const agentKey={extract_source:'requirement-extraction',generate_cases:'test-design'}[job.kind];
    if(agentKey)await db.agentRun.updateMany({where:{projectId:job.projectId,agentKey,status:'RUNNING',inputRef:{path:['jobId'],equals:jobId}},data:{status:'FAILED',finishedAt:new Date(),validation:{error:message}}}).catch(()=>{});
    console.error(JSON.stringify({ event: 'job_failed', jobId, kind: job.kind, category: 'processing_failure', durationMs: Date.now() - started }));
    throw new Error(message, { cause: error });
  }
}

const queue = createQueue();
let publishing = false;
async function publishOutbox() {
  if (publishing) return;
  publishing = true;
  try {
    const events = await db.outboxEvent.findMany({ where: { publishedAt: null }, include: { job: true }, take: 50, orderBy: { createdAt: 'asc' } });
    for (const event of events) {
      await queue.add(event.job.kind, { jobId: event.jobId }, {
        jobId: event.jobId, attempts: 3, backoff: { type: 'exponential', delay: 1500 },
      });
      await db.outboxEvent.update({ where: { id: event.id }, data: { publishedAt: new Date() } });
    }
    // Repair lost Redis queue state after a Redis restart, while respecting active jobs.
    const pending = await db.job.findMany({ where: { status: { in: ['queued', 'running'] } }, take: 100 });
    for (const job of pending) {
      const queued = await queue.getJob(job.id);
      if (!queued) await queue.add(job.kind, { jobId: job.id }, { jobId: job.id, attempts: 3, backoff: { type: 'exponential', delay: 1500 } });
    }
  } catch {
    console.error(JSON.stringify({ event: 'outbox_recovery_failed', category: 'database_or_queue_unavailable' }));
  } finally { publishing = false; }
}

const worker = new Worker(QUEUE_NAME, async (queued) => dispatch(queued.data.jobId), {
  connection: redisConnection(), concurrency: 2,
});
worker.on('error', () => console.error(JSON.stringify({ event: 'queue_error', category: 'queue_unavailable' })));
worker.on('failed', () => { /* dispatch persists a sanitized failure for the UI */ });
const interval = setInterval(() => void publishOutbox(), 2000);
const retentionInterval = setInterval(() => void cleanupExpiredExports().catch(() => console.error(JSON.stringify({ event: 'export_retention_failed' }))), 60_000);
void publishOutbox();
console.info(JSON.stringify({ event: 'worker_started', kinds: Object.keys(handlers) }));

async function shutdown() {
  clearInterval(interval);
  clearInterval(retentionInterval);
  await worker.close();
  await queue.close();
  await db.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
