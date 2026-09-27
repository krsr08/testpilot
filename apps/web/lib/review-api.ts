import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from './db';
import { ApiError,membership,requireProjectRole } from './http';
import { audit,createJob } from './ingestion';
import { snapshotHash,snapshotItems } from './generation-api';
import { buildTraceability } from './traceability';

const step=z.object({action:z.string().trim().max(2000),expectedResult:z.string().trim().max(2000)}).strict();
const fields=z.object({title:z.string().trim().min(1).max(300),type:z.enum(['positive','negative','boundary','permission','other']).default('other'),priority:z.enum(['low','medium','high']).default('medium'),preconditions:z.string().max(5000).default(''),testData:z.string().max(5000).default(''),postconditions:z.string().max(5000).default(''),rationale:z.string().max(5000).default(''),reviewerNotes:z.string().max(5000).default(''),steps:z.array(step).max(30)}).strict();
import { lockedCase, saveCaseRevision } from './case-history';
export async function caseAccess(id:string,userId:string){z.uuid().parse(id);const c=await db.testCase.findFirst({where:{id,deletedAt:null}});if(!c)throw new ApiError(404,'NOT_FOUND','Test case not found.');await membership(c.projectId,userId);return c;}
async function review(tx:Prisma.TransactionClient,id:string,version:number,action:string,note:string,userId:string){const before=await lockedCase(tx,id,version);
 if(action==='approve'&&before.title.trim().length<5)throw new ApiError(422,'VALIDATION_ERROR','Approval requires a title of at least five characters.');
 if(action==='approve'&&before.links.length===0)throw new ApiError(422,'VALIDATION_ERROR','Approval requires at least one linked requirement.');
 if(action==='approve'&&(before.steps.length===0||before.steps.some(s=>!s.action.trim()||!s.expectedResult.trim())))throw new ApiError(422,'VALIDATION_ERROR','Approval requires at least one step and an action and expected result for every step.',{steps:['Complete all actions and expected results.']});
 if(action==='approve'&&before.stale)throw new ApiError(422,'VALIDATION_ERROR','Review the changed requirement and retain, edit, or regenerate this stale case before approval.');
 if(action==='retain'&&!note.trim())throw new ApiError(422,'VALIDATION_ERROR','Explain why this case remains valid for the changed requirement.',{note:['A reason is required.']});
 const status=action==='approve'?'approved':action==='reject'?'rejected':before.status;
 await tx.testCase.update({where:{id},data:{status,stale:action==='retain'?false:before.stale,reviewerNotes:note,version:{increment:1},updatedBy:userId}});
 const saved=await saveCaseRevision(tx,id,userId,action);if(action==='reject')await tx.feedbackEvent.create({data:{projectId:before.projectId,testCaseId:id,category:'other',disposition:'rejected',note,original:before as unknown as Prisma.InputJsonValue,createdBy:userId}});await audit(tx,before.projectId,userId,`case_${action==='approve'?'approved':action==='reject'?'rejected':'retained'}`,'TestCase',id,{version:before.version,status:before.status},{version:saved.version,status:saved.status});return saved;
}
export async function reviewApi(req:Request,path:string[],userId:string):Promise<Response|undefined>{
 if(path[0]==='test-cases'&&path[1]){
  const current=await caseAccess(path[1],userId);
  if(path[2]==='history'&&req.method==='GET')return Response.json({versions:await db.testCaseRevision.findMany({where:{testCaseId:current.id},orderBy:{version:'desc'}})});
  if(path.length===2&&req.method==='PATCH'){
   const body=z.object({title:z.string().trim().min(1).max(300).optional(),type:z.enum(['positive','negative','boundary','permission','other']).optional(),priority:z.enum(['low','medium','high']).optional(),preconditions:z.string().max(5000).optional(),testData:z.string().max(5000).optional(),postconditions:z.string().max(5000).optional(),rationale:z.string().max(5000).optional(),reviewerNotes:z.string().max(5000).optional(),steps:z.array(step).max(30).optional(),version:z.number().int().positive()}).strict().parse(await req.json());const {version,steps,...updates}=body;
   const saved=await db.$transaction(async tx=>{const before=await lockedCase(tx,current.id,version);await tx.testCase.update({where:{id:current.id},data:{...updates,status:'draft',stale:false,version:{increment:1},updatedBy:userId}});if(steps){await tx.testStep.deleteMany({where:{testCaseId:current.id}});await tx.testStep.createMany({data:steps.map((s,i)=>({...s,position:i+1,testCaseId:current.id}))});}const result=await saveCaseRevision(tx,current.id,userId,'edited');await tx.feedbackEvent.create({data:{projectId:current.projectId,testCaseId:current.id,category:steps?'incorrect_step':'other',disposition:'edited',note:updates.reviewerNotes||'',original:before as unknown as Prisma.InputJsonValue,corrected:result as unknown as Prisma.InputJsonValue,createdBy:userId}});await audit(tx,current.projectId,userId,'case_edited','TestCase',current.id,{version:before.version},{version:result.version});return result;});return Response.json(saved);
  }
  if(path[2]==='review'&&req.method==='POST'){const b=z.object({action:z.enum(['approve','reject','retain']),note:z.string().max(5000).default(''),version:z.number().int().positive()}).strict().parse(await req.json());await requireProjectRole(current.projectId,userId,['ADMIN','QA_LEAD']);return Response.json(await db.$transaction(tx=>review(tx,current.id,b.version,b.action,b.note,userId)));}
  if(path[2]==='links'&&req.method==='POST'){
   const b=z.object({requirementIds:z.array(z.uuid()).max(10),version:z.number().int().positive()}).strict().parse(await req.json());
   const saved=await db.$transaction(async tx=>{await lockedCase(tx,current.id,b.version);const ids=[...new Set(b.requirementIds)];const linked=await tx.requirement.findMany({where:{id:{in:ids},projectId:current.projectId,deletedAt:null}});if(linked.length!==ids.length)throw new ApiError(422,'VALIDATION_ERROR','All linked requirements must belong to this project.');await tx.requirementCaseLink.deleteMany({where:{testCaseId:current.id}});await tx.requirementCaseLink.createMany({data:ids.map(requirementId=>({requirementId,testCaseId:current.id,createdBy:userId,rationale:'Manually linked by reviewer'}))});await tx.testCase.update({where:{id:current.id},data:{version:{increment:1},status:'draft',updatedBy:userId}});const result=await saveCaseRevision(tx,current.id,userId,'links changed');await audit(tx,current.projectId,userId,'case_links_changed','TestCase',current.id,undefined,{requirementIds:ids,version:result.version});return result;});return Response.json(saved);
  }
  if(path[2]==='regenerate'&&req.method==='POST'){
   const {version}=z.object({version:z.number().int().positive()}).strict().parse(await req.json());
   const result=await db.$transaction(async tx=>{const c=await lockedCase(tx,current.id,version);if(c.links.length===0)throw new ApiError(422,'VALIDATION_ERROR','Link at least one requirement before regenerating.');const items=snapshotItems(await tx.requirement.findMany({where:{projectId:c.projectId,included:true,deletedAt:null}}));const hash=snapshotHash(items);const snapshot=await tx.requirementSnapshot.findUnique({where:{projectId_hash:{projectId:c.projectId,hash}}});if(!snapshot||c.links.some(l=>!items.some(r=>r.id===l.requirementId)))throw new ApiError(409,'STALE_SNAPSHOT','Confirm all current requirements and ensure linked requirements are included before regenerating.');
    const active=await tx.job.findFirst({where:{projectId:c.projectId,kind:'regenerate_case',status:{in:['queued','running']},payload:{path:['caseId'],equals:c.id}}});if(active)throw new ApiError(409,'GENERATION_IN_PROGRESS','This case is already being regenerated.');
    const provider=process.env.GENERATOR_MODE||'fixture';const run=await tx.generationRun.create({data:{projectId:c.projectId,snapshotId:snapshot.id,snapshotHash:hash,idempotencyKey:randomUUID(),modelId:provider==='fixture'?'deterministic-fixture':process.env.MODEL_NAME||'external',promptVersion:'testpilot-v1',provider,types:[c.type],settings:{caseId:c.id,version},createdBy:userId}});const job=await createJob(tx,c.projectId,userId,'regenerate_case',run.id,{caseId:c.id,version});return {run,job_id:job.id};});return Response.json(result,{status:202});
  }
 }
 if(path[0]==='projects'&&path.length>=3){z.uuid().parse(path[1]);const project=await membership(path[1],userId);
  if(path[2]==='traceability'&&req.method==='GET')return Response.json(await buildTraceability(project.id));
  if(path[2]==='test-cases'&&path.length===3&&req.method==='POST'){
   const b=fields.extend({requirementIds:z.array(z.uuid()).max(10).default([])}).strict().parse(await req.json());const {steps,requirementIds,...data}=b;
   const created=await db.$transaction(async tx=>{const p=await tx.project.update({where:{id:project.id},data:{caseCounter:{increment:1},updatedBy:userId}});const ids=[...new Set(requirementIds)];if(await tx.requirement.count({where:{id:{in:ids},projectId:project.id,deletedAt:null}})!==ids.length)throw new ApiError(422,'VALIDATION_ERROR','Link requirements from this project.');const c=await tx.testCase.create({data:{...data,projectId:project.id,stableCode:`TC-${String(p.caseCounter).padStart(3,'0')}`,manual:true,createdBy:userId,updatedBy:userId,steps:{create:steps.map((s,i)=>({...s,position:i+1}))},links:{create:ids.map(requirementId=>({requirementId,createdBy:userId,rationale:'Manual case'}))}}});await tx.sourceCitation.create({data:{entityType:'test_case',entityId:c.id,inferred:true,quote:'',locator:{}}});const result=await saveCaseRevision(tx,c.id,userId,'manual case created');await audit(tx,project.id,userId,'case_created','TestCase',c.id,undefined,{version:1,manual:true});return result;});return Response.json(created,{status:201});
  }
  if(path[2]==='test-cases'&&path[3]==='bulk-review'&&req.method==='POST'){
   await requireProjectRole(project.id,userId,['ADMIN','QA_LEAD']);
   const b=z.object({cases:z.array(z.object({id:z.uuid(),version:z.number().int().positive()})).min(1).max(100),action:z.literal('approve'),note:z.string().max(5000).default('')}).strict().parse(await req.json());if(new Set(b.cases.map(c=>c.id)).size!==b.cases.length)throw new ApiError(422,'VALIDATION_ERROR','Select each case once.');
   const results=await db.$transaction(async tx=>{const results=[];for(const c of b.cases){const record=await tx.testCase.findFirst({where:{id:c.id,projectId:project.id,deletedAt:null}});if(!record)throw new ApiError(422,'VALIDATION_ERROR','Cases must belong to this project.');if(record.status!=='draft')throw new ApiError(422,'VALIDATION_ERROR','Bulk approval applies only to selected draft cases.');results.push(await review(tx,c.id,c.version,'approve',b.note,userId));}return results;},{timeout:30000});return Response.json({cases:results});
  }
 }
}
