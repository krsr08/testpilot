import { z } from 'zod';
import { db } from './db';
import { ApiError, requireProjectRole } from './http';
import { pullJiraCase, pushApprovedCases } from '../../../services/worker/jira';
import { saveCaseRevision } from './case-history';

export async function jiraApi(req:Request,path:string[],userId:string):Promise<Response|undefined>{
 if(path[0]!=='projects'||path[2]!=='integrations'||path[3]!=='jira'||path[4]!=='sync'||req.method!=='POST')return;
 const projectId=z.uuid().parse(path[1]);await requireProjectRole(projectId,userId,['ADMIN','QA_LEAD']);
 const body=z.object({caseIds:z.array(z.uuid()).min(1).max(100),direction:z.enum(['push','pull']).default('push')}).strict().parse(await req.json());
 const cases=await db.testCase.findMany({where:{id:{in:[...new Set(body.caseIds)]},projectId,deletedAt:null},include:{steps:{orderBy:{position:'asc'}}}});
 if(cases.length!==new Set(body.caseIds).size||body.direction==='push'&&cases.some(item=>item.status!=='approved'))throw new ApiError(422,'VALIDATION_ERROR','Every pushed case must belong to the project and be approved.');
 const baseUrl=process.env.JIRA_BASE_URL,token=process.env.JIRA_TOKEN,projectKey=process.env.JIRA_PROJECT_KEY;
 if(!baseUrl||!token||!projectKey)throw new ApiError(503,'INTEGRATION_NOT_CONFIGURED','Jira/Xray is not configured.');
 const project=await db.project.findUniqueOrThrow({where:{id:projectId},include:{workspace:true}});const integration=await db.integrationConnection.upsert({where:{organizationId_kind_name:{organizationId:project.workspace.organizationId,kind:'jira-xray',name:'default'}},create:{organizationId:project.workspace.organizationId,kind:'jira-xray',name:'default',baseUrl,projectKey,encryptedToken:'managed-by-environment'},update:{baseUrl,projectKey,enabled:true}});
 const links=await db.externalCaseLink.findMany({where:{integrationId:integration.id,testCaseId:{in:body.caseIds}}});
 if(body.direction==='pull'){const updated=[];for(const link of links){const remote=await pullJiraCase(link.externalKey,{baseUrl,token});if(!remote.title||remote.steps.length===0)throw new ApiError(422,'INVALID_REMOTE_CASE',`Jira case ${link.externalKey} has no usable title or steps.`);const saved=await db.$transaction(async tx=>{await tx.testCase.update({where:{id:link.testCaseId},data:{title:remote.title,status:'draft',stale:false,version:{increment:1},updatedBy:userId,steps:{deleteMany:{},create:remote.steps.map((step,index)=>({...step,position:index+1}))}}});const value=await saveCaseRevision(tx,link.testCaseId,userId,`Imported from Jira ${link.externalKey}`);await tx.auditEvent.create({data:{projectId,actorId:userId,action:'jira_case_imported',entityType:'TestCase',entityId:link.testCaseId,afterJson:{key:link.externalKey,version:value.version}}});return value;});updated.push(saved);}return Response.json({imported:updated});}
 const existing=Object.fromEntries(links.map(link=>[link.testCaseId,link.externalKey]));const results=await pushApprovedCases(cases,{baseUrl,token,projectKey},existing);
 await db.$transaction(async tx=>{for(const item of results){await tx.externalCaseLink.upsert({where:{testCaseId_integrationId:{testCaseId:item.testCaseId,integrationId:integration.id}},create:{testCaseId:item.testCaseId,integrationId:integration.id,externalKey:item.key,externalUrl:item.url,contentHash:item.contentHash},update:{externalKey:item.key,externalUrl:item.url,contentHash:item.contentHash,syncedAt:new Date()}});await tx.auditEvent.create({data:{projectId,actorId:userId,action:'jira_case_synced',entityType:'TestCase',entityId:item.testCaseId,afterJson:{key:item.key,url:item.url,contentHash:item.contentHash}}});}});return Response.json({synced:results});
}
