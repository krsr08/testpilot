import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from './db';
import { ApiError, membership } from './http';
import { audit,createJob,pageArgs,pageResult } from './ingestion';
import { createQueue } from './queue';
const types=z.array(z.enum(['positive','negative','boundary','permission','other'])).min(1).max(5);
export const snapshotItems=(rows:any[])=>rows.sort((a,b)=>a.stableCode.localeCompare(b.stableCode)).map(r=>({id:r.id,stableCode:r.stableCode,text:r.text,revision:r.revision,sourceId:r.sourceId,excerpt:r.excerpt,sourceLocator:r.sourceLocator,inferred:r.inferred}));
export function canonical(v:unknown):string {if(Array.isArray(v))return `[${v.map(canonical).join(',')}]`;if(v&&typeof v==='object')return `{${Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,val])=>`${JSON.stringify(k)}:${canonical(val)}`).join(',')}}`;return JSON.stringify(v);}
export const snapshotHash=(items:unknown)=>createHash('sha256').update(canonical(items)).digest('hex');
function publicEndpoint(){try{const u=new URL(process.env.MODEL_BASE_URL||'');return `${u.origin}${u.pathname}`;}catch{return 'Not configured';}}
export async function generationApi(req:Request,path:string[],userId:string):Promise<Response|undefined>{
 if(path[0]==='settings'&&req.method==='GET')return Response.json({generator_mode:process.env.GENERATOR_MODE||'fixture',model_name:process.env.MODEL_NAME||'deterministic-fixture',model_base_url:process.env.GENERATOR_MODE==='external'?publicEndpoint():null,storage_mode:'local',demo_auth:process.env.DEMO_AUTH==='true',prompt_version:'testpilot-v1'});
 if(path[0]==='jobs'&&path[2]==='retry'&&req.method==='POST'){
  z.uuid().parse(path[1]);const job=await db.job.findUnique({where:{id:path[1]}});if(!job)throw new ApiError(404,'NOT_FOUND','Job not found.');await membership(job.projectId,userId);
  if(job.status!=='failed')return Response.json({job_id:job.id,status:job.status},{status:202});
  const queue=createQueue();try{const queued=await queue.getJob(job.id);if(queued){const state=await queued.getState();if(state==='active'||state==='delayed'||state==='waiting')return Response.json({job_id:job.id,status:'queued'},{status:202});await queued.remove();}
   await db.$transaction(async tx=>{await tx.job.update({where:{id:job.id},data:{status:'queued',stage:'retry queued',error:null,completedAt:null}});await tx.outboxEvent.upsert({where:{jobId:job.id},create:{jobId:job.id},update:{publishedAt:null}});if(['generate_cases','regenerate_case'].includes(job.kind))await tx.generationRun.update({where:{id:job.entityId},data:{status:'queued',error:null}});if(job.kind==='build_export')await tx.export.update({where:{id:job.entityId},data:{status:'queued',error:null}});if(job.kind==='extract_source')await tx.sourceDocument.update({where:{id:job.entityId},data:{status:'queued',error:null}});await audit(tx,job.projectId,userId,'job_retried','Job',job.id);});
  }finally{await queue.close();}return Response.json({job_id:job.id},{status:202});
 }
 if(path[0]!=='projects'||path.length<3)return;
 z.uuid().parse(path[1]);const project=await membership(path[1],userId);
 if(path[2]==='requirements'&&path[3]==='confirm'&&req.method==='POST'){
  const body=z.object({requirements:z.array(z.object({id:z.uuid(),revision:z.number().int().positive()}).strict()).min(1).max(100)}).strict().parse(await req.json());
  if(new Set(body.requirements.map(r=>r.id)).size!==body.requirements.length)throw new ApiError(422,'VALIDATION_ERROR','Confirm each requirement once.');
  const snapshot=await db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${project.id}::uuid FOR UPDATE`;await tx.$queryRaw`SELECT id FROM "Requirement" WHERE "projectId"=${project.id}::uuid FOR UPDATE`;
   const rows=await tx.requirement.findMany({where:{projectId:project.id,included:true,deletedAt:null}});
   if(rows.length!==body.requirements.length||rows.some(r=>!body.requirements.some(b=>b.id===r.id&&b.revision===r.revision)))throw new ApiError(409,'VERSION_CONFLICT','Requirements changed. Reload and confirm all included requirements.');
   const items=snapshotItems(rows),hash=snapshotHash(items);let snap=await tx.requirementSnapshot.findUnique({where:{projectId_hash:{projectId:project.id,hash}}});if(!snap)snap=await tx.requirementSnapshot.create({data:{projectId:project.id,hash,items:items as Prisma.InputJsonValue,createdBy:userId}});
   await tx.requirement.updateMany({where:{id:{in:rows.map(r=>r.id)},status:{not:'confirmed'}},data:{status:'confirmed',version:{increment:1},updatedBy:userId}});await audit(tx,project.id,userId,'requirements_confirmed','RequirementSnapshot',snap.id,undefined,{hash,count:items.length});return snap;});
  return Response.json({snapshot_hash:snapshot.hash,snapshot_id:snapshot.id});
 }
 if(path[2]==='generations'&&req.method==='GET'){
  const runs=await db.generationRun.findMany({where:{projectId:project.id},orderBy:{createdAt:'desc'},take:50});const snapshots=await db.requirementSnapshot.findMany({where:{projectId:project.id},select:{hash:true,createdAt:true},orderBy:{createdAt:'desc'},take:50});
  return Response.json({runs:await Promise.all(runs.map(async r=>({...r,job_id:(await db.job.findFirst({where:{entityId:r.id,kind:'generate_cases'}}))?.id}))),snapshots});
 }
 if(path[2]==='generations'&&req.method==='POST'){
  const body=z.object({snapshot_hash:z.string().regex(/^[a-f0-9]{64}$/),types:types.default(['positive','negative','boundary','permission']),idempotency_key:z.string().min(8).max(120)}).strict().parse(await req.json());body.types=[...new Set(body.types)].sort() as typeof body.types;
  const result=await db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${project.id}::uuid FOR UPDATE`;
   const prior=await tx.generationRun.findUnique({where:{projectId_idempotencyKey:{projectId:project.id,idempotencyKey:body.idempotency_key}}});if(prior){if(prior.snapshotHash!==body.snapshot_hash||canonical(prior.types)!==canonical(body.types))throw new ApiError(409,'IDEMPOTENCY_CONFLICT','This idempotency key was used with different settings.');return {run:prior,job_id:(await tx.job.findFirstOrThrow({where:{entityId:prior.id,kind:'generate_cases'}})).id};}
   const snapshot=await tx.requirementSnapshot.findUnique({where:{projectId_hash:{projectId:project.id,hash:body.snapshot_hash}}});if(!snapshot)throw new ApiError(422,'VALIDATION_ERROR','Confirm requirements before generating cases.');
   const current=snapshotItems(await tx.requirement.findMany({where:{projectId:project.id,included:true,deletedAt:null}}));if(snapshotHash(current)!==snapshot.hash)throw new ApiError(409,'STALE_SNAPSHOT','Requirements changed. Confirm a new snapshot before generating.');
   if(await tx.generationRun.count({where:{projectId:project.id,snapshotHash:snapshot.hash,status:{in:['queued','running']}}}))throw new ApiError(409,'GENERATION_IN_PROGRESS','A generation is already running for this snapshot.');
   if(await tx.generationRun.count({where:{projectId:project.id,createdAt:{gte:new Date(Date.now()-60000)}}})>=10)throw new ApiError(429,'RATE_LIMITED','Wait a minute before starting another generation.');
   const provider=process.env.GENERATOR_MODE||'fixture';if(!['fixture','external'].includes(provider))throw new ApiError(422,'VALIDATION_ERROR','Configure GENERATOR_MODE as fixture or external.');
   const run=await tx.generationRun.create({data:{projectId:project.id,snapshotId:snapshot.id,snapshotHash:snapshot.hash,idempotencyKey:body.idempotency_key,types:body.types,modelId:provider==='fixture'?'deterministic-fixture':process.env.MODEL_NAME||'external',promptVersion:'testpilot-v1',provider,createdBy:userId}});const job=await createJob(tx,project.id,userId,'generate_cases',run.id);await audit(tx,project.id,userId,'generation_started','GenerationRun',run.id,undefined,{snapshot_hash:snapshot.hash,provider});return {run,job_id:job.id};
  });return Response.json(result,{status:202});
 }
 if(path[2]==='test-cases'&&req.method==='GET'){
  const url=new URL(req.url),args=pageArgs(url);const status=url.searchParams.get('status'),type=url.searchParams.get('type'),requirementId=url.searchParams.get('requirement_id');
  const cases=await db.testCase.findMany({...args,where:{projectId:project.id,deletedAt:null,...(status?{status}:{}),...(type?{type}:{}),...(requirementId?{links:{some:{requirementId}}}:{})},include:{steps:{orderBy:{position:'asc'}},links:{include:{requirement:true}},scenario:true}});
  const enriched=await Promise.all(cases.map(async c=>({...c,citations:await db.sourceCitation.findMany({where:{entityId:c.id}})})));return Response.json(pageResult(enriched,args.take,'cases'));
 }
}
