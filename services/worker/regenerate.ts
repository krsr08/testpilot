import { Prisma } from '@prisma/client';
import { db } from '../../packages/db';
import { lockedCase,saveCaseRevision } from '../../apps/web/lib/case-history';
import { snapshotSchema,validateGeneration,caseTypeSchema } from './schemas';
import { fixtureGenerate,generateExternal } from './providers';
import { ProcessingError } from './extraction';

export async function regenerateCase(jobId:string){
 const job=await db.job.findUniqueOrThrow({where:{id:jobId}}),payload=job.payload as {caseId:string,version:number};
 const run=await db.generationRun.findUniqueOrThrow({where:{id:job.entityId},include:{snapshot:true,project:true}});if(run.status==='succeeded')return;
 try{
  await db.generationRun.update({where:{id:run.id},data:{status:'running',startedAt:new Date(),error:null}});
  const current=await db.testCase.findUniqueOrThrow({where:{id:payload.caseId},include:{links:true}});if(current.version!==payload.version)throw new ProcessingError('This case changed before regeneration. Reload and retry; your edits are preserved.');
  const snapshot=snapshotSchema.parse(run.snapshot.items).filter(r=>current.links.some(l=>l.requirementId===r.id));if(snapshot.length===0)throw new ProcessingError('No linked requirements available for regeneration.');
  const types=[caseTypeSchema.parse(current.type)];const output=run.provider==='fixture'?fixtureGenerate(snapshot,types):await generateExternal(snapshot,types,run.project.domain);const validated=validateGeneration(output,snapshot,types);
  const candidates=validated.scenarios.flatMap(s=>s.cases),draft=candidates[0],steps=candidates.flatMap(c=>c.steps);if(steps.length>30)throw new ProcessingError('Regeneration produced too many steps. Reduce requirement links and retry.');
  await db.$transaction(async tx=>{await lockedCase(tx,current.id,payload.version);await tx.$queryRaw`SELECT id FROM "Requirement" WHERE "projectId"=${run.projectId}::uuid FOR UPDATE`;
   const requirements=await tx.requirement.findMany({where:{id:{in:snapshot.map(r=>r.id)}}});if(requirements.some(r=>snapshot.find(s=>s.id===r.id)?.revision!==r.revision))throw new ProcessingError('Requirements changed during regeneration. Confirm a new snapshot and retry.');
   await tx.testCase.update({where:{id:current.id},data:{title:draft.title,preconditions:draft.preconditions,testData:draft.testData,postconditions:draft.postconditions,rationale:draft.rationale,priority:draft.priority,runId:run.id,status:'draft',stale:false,version:{increment:1},updatedBy:job.createdBy}});
   await tx.testStep.deleteMany({where:{testCaseId:current.id}});await tx.testStep.createMany({data:steps.map((s,i)=>({...s,position:i+1,testCaseId:current.id}))});
   await tx.sourceCitation.deleteMany({where:{entityId:current.id,entityType:'test_case'}});await tx.sourceCitation.createMany({data:candidates.flatMap(c=>c.citations).map(c=>({entityType:'test_case',entityId:current.id,sourceId:c.inferred?null:snapshot.find(r=>r.id===c.requirementId)!.sourceId,quote:c.quote,locator:c.locator as Prisma.InputJsonValue,inferred:c.inferred}))});
   const saved=await saveCaseRevision(tx,current.id,job.createdBy,'regenerated');await tx.generationRun.update({where:{id:run.id},data:{status:'succeeded',completedAt:new Date(),error:null,warnings:run.provider==='fixture'?['Demo generation; review all inferred conditions.']:[]}});await tx.auditEvent.create({data:{projectId:run.projectId,actorId:job.createdBy,action:'case_regenerated',entityType:'TestCase',entityId:current.id,afterJson:{version:saved.version,runId:run.id}}});
  },{timeout:30000});
 }catch(error){const message=error instanceof ProcessingError?error.message:'Regeneration failed or the case changed. Reload before retrying; previous edits remain in history.';await db.generationRun.update({where:{id:run.id},data:{status:'failed',error:message,completedAt:new Date()}});throw new ProcessingError(message,{cause:error});}
}
