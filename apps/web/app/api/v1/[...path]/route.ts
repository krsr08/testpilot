import { z } from 'zod';
import { db } from '../../../../lib/db';
import { actor, ApiError, failure, membership, boundedRequest } from '../../../../lib/http';
import { ingestion } from '../../../../lib/ingestion';
import { generationApi } from '../../../../lib/generation-api';
import { reviewApi } from '../../../../lib/review-api';
import { exportApi } from '../../../../lib/export-api';
import { jiraApi } from '../../../../lib/jira-api';
import { enterpriseApi } from '../../../../lib/enterprise-api';
import { buildDocument } from '../../../../lib/document-builder';
import { authoringApi } from '../../../../lib/authoring-api';
import { intelligenceApi } from '../../../../lib/intelligence-api';
import { billingApi } from '../../../../lib/billing-api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function handle(req: Request, context: {params:Promise<{path:string[]}>}) {
 try {
  const user=await actor(req); const {path}=await context.params; const url=new URL(req.url);
  req=await boundedRequest(req);
  const enterprise=await enterpriseApi(req,path,user.id);if(enterprise)return enterprise;
  const billing=await billingApi(req,path,user.id);if(billing)return billing;
  if(path[0]==='document-builder'&&path.length===1&&req.method==='POST')return Response.json(await buildDocument(await req.json()));
  const authored=await authoringApi(req,path,user.id);if(authored)return authored;
  const intelligent=await intelligenceApi(req,path,user.id);if(intelligent)return intelligent;
  const jira=await jiraApi(req,path,user.id);if(jira)return jira;
  const exported=await exportApi(req,path,user.id);if(exported)return exported;
  const reviewed=await reviewApi(req,path,user.id);if(reviewed)return reviewed;
  const generated=await generationApi(req,path,user.id);if(generated)return generated;
  const ingested=await ingestion(req,path,user.id);if(ingested)return ingested;
  if(path[0]==='projects' && path.length===1) {
   const member=await db.membership.findFirst({where:{userId:user.id},include:{workspace:true}});
   if(!member) throw new ApiError(403,'FORBIDDEN','Workspace access required.');
   if(req.method==='POST') {
    if(member.role==='VIEWER')throw new ApiError(403,'FORBIDDEN','Viewer access cannot create projects.');
    const data=z.object({name:z.string().trim().min(1).max(120),description:z.string().max(2000).default(''),domain:z.string().max(120).default(''),type:z.enum(['APPLICATION','API','MOBILE','DATA','INTEGRATION','MIGRATION','OTHER']).default('APPLICATION')}).strict().parse(await req.json());
    const project=await db.$transaction(async tx=>{const p=await tx.project.create({data:{...data,workspaceId:member.workspaceId,createdBy:user.id,updatedBy:user.id}});await tx.auditEvent.create({data:{projectId:p.id,actorId:user.id,action:'project_created',entityType:'Project',entityId:p.id,afterJson:{name:p.name}}});return p;});
    return Response.json(project,{status:201});
   }
   if(req.method!=='GET')throw new ApiError(405,'METHOD_NOT_ALLOWED','Use GET or POST for projects.');
   const limit=z.coerce.number().int().min(1).max(100).default(100).parse(url.searchParams.get('limit')??undefined);const cursor=url.searchParams.get('cursor');if(cursor)z.uuid().parse(cursor);const type=url.searchParams.get('type');if(type&&type!=='all')z.enum(['APPLICATION','API','MOBILE','DATA','INTEGRATION','MIGRATION','OTHER']).parse(type);const status=z.enum(['all','empty','in-progress','review-ready']).default('all').parse(url.searchParams.get('status')||'all');const sort=z.enum(['updated-desc','updated-asc','name-asc','name-desc']).default('updated-desc').parse(url.searchParams.get('sort')||'updated-desc');const orderBy=sort==='name-asc'?{name:'asc' as const}:sort==='name-desc'?{name:'desc' as const}:sort==='updated-asc'?{updatedAt:'asc' as const}:{updatedAt:'desc' as const};
   const query=url.searchParams.get('search')||'';const statusFilter=status==='empty'?{sources:{none:{}},requirements:{none:{}},testCases:{none:{}}}:status==='review-ready'?{testCases:{some:{status:'approved'}}}:status==='in-progress'?{OR:[{sources:{some:{}}},{requirements:{some:{}}},{testCases:{some:{}}}]}:{};
   const projects=await db.project.findMany({where:{workspaceId:member.workspaceId,createdBy:user.id,...(type&&type!=='all'?{type}:{}),AND:[{OR:[{name:{contains:query,mode:'insensitive'}},{description:{contains:query,mode:'insensitive'}},{domain:{contains:query,mode:'insensitive'}}]},statusFilter]},take:limit+1,...(cursor?{cursor:{id:cursor},skip:1}:{}),orderBy,include:{_count:{select:{sources:{where:{deletedAt:null}},requirements:{where:{deletedAt:null}},testCases:{where:{deletedAt:null}}}}}});
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
