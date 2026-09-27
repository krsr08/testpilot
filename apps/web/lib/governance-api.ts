import {z} from 'zod';
import {db} from './db';
import {ApiError,membership} from './http';

const uuid=z.string().uuid();
const managerRoles=['ADMIN','QA_LEAD'] as const;

export async function governanceApi(req:Request,path:string[],userId:string):Promise<Response|undefined>{
 const url=new URL(req.url);
 if(path[0]==='search'&&req.method==='GET'){
  const query=z.string().trim().min(2).max(120).parse(url.searchParams.get('q'));const member=await db.membership.findFirst({where:{userId}});if(!member)throw new ApiError(403,'FORBIDDEN','Workspace access required.');const access=[{createdBy:userId},{visibility:'WORKSPACE'},{members:{some:{userId}}}];const projectWhere={workspaceId:member.workspaceId,OR:access};const [projects,requirements,cases]=await Promise.all([db.project.findMany({where:{workspaceId:member.workspaceId,AND:[{OR:access},{OR:[{name:{contains:query,mode:'insensitive'}},{description:{contains:query,mode:'insensitive'}},{domain:{contains:query,mode:'insensitive'}}]}]},take:20,select:{id:true,name:true,description:true}}),db.requirement.findMany({where:{project:projectWhere,deletedAt:null,OR:[{stableCode:{contains:query,mode:'insensitive'}},{text:{contains:query,mode:'insensitive'}}]},take:20,select:{id:true,projectId:true,stableCode:true,text:true,project:{select:{name:true}}}}),db.testCase.findMany({where:{project:projectWhere,deletedAt:null,OR:[{stableCode:{contains:query,mode:'insensitive'}},{title:{contains:query,mode:'insensitive'}}]},take:20,select:{id:true,projectId:true,stableCode:true,title:true,project:{select:{name:true}}}})]);return Response.json({query,projects,requirements,cases});
 }
 if(path[0]==='notifications'){
  if(req.method==='GET')return Response.json({notifications:await db.notification.findMany({where:{userId},orderBy:{createdAt:'desc'},take:50}),unread:await db.notification.count({where:{userId,readAt:null}})});
  if(req.method==='PATCH'){const body=z.object({id:uuid.optional(),all:z.boolean().optional()}).strict().parse(await req.json());await db.notification.updateMany({where:{userId,...(body.id?{id:body.id}:{}),readAt:null},data:{readAt:new Date()}});return Response.json({updated:true});}
 }
 if(path[0]==='profile'&&path[1]==='preferences'){
  if(req.method==='GET')return Response.json(await db.userPreference.upsert({where:{userId},update:{},create:{userId}}));
  if(req.method==='PATCH'){const body=z.object({timezone:z.string().min(1).max(80),locale:z.string().min(2).max(20),dateFormat:z.enum(['short','medium','long']),emailNotifications:z.boolean(),inAppNotifications:z.boolean(),reducedMotion:z.boolean()}).strict().parse(await req.json());return Response.json(await db.userPreference.upsert({where:{userId},update:body,create:{userId,...body}}));}
 }
 if(path[0]==='projects'&&path[2]==='members'){
  const projectId=uuid.parse(path[1]);const project=await membership(projectId,userId);
  if(req.method==='GET'){const members=await db.projectMember.findMany({where:{projectId},include:{user:{select:{id:true,name:true,email:true}}},orderBy:{createdAt:'asc'}});const workspace=await db.membership.findMany({where:{workspaceId:project.workspaceId},include:{user:{select:{id:true,name:true,email:true}}}});return Response.json({ownerId:project.createdBy,visibility:project.visibility,members,available:workspace.map(m=>({...m.user,workspaceRole:m.role})).filter(u=>u.id!==project.createdBy&&!members.some(m=>m.userId===u.id))});}
  await membership(projectId,userId,[...managerRoles]);if(project.createdBy!==userId)throw new ApiError(403,'FORBIDDEN','Only the project owner can manage project access.');
  if(req.method==='POST'){const body=z.object({userId:uuid,role:z.enum(['MANAGER','CONTRIBUTOR','VIEWER']).default('CONTRIBUTOR')}).strict().parse(await req.json());const workspaceMember=await db.membership.findUnique({where:{workspaceId_userId:{workspaceId:project.workspaceId,userId:body.userId}}});if(!workspaceMember)throw new ApiError(422,'VALIDATION_ERROR','The selected user is not a workspace member.');const saved=await db.projectMember.upsert({where:{projectId_userId:{projectId,userId:body.userId}},update:{role:body.role},create:{projectId,userId:body.userId,role:body.role,addedBy:userId}});await db.notification.create({data:{userId:body.userId,kind:'PROJECT_ACCESS',title:'Project shared with you',message:`You now have ${body.role.toLowerCase()} access to ${project.name}.`,href:`/projects/${projectId}`}});return Response.json(saved,{status:201});}
  if(req.method==='DELETE'){const memberId=uuid.parse(url.searchParams.get('userId'));await db.projectMember.delete({where:{projectId_userId:{projectId,userId:memberId}}});return Response.json({deleted:true});}
 }
 if(path[0]==='projects'&&path[2]==='test-plans'){
  const projectId=uuid.parse(path[1]);await membership(projectId,userId);
  if(req.method==='GET'){const plans=await db.testPlan.findMany({where:{projectId},orderBy:{updatedAt:'desc'},include:{cycles:{orderBy:{createdAt:'desc'},include:{executions:{include:{testCase:{select:{stableCode:true,title:true}}}}}}}});const cases=await db.testCase.findMany({where:{projectId,deletedAt:null,status:'approved'},select:{id:true,stableCode:true,title:true},orderBy:{stableCode:'asc'}});return Response.json({plans,cases});}
  await membership(projectId,userId,[...managerRoles]);if(req.method==='POST'){const body=z.object({name:z.string().trim().min(2).max(120),description:z.string().max(1000).default(''),releaseName:z.string().max(120).default('')}).strict().parse(await req.json());return Response.json(await db.testPlan.create({data:{projectId,createdBy:userId,...body}}),{status:201});}
 }
 if(path[0]==='test-plans'&&path[2]==='cycles'&&req.method==='POST'){
  const plan=await db.testPlan.findUnique({where:{id:uuid.parse(path[1])}});if(!plan)throw new ApiError(404,'NOT_FOUND','Test plan not found.');await membership(plan.projectId,userId,[...managerRoles]);const body=z.object({name:z.string().trim().min(2).max(120),environment:z.string().trim().min(1).max(80),testCaseIds:z.array(uuid).min(1).max(500)}).strict().parse(await req.json());const valid=await db.testCase.findMany({where:{projectId:plan.projectId,id:{in:body.testCaseIds},deletedAt:null},select:{id:true}});if(valid.length!==new Set(body.testCaseIds).size)throw new ApiError(422,'VALIDATION_ERROR','One or more cases are unavailable.');const cycle=await db.testCycle.create({data:{testPlanId:plan.id,name:body.name,environment:body.environment,executions:{create:valid.map(item=>({testCaseId:item.id}))}},include:{executions:true}});return Response.json(cycle,{status:201});
 }
 if(path[0]==='test-executions'&&path.length===2&&req.method==='PATCH'){
  const execution=await db.testExecution.findUnique({where:{id:uuid.parse(path[1])},include:{testCycle:{include:{testPlan:true}}}});if(!execution)throw new ApiError(404,'NOT_FOUND','Execution not found.');await membership(execution.testCycle.testPlan.projectId,userId);const body=z.object({status:z.enum(['NOT_RUN','PASSED','FAILED','BLOCKED','SKIPPED']),notes:z.string().max(5000).default('')}).strict().parse(await req.json());const saved=await db.testExecution.update({where:{id:execution.id},data:{...body,executedBy:userId,executedAt:body.status==='NOT_RUN'?null:new Date()}});return Response.json(saved);
 }
 if(path[0]==='projects'&&path[2]==='operations'&&req.method==='GET'){
  const projectId=uuid.parse(path[1]);await membership(projectId,userId,[...managerRoles]);const [jobs,runs,exports]=await Promise.all([db.job.findMany({where:{projectId},orderBy:{createdAt:'desc'},take:100}),db.generationRun.findMany({where:{projectId},orderBy:{createdAt:'desc'},take:50}),db.export.findMany({where:{projectId},orderBy:{createdAt:'desc'},take:50})]);return Response.json({jobs,runs,exports,summary:{queued:jobs.filter(j=>j.status==='queued').length,running:jobs.filter(j=>j.status==='running').length,failed:jobs.filter(j=>j.status==='failed').length,succeeded:jobs.filter(j=>j.status==='succeeded').length}});
 }
}
