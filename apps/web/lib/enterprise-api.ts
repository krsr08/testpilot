import { db } from './db';
import { ApiError } from './http';

export async function enterpriseApi(req:Request,path:string[],userId:string):Promise<Response|undefined>{
 if(path[0]!=='enterprise'||req.method!=='GET')return;
 const membership=await db.membership.findFirst({where:{userId},include:{user:true,workspace:{include:{organization:{include:{integrations:true}},memberships:{include:{user:true}},projects:{select:{id:true,name:true}}}}}});
 if(!membership)throw new ApiError(403,'FORBIDDEN','Workspace access required.');
 const projectIds=membership.workspace.projects.map(project=>project.id);
 const [sources,requirements,testCases,approvedCases,audit]=await Promise.all([
  db.sourceDocument.count({where:{projectId:{in:projectIds},deletedAt:null}}),db.requirement.count({where:{projectId:{in:projectIds},deletedAt:null}}),db.testCase.count({where:{projectId:{in:projectIds},deletedAt:null}}),db.testCase.count({where:{projectId:{in:projectIds},deletedAt:null,status:'approved'}}),db.auditEvent.findMany({where:{projectId:{in:projectIds}},orderBy:{createdAt:'desc'},take:100,include:{project:{select:{name:true}}}})
 ]);
 return Response.json({user:{id:membership.user.id,name:membership.user.name,email:membership.user.email,externalSubject:membership.user.externalSubject,createdAt:membership.user.createdAt},role:membership.role,workspace:{id:membership.workspace.id,name:membership.workspace.name,createdAt:membership.workspace.createdAt},organization:{id:membership.workspace.organization.id,name:membership.workspace.organization.name,slug:membership.workspace.organization.slug,ssoDomain:membership.workspace.organization.ssoDomain},members:membership.workspace.memberships.map(item=>({id:item.user.id,name:item.user.name,email:item.user.email,role:item.role,joinedAt:item.user.createdAt})),integrations:membership.workspace.organization.integrations.map(item=>({id:item.id,kind:item.kind,name:item.name,baseUrl:item.baseUrl,projectKey:item.projectKey,enabled:item.enabled,updatedAt:item.updatedAt})),counts:{projects:projectIds.length,sources,requirements,testCases,approvedCases,members:membership.workspace.memberships.length},audit:audit.map(item=>({id:item.id,action:item.action,entityType:item.entityType,entityId:item.entityId,project:item.project.name,actorId:item.actorId,createdAt:item.createdAt}))});
}
