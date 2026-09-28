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
import { governanceApi } from '../../../../lib/governance-api';
import { enforceRateLimit } from '../../../../lib/rate-limit';
import { storyApi } from '../../../../lib/story-api';
import { agentApi } from '../../../../lib/agent-api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function handle(req: Request, context: {params:Promise<{path:string[]}>}) {
 try {
  const user=await actor(req); await enforceRateLimit(req,user.id); const {path}=await context.params; const url=new URL(req.url);
  req=await boundedRequest(req);
  const enterprise=await enterpriseApi(req,path,user.id);if(enterprise)return enterprise;
  const billing=await billingApi(req,path,user.id);if(billing)return billing;
  const governed=await governanceApi(req,path,user.id);if(governed)return governed;
  const stories=await storyApi(req,path,user.id);if(stories)return stories;
  const agents=await agentApi(req,path,user.id);if(agents)return agents;
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
    const data=z.object({name:z.string().trim().min(1).max(120),description:z.string().max(2000).default(''),domain:z.string().max(120).default(''),type:z.enum(['APPLICATION','API','MOBILE','DATA','INTEGRATION','MIGRATION','OTHER']).default('APPLICATION'),visibility:z.enum(['PRIVATE','WORKSPACE']).default('PRIVATE')}).strict().parse(await req.json());
    const project=await db.$transaction(async tx=>{const p=await tx.project.create({data:{...data,workspaceId:member.workspaceId,createdBy:user.id,updatedBy:user.id}});await tx.auditEvent.create({data:{projectId:p.id,actorId:user.id,action:'project_created',entityType:'Project',entityId:p.id,afterJson:{name:p.name}}});return p;});
    return Response.json(project,{status:201});
   }
   if(req.method!=='GET')throw new ApiError(405,'METHOD_NOT_ALLOWED','Use GET or POST for projects.');
   const limit=z.coerce.number().int().min(1).max(100).default(24).parse(url.searchParams.get('limit')??undefined);const page=z.coerce.number().int().min(1).default(1).parse(url.searchParams.get('page')??undefined);const type=url.searchParams.get('type');if(type&&type!=='all')z.enum(['APPLICATION','API','MOBILE','DATA','INTEGRATION','MIGRATION','OTHER']).parse(type);const status=z.enum(['all','empty','in-progress','review-ready','ACTIVE','ON_HOLD','COMPLETED','ARCHIVED']).default('all').parse(url.searchParams.get('status')||'all');const scope=z.enum(['mine','shared','workspace']).default('mine').parse(url.searchParams.get('scope')||'mine');const sort=z.enum(['updated-desc','updated-asc','name-asc','name-desc']).default('updated-desc').parse(url.searchParams.get('sort')||'updated-desc');const orderBy=sort==='name-asc'?[{name:'asc' as const},{id:'asc' as const}]:sort==='name-desc'?[{name:'desc' as const},{id:'desc' as const}]:sort==='updated-asc'?[{updatedAt:'asc' as const},{id:'asc' as const}]:[{updatedAt:'desc' as const},{id:'desc' as const}];
   const query=url.searchParams.get('search')||'';const progressFilter=status==='empty'?{sources:{none:{}},requirements:{none:{}},testCases:{none:{}}}:status==='review-ready'?{testCases:{some:{status:'approved'}}}:status==='in-progress'?{OR:[{sources:{some:{}}},{requirements:{some:{}}},{testCases:{some:{}}}]}:status!=='all'?{lifecycle:status}:{};const accessFilter=scope==='mine'?{createdBy:user.id}:scope==='shared'?{members:{some:{userId:user.id}}}:{OR:[{createdBy:user.id},{visibility:'WORKSPACE'},{members:{some:{userId:user.id}}}]};
   const where={workspaceId:member.workspaceId,...accessFilter,...(type&&type!=='all'?{type}:{}),AND:[{OR:[{name:{contains:query,mode:'insensitive' as const}},{description:{contains:query,mode:'insensitive' as const}},{domain:{contains:query,mode:'insensitive' as const}}]},progressFilter]};
   const [total,projects]=await Promise.all([db.project.count({where}),db.project.findMany({where,take:limit,skip:(page-1)*limit,orderBy,include:{_count:{select:{sources:{where:{deletedAt:null}},requirements:{where:{deletedAt:null}},testCases:{where:{deletedAt:null}},userStories:true}}}})]);
   const ids=projects.map(p=>p.id),grouped=ids.length?await db.testCase.groupBy({by:['projectId','status'],where:{projectId:{in:ids},deletedAt:null,status:{in:['approved','draft']}},_count:{_all:true}}):[];const countMap=new Map(grouped.map(row=>[`${row.projectId}:${row.status}`,row._count._all]));
   return Response.json({projects:projects.map(p=>({...p,approvedCount:countMap.get(`${p.id}:approved`)||0,draftCount:countMap.get(`${p.id}:draft`)||0})),page,page_size:limit,total,total_pages:Math.ceil(total/limit)});
  }
  if(path[0]==='projects'&&path.length===2&&['PATCH','DELETE'].includes(req.method)){
   z.uuid().parse(path[1]);const project=await membership(path[1],user.id,['ADMIN','QA_LEAD']);
   if(project.createdBy!==user.id)throw new ApiError(403,'FORBIDDEN','Only the project owner can change lifecycle and sharing settings.');
   const before={name:project.name,lifecycle:project.lifecycle,visibility:project.visibility,risk:project.risk,releaseName:project.releaseName,tags:project.tags};
   const data=req.method==='DELETE'?{lifecycle:'ARCHIVED' as const,archivedAt:new Date()}:z.object({name:z.string().trim().min(1).max(120).optional(),description:z.string().max(2000).optional(),domain:z.string().max(120).optional(),lifecycle:z.enum(['ACTIVE','ON_HOLD','COMPLETED','ARCHIVED']).optional(),visibility:z.enum(['PRIVATE','WORKSPACE']).optional(),risk:z.enum(['LOW','MEDIUM','HIGH','CRITICAL']).optional(),releaseName:z.string().max(120).optional(),tags:z.array(z.string().trim().min(1).max(40)).max(20).optional(),version:z.number().int().positive()}).strict().parse(await req.json());
   if('version'in data&&data.version!==project.version)throw new ApiError(409,'VERSION_CONFLICT','Project settings changed. Reload before saving.',{current_version:project.version});
   const saved=await db.$transaction(async tx=>{const p=await tx.project.update({where:{id:project.id},data:{...data,version:{increment:1},updatedBy:user.id}});await tx.auditEvent.create({data:{projectId:p.id,actorId:user.id,action:req.method==='DELETE'?'project_archived':'project_settings_updated',entityType:'Project',entityId:p.id,beforeJson:before,afterJson:{name:p.name,lifecycle:p.lifecycle,visibility:p.visibility,risk:p.risk,releaseName:p.releaseName,tags:p.tags}}});return p;});return Response.json(saved);
  }
  if(path[0]==='projects'&&path.length===2&&req.method==='GET') {
   z.uuid().parse(path[1]);await membership(path[1],user.id);
   const project=await db.project.findUniqueOrThrow({where:{id:path[1]},include:{_count:{select:{sources:{where:{deletedAt:null}},requirements:{where:{deletedAt:null}},testCases:{where:{deletedAt:null}},userStories:true}},sources:{where:{deletedAt:null},orderBy:{createdAt:'desc'}},auditEvents:{take:15,orderBy:{createdAt:'desc'}}}});
   const [approvedCount,draftCount,confirmedRequirements,exports]=await Promise.all([db.testCase.count({where:{projectId:project.id,deletedAt:null,status:'approved'}}),db.testCase.count({where:{projectId:project.id,deletedAt:null,status:'draft'}}),db.requirement.count({where:{projectId:project.id,deletedAt:null,included:true,status:'confirmed'}}),db.export.count({where:{projectId:project.id,status:'succeeded'}})]);
   return Response.json({...project,counts:{...project._count,approvedCount,draftCount,confirmedRequirements,exports}});
  }
  throw new ApiError(404,'NOT_FOUND','Endpoint not found.');
 }catch(error){return failure(error);}
}
export {handle as GET,handle as POST,handle as PATCH,handle as DELETE};
