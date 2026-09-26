import { z } from 'zod';
import { db } from './db';
import { ApiError,membership } from './http';
import { audit,createJob } from './ingestion';
import { readStorage } from './storage';
export async function exportApi(req:Request,path:string[],userId:string):Promise<Response|undefined>{
 if(path[0]==='projects'&&path[2]==='exports'&&req.method==='POST'){
  z.uuid().parse(path[1]);const project=await membership(path[1],userId);const body=z.object({approved_only:z.boolean(),format:z.literal('xlsx'),idempotency_key:z.string().min(8).max(120)}).strict().parse(await req.json());
  const result=await db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${project.id}::uuid FOR UPDATE`;const prior=await tx.export.findUnique({where:{projectId_idempotencyKey:{projectId:project.id,idempotencyKey:body.idempotency_key}}});if(prior){if(prior.approvedOnly!==body.approved_only)throw new ApiError(409,'IDEMPOTENCY_CONFLICT','This key was used for different export settings.');return {export:prior,job_id:(await tx.job.findFirstOrThrow({where:{entityId:prior.id,kind:'build_export'}})).id};}
   if(await tx.export.count({where:{projectId:project.id,createdAt:{gte:new Date(Date.now()-60000)}}})>=10)throw new ApiError(429,'RATE_LIMITED','Wait a minute before requesting another export.');
   const record=await tx.export.create({data:{projectId:project.id,approvedOnly:body.approved_only,idempotencyKey:body.idempotency_key,createdBy:userId}});const job=await createJob(tx,project.id,userId,'build_export',record.id);await audit(tx,project.id,userId,'export_created','Export',record.id,undefined,{approved_only:body.approved_only});return {export:record,job_id:job.id};});return Response.json(result,{status:202});
 }
 if(path[0]==='exports'&&path[2]==='download'&&req.method==='GET'){
  z.uuid().parse(path[1]);const record=await db.export.findUnique({where:{id:path[1]}});if(!record)throw new ApiError(404,'NOT_FOUND','Export not found.');await membership(record.projectId,userId);
  if(record.status!=='succeeded'||!record.storageKey)throw new ApiError(409,'EXPORT_NOT_READY','The export is not ready. Check the job status.');if(!record.expiresAt||record.expiresAt<new Date())throw new ApiError(410,'EXPORT_EXPIRED','This export expired. Create a new export to download the latest data.');
  let buffer:Buffer;try{buffer=await readStorage(record.storageKey);}catch{throw new ApiError(410,'EXPORT_EXPIRED','The stored export is unavailable. Create a new export.');}
  return new Response(new Uint8Array(buffer),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(record.filename||'TestPilot.xlsx')}`,'Cache-Control':'private, no-store','Content-Length':String(buffer.length)}});
 }
}
