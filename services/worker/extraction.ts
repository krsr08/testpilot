import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { Prisma } from '@prisma/client';
import { writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from '../../packages/db';
import { readStorage, storageMode, storagePath } from '../../apps/web/lib/storage';
import { extractionSchema } from './segmentation';
import {finishAgentRun,startAgentRun} from '../../apps/web/lib/agent-config';

const execute = promisify(execFile);
export class ProcessingError extends Error {}
const agentSchema=z.object({requirements:z.array(z.object({text:z.string().trim().min(11).max(10_000),excerpt:z.string().min(1).max(50_000),sourceLocator:z.record(z.string(),z.json()),confidence:z.enum(['high','review']),category:z.enum(['FUNCTIONAL_REQUIREMENT','USER_STORY','ACCEPTANCE_CRITERIA']),parentStory:z.string().max(300)}).strict()).max(1000)}).strict();

async function structuralExtract(extraction:z.infer<typeof extractionSchema>){
 const input=path.join(tmpdir(),`testpilot-agent-${randomUUID()}.json`);
 try{await writeFile(input,JSON.stringify(extraction),{flag:'wx'});const result=await execute(process.env.PYTHON_BIN||'python',[path.resolve('services/worker/agent_extractor.py'),input],{timeout:90_000,maxBuffer:8*1024*1024,windowsHide:true});return agentSchema.parse(JSON.parse(result.stdout)).requirements;}
 catch(error){const failure=error as {stdout?:string};let detail='Structural extraction failed. No requirements were saved.';if(failure.stdout)try{const parsed=JSON.parse(failure.stdout);if(typeof parsed.error==='string')detail=parsed.error;}catch{detail='Structural extraction returned an unreadable error.';}throw new ProcessingError(detail,{cause:error});}
 finally{await rm(input,{force:true});}
}

export async function extractSource(jobId: string) {
  const job = await db.job.findUniqueOrThrow({ where: { id: jobId } });
  const source = await db.sourceDocument.findUniqueOrThrow({ where: { id: job.entityId } });
  if (source.status === 'succeeded') return;
  const project=await db.project.findUniqueOrThrow({where:{id:source.projectId},include:{workspace:true}});const governedRun=await startAgentRun({projectId:source.projectId,organizationId:project.workspace.organizationId,agentKey:'requirement-extraction',modelRoute:process.env.EXTRACTOR_MODE==='external'?(process.env.MODEL_NAME||'external'):'deterministic-fixture',inputRef:{jobId,sourceId:source.id,filename:source.filename,mime:source.mime}});
  await db.sourceDocument.update({ where: { id: source.id }, data: { status: 'running', error: null } });
  await db.job.update({ where: { id: jobId }, data: { stage: 'extracting text', progress: 20 } });
  let output: string;
  const inputPath=storageMode()==='local'?storagePath(source.storageKey):path.join(tmpdir(),`testpilot-${source.id}${path.extname(source.filename)}`);
  try {
    if(storageMode()==='s3')await writeFile(inputPath,await readStorage(source.storageKey),{flag:'wx'});
    const result = await execute(process.env.PYTHON_BIN || 'python', [
      path.resolve('services/worker/extract.py'), inputPath, source.mime,
    ], { timeout: 120_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
    output = result.stdout;
  } catch (error) {
    let message = 'Extraction failed. Check that the document is valid, readable, and unlocked, then retry.';
    const failure = error as { stdout?: string; code?: string };
    if (failure.code === 'ENOENT') message = 'Python worker is unavailable. Configure PYTHON_BIN and install worker requirements.';
    if (failure.stdout) {
      try {
        const parsed = JSON.parse(failure.stdout);
        if (typeof parsed.error === 'string') message = parsed.error.slice(0, 300);
      } catch { /* Keep the sanitized fallback. */ }
    }
    throw new ProcessingError(message, { cause: error });
  } finally { if(storageMode()==='s3')await rm(inputPath,{force:true}); }
  const extraction = extractionSchema.parse(JSON.parse(output));
  const candidates = await structuralExtract(extraction);
  if (candidates.length > 1000) throw new ProcessingError('Document exceeds 1,000 requirement candidates. Split it into smaller documents.');
  await db.job.update({ where: { id: jobId }, data: { stage: 'saving requirements', progress: 75 } });
  await db.$transaction(async (tx) => {
    // Lock the source before idempotent completion; all derived records commit together.
    await tx.$queryRaw`SELECT id FROM "SourceDocument" WHERE id = ${source.id}::uuid FOR UPDATE`;
    const current = await tx.sourceDocument.findUniqueOrThrow({ where: { id: source.id } });
    if (current.status === 'succeeded') return;
    const project = await tx.project.update({
      where: { id: source.projectId }, data: { requirementCounter: { increment: candidates.length } },
    });
    const first = project.requirementCounter - candidates.length + 1;
    for (const [index, candidate] of candidates.entries()) {
      const requirement = await tx.requirement.create({ data: {
        projectId: source.projectId, sourceId: source.id,
        stableCode: `REQ-${String(first + index).padStart(3, '0')}`,
        text:candidate.text,excerpt:candidate.excerpt,sourceLocator:candidate.sourceLocator,confidence:candidate.confidence,category:candidate.category,parentStory:candidate.parentStory,createdBy: job.createdBy, updatedBy: job.createdBy,
      } });
      await tx.requirementRevision.create({ data: {
        requirementId: requirement.id, revision: 1, createdBy: job.createdBy,
        data: { text: requirement.text, included: true, sourceLocator: candidate.sourceLocator, excerpt: candidate.excerpt,category:candidate.category,parentStory:candidate.parentStory },
      } });
      await tx.sourceCitation.create({ data: {
        entityType: 'requirement', entityId: requirement.id, sourceId: source.id,
        locator: candidate.sourceLocator, quote: candidate.excerpt, inferred: false,
      } });
    }
    await tx.sourceDocument.update({ where: { id: source.id }, data: {
      status: 'succeeded', text: extraction.text,
      pageMap: extraction.pageMap as Prisma.InputJsonValue, pageCount: extraction.pageCount,
      warnings: extraction.warnings, error: null,
    } });
    await tx.auditEvent.create({ data: {
      projectId: source.projectId, actorId: job.createdBy, action: 'source_extracted',
      entityType: 'source', entityId: source.id,
      afterJson: { requirementCount: candidates.length, warningCount: extraction.warnings.length },
    } });
  }, { timeout: 30_000 });
  await finishAgentRun(governedRun.id,{status:'SUCCEEDED',outputRef:{sourceId:source.id,requirementCount:candidates.length},validation:{schema:'passed',sourceLocations:'passed',warnings:extraction.warnings}});
}
