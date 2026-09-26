import { z } from 'zod';
import { db } from '../../../../lib/db';
import { actor, ApiError, failure, membership, boundedRequest } from '../../../../lib/http';
import { ingestion } from '../../../../lib/ingestion';
import { generationApi } from '../../../../lib/generation-api';
import { reviewApi } from '../../../../lib/review-api';
import { exportApi } from '../../../../lib/export-api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function handle(req: Request, context: {params:Promise<{path:string[]}>}) {
 try {
  const user=await actor(req); const {path}=await context.params; const url=new URL(req.url);
  req=await boundedRequest(req);
  const exported=await exportApi(req,path,user.id);if(exported)return exported;
  const reviewed=await reviewApi(req,path,user.id);if(reviewed)return reviewed;
  const generated=await generationApi(req,path,user.id);if(generated)return generated;
  const ingested=await ingestion(req,path,user.id);if(ingested)return ingested;
  if(path[0]==='projects' && path.length===1) {
   const member=await db.membership.findFirst({where:{userId:user.id}});
   if(!member) throw new ApiError(403,'FORBIDDEN','Workspace access required.');
   if(req.method==='POST') {
    const data=z.object({name:z.string().trim().min(1).max(120),description:z.string().max(2000).default(''),domain:z.string().max(120).default('')}).strict().parse(await req.json());
    const project=await db.$transaction(async tx=>{const p=await tx.project.create({data:{...data,workspaceId:member.workspaceId,createdBy:user.id,updatedBy:user.id}});await tx.auditEvent.create({data:{projectId:p.id,actorId:user.id,action:'project_created',entityType:'Project',entityId:p.id,afterJson:{name:p.name}}});return p;});
    return Response.json(project,{status:201});
   }
   if(req.method!=='GET')throw new ApiError(405,'METHOD_NOT_ALLOWED','Use GET or POST for projects.');
   const limit=z.coerce.number().int().min(1).max(100).default(50).parse(url.searchParams.get('limit')??undefined);const cursor=url.searchParams.get('cursor');if(cursor)z.uuid().parse(cursor);
   const projects=await db.project.findMany({where:{workspaceId:member.workspaceId,name:{contains:url.searchParams.get('search')||'',mode:'insensitive'}},take:limit+1,...(cursor?{cursor:{id:cursor},skip:1}:{}),orderBy:{id:'asc'},include:{_count:{select:{sources:true,requirements:true,testCases:true}}}});
   const more=projects.length>limit; if(more)projects.pop();
   const enriched=await Promise.all(projects.map(async p=>({...p,approvedCount:await db.testCase.count({where:{projectId:p.id,status:'approved'}}),draftCount:await db.testCase.count({where:{projectId:p.id,status:'draft'}})})));
   return Response.json({projects:enriched,next_cursor:more?projects.at(-1)?.id:null});
  }
  if(path[0]==='projects'&&path.length===2&&req.method==='GET') {
   z.uuid().parse(path[1]);await membership(path[1],user.id);
   const project=await db.project.findUniqueOrThrow({where:{id:path[1]},include:{_count:{select:{sources:{where:{deletedAt:null}},requirements:{where:{deletedAt:null}},testCases:{where:{deletedAt:null}}}},sources:{where:{deletedAt:null},orderBy:{createdAt:'desc'}},auditEvents:{take:15,orderBy:{createdAt:'desc'}}}});
   const [approvedCount,draftCount,confirmedRequirements,exports]=await Promise.all([db.testCase.count({where:{projectId:project.id,deletedAt:null,status:'approved'}}),db.testCase.count({where:{projectId:project.id,deletedAt:null,status:'draft'}}),db.requirement.count({where:{projectId:project.id,deletedAt:null,included:true,status:'confirmed'}}),db.export.count({where:{projectId:project.id,status:'succeeded'}})]);
   return Response.json({...project,counts:{...project._count,approvedCount,draftCount,confirmedRequirements,exports}});
  }
  throw new ApiError(404,'NOT_FOUND','Endpoint not found.');
 }catch(error){return failure(error);}
}
export {handle as GET,handle as POST,handle as PATCH,handle as DELETE};
