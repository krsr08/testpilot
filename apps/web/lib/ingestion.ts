import { createHash } from 'node:crypto';
import { extname, basename } from 'node:path';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from './db';
import { ApiError, membership } from './http';
import { deleteStorage, readStorage, scanUpload, writeSource } from './storage';
import { saveCaseRevision } from './case-history';

const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export async function audit(tx: Prisma.TransactionClient, projectId:string, actorId:string, action:string, entityType:string, entityId:string, before?:unknown, after?:unknown) {
 await tx.project.update({where:{id:projectId},data:{updatedBy:actorId,updatedAt:new Date()}});
 return tx.auditEvent.create({data:{projectId,actorId,action,entityType,entityId,...(before===undefined?{}:{beforeJson:json(before)}),...(after===undefined?{}:{afterJson:json(after)})}});
}
export async function createJob(tx:Prisma.TransactionClient,projectId:string,createdBy:string,kind:string,entityId:string,payload:Prisma.InputJsonValue={}) {
 const job=await tx.job.create({data:{projectId,createdBy,kind,entityId,payload}});await tx.outboxEvent.create({data:{jobId:job.id}});return job;
}
export async function ingestTextSource(projectId:string,userId:string,text:string,filename:string){
 const clean=z.string().trim().min(1).max(100000).parse(text),safeName=basename(filename).split('').filter(character=>character.charCodeAt(0)>=32).join('').slice(0,180)||'Authored requirements.txt',bytes=Buffer.from(clean,'utf8');
 try{await scanUpload(bytes);}catch(error){throw new ApiError(422,'MALWARE_SCAN_FAILED',error instanceof Error?error.message:'Document failed malware scanning.');}
 const storageKey=await writeSource(bytes,'txt','text/plain');
 try{return await db.$transaction(async tx=>{const source=await tx.sourceDocument.create({data:{projectId,filename:safeName.endsWith('.txt')?safeName:`${safeName}.txt`,mime:'text/plain',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),storageKey,createdBy:userId,updatedBy:userId}});const job=await createJob(tx,projectId,userId,'extract_source',source.id);await audit(tx,projectId,userId,'source_uploaded','SourceDocument',source.id,undefined,{filename:source.filename,size:bytes.length,origin:'authoring'});return {source,job_id:job.id};});}catch(error){await deleteStorage(storageKey).catch(()=>{});throw error;}
}
export function pageArgs(url:URL){const limit=z.coerce.number().int().min(1).max(100).default(50).parse(url.searchParams.get('limit')??undefined);const cursor=url.searchParams.get('cursor');if(cursor)z.uuid().parse(cursor);return {take:limit+1,...(cursor?{cursor:{id:cursor},skip:1}:{}),orderBy:{id:'asc' as const}};}
export function pageResult<T extends {id:string}>(rows:T[],take:number,key:string){const more=rows.length===take;if(more)rows.pop();return {[key]:rows,next_cursor:more?rows.at(-1)?.id:null};}
const revisionData=(r:any)=>({text:r.text,included:r.included,revision:r.revision,sourceLocator:r.sourceLocator,excerpt:r.excerpt,outOfScopeReason:r.outOfScopeReason});
async function getRequirement(id:string,userId:string){z.uuid().parse(id);const r=await db.requirement.findFirst({where:{id,deletedAt:null}});if(!r)throw new ApiError(404,'NOT_FOUND','Requirement not found.');await membership(r.projectId,userId);return r;}
export async function reviseRequirement(tx:Prisma.TransactionClient,id:string,version:number,data:any,userId:string) {
 const before=await tx.requirement.findUniqueOrThrow({where:{id}});
 await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${before.projectId}::uuid FOR UPDATE`;
 const update=await tx.requirement.updateMany({where:{id,version},data:{...data,revision:{increment:1},version:{increment:1},updatedBy:userId,status:'draft'}});
 if(update.count!==1)throw new ApiError(409,'VERSION_CONFLICT','This requirement changed. Reload it before saving.',{current_version:before.version});
 const after=await tx.requirement.findUniqueOrThrow({where:{id}});
 await tx.requirementRevision.create({data:{requirementId:id,revision:after.revision,data:json(revisionData(after)),createdBy:userId}});
 const affected=await tx.testCase.findMany({where:{deletedAt:null,links:{some:{requirementId:id}}}});
 for(const c of affected){await tx.testCase.update({where:{id:c.id},data:{stale:true,version:{increment:1},updatedBy:userId}});await saveCaseRevision(tx,c.id,userId,`Requirement ${before.stableCode} revised`);await audit(tx,before.projectId,userId,'case_stale','TestCase',c.id,{version:c.version},{version:c.version+1,requirementId:id});}
 await audit(tx,before.projectId,userId,'requirement_edited','Requirement',id,{revision:before.revision},{revision:after.revision});
 return after;
}
export async function ingestion(req:Request,path:string[],userId:string):Promise<Response|undefined>{
 const url=new URL(req.url);
 if(path[0]==='jobs'&&path.length===2&&req.method==='GET'){
  z.uuid().parse(path[1]);const job=await db.job.findUnique({where:{id:path[1]}});if(!job)throw new ApiError(404,'NOT_FOUND','Job not found.');await membership(job.projectId,userId);return Response.json(job);
 }
 if(path[0]==='sources'&&path[1]){
  z.uuid().parse(path[1]);const source=await db.sourceDocument.findFirst({where:{id:path[1],deletedAt:null}});if(!source)throw new ApiError(404,'NOT_FOUND','Source not found.');await membership(source.projectId,userId);
  if(path[2]==='download'&&req.method==='GET'){const bytes=await readStorage(source.storageKey);return new Response(bytes,{headers:{'Content-Type':source.mime,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(source.filename)}`,'Cache-Control':'private, no-store'}});}
  if(path.length===2&&req.method==='DELETE'){
   if(await db.generationRun.count({where:{projectId:source.projectId}}))throw new ApiError(409,'SOURCE_IN_USE','Sources cannot be deleted after generation. Create a new project or revise the requirements.');
   if(['queued','running'].includes(source.status))throw new ApiError(409,'JOB_IN_PROGRESS','Wait for extraction to finish before deleting this source.');
   await db.$transaction(async tx=>{await tx.sourceDocument.update({where:{id:source.id},data:{deletedAt:new Date(),updatedBy:userId}});await tx.requirement.updateMany({where:{sourceId:source.id},data:{deletedAt:new Date(),included:false,updatedBy:userId}});await audit(tx,source.projectId,userId,'source_deleted','SourceDocument',source.id);});return Response.json({deleted:true});
  }
 }
 if(path[0]==='requirements'&&path[1]){
  const before=await getRequirement(path[1],userId);
  if(path.length===2&&req.method==='PATCH'){
   const body=z.object({text:z.string().trim().min(1).max(10000).optional(),included:z.boolean().optional(),outOfScopeReason:z.string().max(2000).nullable().optional(),version:z.number().int().positive()}).strict().parse(await req.json());
   const {version,...data}=body;return Response.json(await db.$transaction(tx=>reviseRequirement(tx,before.id,version,data,userId)));
  }
  if(path[2]==='split'&&req.method==='POST'){
   const body=z.object({texts:z.array(z.string().trim().min(1).max(10000)).min(2).max(20),version:z.number().int().positive()}).strict().parse(await req.json());
   const requirements=await db.$transaction(async tx=>{await reviseRequirement(tx,before.id,body.version,{included:false,outOfScopeReason:'Split into smaller requirements'},userId);const result=[];
    for(const text of body.texts){const p=await tx.project.update({where:{id:before.projectId},data:{requirementCounter:{increment:1}}});const r=await tx.requirement.create({data:{projectId:before.projectId,sourceId:before.sourceId,stableCode:`REQ-${String(p.requirementCounter).padStart(3,'0')}`,text,sourceLocator:before.sourceLocator as Prisma.InputJsonValue,excerpt:before.excerpt,confidence:'review',inferred:before.inferred,createdBy:userId,updatedBy:userId}});await tx.requirementRevision.create({data:{requirementId:r.id,revision:1,data:json(revisionData(r)),createdBy:userId}});result.push(r);}return result;});return Response.json({requirements},{status:201});
  }
 }
 if(path[0]!=='projects'||!path[1]||path.length<3)return;
 z.uuid().parse(path[1]);const project=await membership(path[1],userId);
 if(path[2]==='sources'&&req.method==='POST'){
  if(Number(req.headers.get('content-length')||0)>11*1024*1024)throw new ApiError(422,'VALIDATION_ERROR','Files must be 10 MB or smaller.');
  let bytes:Buffer,filename:string,mime:string,extension:string;
  if(req.headers.get('content-type')?.includes('multipart/form-data')){
   const form=await req.formData();const file=form.get('file');if(!(file instanceof File))throw new ApiError(422,'VALIDATION_ERROR','Choose one PDF, DOCX, or TXT file.');
   if(file.size>10*1024*1024||file.size===0)throw new ApiError(422,'VALIDATION_ERROR','Choose a nonempty file no larger than 10 MB.');
   filename=basename(file.name).slice(0,200);extension=extname(filename).toLowerCase();
   const allowed:Record<string,string>={'.pdf':'application/pdf','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.txt':'text/plain'};
   mime=allowed[extension];if(!mime||file.type!==mime)throw new ApiError(422,'VALIDATION_ERROR','File extension and MIME type must match PDF, DOCX, or TXT.');
   bytes=Buffer.from(await file.arrayBuffer());
   if(extension==='.pdf'&&!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw new ApiError(422,'VALIDATION_ERROR','This file is not a valid PDF.');
   if(extension==='.docx'&&!bytes.subarray(0,2).equals(Buffer.from('PK')))throw new ApiError(422,'VALIDATION_ERROR','This file is not a valid DOCX.');
   if(extension==='.txt'){try{new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new ApiError(422,'VALIDATION_ERROR','TXT files must use UTF-8 encoding.');}}
  }else{const body=z.object({text:z.string().trim().min(1).max(50000),filename:z.string().max(180).optional()}).strict().parse(await req.json());return Response.json(await ingestTextSource(project.id,userId,body.text,body.filename||'Pasted user story.txt'),{status:202});}
  try{await scanUpload(bytes);}catch(error){throw new ApiError(422,'MALWARE_SCAN_FAILED',error instanceof Error?error.message:'Upload failed malware scanning.');}
  const storageKey=await writeSource(bytes,extension.slice(1),mime);
  try{const result=await db.$transaction(async tx=>{const source=await tx.sourceDocument.create({data:{projectId:project.id,filename,mime,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),storageKey,createdBy:userId,updatedBy:userId}});const job=await createJob(tx,project.id,userId,'extract_source',source.id);await audit(tx,project.id,userId,'source_uploaded','SourceDocument',source.id,undefined,{filename,size:bytes.length});return {source,job_id:job.id};});return Response.json(result,{status:202});}catch(e){await deleteStorage(storageKey).catch(()=>{});throw e;}
 }
 if(path[2]==='requirements'&&path.length===3&&req.method==='GET'){
  const args=pageArgs(url);const rows=await db.requirement.findMany({...args,where:{projectId:project.id,deletedAt:null,...(url.searchParams.get('status')?{status:url.searchParams.get('status')!}:{})},include:{source:true}});return Response.json(pageResult(rows,args.take,'requirements'));
 }
 if(path[2]==='requirements'&&path[3]==='merge'&&req.method==='POST'){
  const {requirements}=z.object({requirements:z.array(z.object({id:z.uuid(),version:z.number().int().positive()})).min(2).max(20)}).strict().parse(await req.json());
  if(new Set(requirements.map(r=>r.id)).size!==requirements.length)throw new ApiError(422,'VALIDATION_ERROR','Select distinct requirements.');
  const merged=await db.$transaction(async tx=>{const rows=await tx.requirement.findMany({where:{id:{in:requirements.map(r=>r.id)},projectId:project.id,deletedAt:null},orderBy:{stableCode:'asc'}});if(rows.length!==requirements.length)throw new ApiError(422,'VALIDATION_ERROR','Requirements must belong to this project.');if(new Set(rows.map(r=>r.sourceId)).size>1)throw new ApiError(422,'VALIDATION_ERROR','Merge requirements from the same source to preserve source grounding.');
   if(rows.map(r=>r.text).join('\n').length>10000||rows.map(r=>r.excerpt).join('\n').length>50000)throw new ApiError(422,'VALIDATION_ERROR','Combined requirement is too long. Merge fewer items.');
   for(const row of rows)await reviseRequirement(tx,row.id,requirements.find(r=>r.id===row.id)!.version,{included:false,outOfScopeReason:'Merged into a combined requirement'},userId);
   const p=await tx.project.update({where:{id:project.id},data:{requirementCounter:{increment:1}}});const r=await tx.requirement.create({data:{projectId:project.id,sourceId:rows[0].sourceId,stableCode:`REQ-${String(p.requirementCounter).padStart(3,'0')}`,text:rows.map(r=>r.text).join('\n'),excerpt:rows.map(r=>r.excerpt).join('\n'),sourceLocator:{parts:rows.map(r=>r.sourceLocator)},confidence:'review',createdBy:userId,updatedBy:userId}});await tx.requirementRevision.create({data:{requirementId:r.id,revision:1,data:json(revisionData(r)),createdBy:userId}});return r;});return Response.json(merged,{status:201});
 }
}
