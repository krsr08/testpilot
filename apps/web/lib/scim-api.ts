import {createHash,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {db} from './db';

const userSchema='urn:ietf:params:scim:schemas:core:2.0:User';
const listSchema='urn:ietf:params:scim:api:messages:2.0:ListResponse';
const patchSchema='urn:ietf:params:scim:api:messages:2.0:PatchOp';
const errorSchema='urn:ietf:params:scim:api:messages:2.0:Error';
const roles=['ADMIN','QA_LEAD','TESTER','VIEWER'] as const;
const roleSchema=z.enum(roles);

function scimError(status:number,detail:string,scimType?:string){return Response.json({schemas:[errorSchema],status:String(status),detail,...(scimType?{scimType}:{})},{status,headers:{'Content-Type':'application/scim+json'}});}
function secureEqual(left:string,right:string){const a=createHash('sha256').update(left).digest(),b=createHash('sha256').update(right).digest();return timingSafeEqual(a,b);}
async function authorize(req:Request){const expected=process.env.SCIM_BEARER_TOKEN,workspaceId=process.env.SCIM_WORKSPACE_ID;if(!expected||expected.length<32||!workspaceId)throw new Error('SCIM_NOT_CONFIGURED');const supplied=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||'';if(!supplied||!secureEqual(supplied,expected))throw new Error('SCIM_UNAUTHORIZED');const workspace=await db.workspace.findUnique({where:{id:workspaceId}});if(!workspace)throw new Error('SCIM_WORKSPACE_NOT_FOUND');return workspace;}
type Provisioned=Awaited<ReturnType<typeof loadUser>>;
async function loadUser(id:string,workspaceId:string){return db.user.findFirst({where:{id,memberships:{some:{workspaceId}}},include:{memberships:{where:{workspaceId},select:{role:true}}}});}
function resource(user:NonNullable<Provisioned>,base:string){return {schemas:[userSchema],id:user.id,externalId:user.externalId||undefined,userName:user.email,displayName:user.name,name:{formatted:user.name},active:user.active,roles:[{value:user.memberships[0]?.role||'TESTER',primary:true}],meta:{resourceType:'User',created:user.createdAt,lastModified:user.updatedAt,location:`${base}/Users/${user.id}`}};}
const createInput=z.object({schemas:z.array(z.string()).optional(),externalId:z.string().trim().min(1).max(255).optional(),userName:z.string().email().transform(v=>v.toLowerCase()),displayName:z.string().trim().min(1).max(120).optional(),name:z.object({formatted:z.string().trim().min(1).max(120).optional(),givenName:z.string().trim().max(60).optional(),familyName:z.string().trim().max(60).optional()}).optional(),active:z.boolean().default(true),roles:z.array(z.object({value:roleSchema})).max(1).optional()}).passthrough();
function nameOf(input:z.infer<typeof createInput>){return input.displayName||input.name?.formatted||[input.name?.givenName,input.name?.familyName].filter(Boolean).join(' ')||input.userName.split('@')[0];}

export async function scimApi(req:Request,path:string[]){
 let workspace;try{workspace=await authorize(req);}catch(error){const code=(error as Error).message;if(code==='SCIM_UNAUTHORIZED')return scimError(401,'Invalid SCIM bearer token.');if(code==='SCIM_NOT_CONFIGURED')return scimError(503,'SCIM provisioning is not configured.');return scimError(503,'The configured SCIM workspace is unavailable.');}
 const base=new URL('/api/scim/v2',req.url).toString().replace(/\/$/,'');
 if(path[0]==='ServiceProviderConfig'&&req.method==='GET')return Response.json({schemas:['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],patch:{supported:true},bulk:{supported:false,maxOperations:0,maxPayloadSize:0},filter:{supported:true,maxResults:100},changePassword:{supported:false},sort:{supported:false},etag:{supported:false},authenticationSchemes:[{type:'oauthbearertoken',name:'Bearer token',description:'Static workspace-scoped bearer token',specUri:'https://www.rfc-editor.org/rfc/rfc6750',primary:true}]},{headers:{'Content-Type':'application/scim+json'}});
 if(path[0]!=='Users')return scimError(404,'SCIM resource not found.');
 if(path.length===1&&req.method==='GET'){
  const url=new URL(req.url),filter=url.searchParams.get('filter')||'',match=/^userName\s+eq\s+"([^"]+)"$/i.exec(filter),start=Math.max(1,Number(url.searchParams.get('startIndex')||1)),count=Math.min(100,Math.max(1,Number(url.searchParams.get('count')||100)));
  if(filter&&!match)return scimError(400,'Only the filter userName eq "value" is supported.','invalidFilter');
  const where={memberships:{some:{workspaceId:workspace.id}},...(match?{email:match[1].toLowerCase()}:{})};const [total,users]=await Promise.all([db.user.count({where}),db.user.findMany({where,include:{memberships:{where:{workspaceId:workspace.id},select:{role:true}}},orderBy:{email:'asc'},skip:start-1,take:count})]);
  return Response.json({schemas:[listSchema],totalResults:total,startIndex:start,itemsPerPage:users.length,Resources:users.map(u=>resource(u,base))},{headers:{'Content-Type':'application/scim+json'}});
 }
 if(path.length===1&&req.method==='POST'){
  let input;try{input=createInput.parse(await req.json());}catch{return scimError(400,'The SCIM user payload is invalid.','invalidValue');}
  const existing=await db.user.findFirst({where:{OR:[{email:input.userName},...(input.externalId?[{externalId:input.externalId}]:[])]}});if(existing&&await db.membership.findUnique({where:{workspaceId_userId:{workspaceId:workspace.id,userId:existing.id}}}))return scimError(409,'A user with this userName or externalId already exists.','uniqueness');
  try{const user=await db.$transaction(async tx=>{const row=existing?await tx.user.update({where:{id:existing.id},data:{email:input.userName,name:nameOf(input),externalId:input.externalId,active:input.active,deactivatedAt:input.active?null:new Date(),provisioningSource:'SCIM'}}):await tx.user.create({data:{email:input.userName,name:nameOf(input),externalId:input.externalId,active:input.active,deactivatedAt:input.active?null:new Date(),provisioningSource:'SCIM'}});await tx.membership.upsert({where:{workspaceId_userId:{workspaceId:workspace.id,userId:row.id}},update:{role:input.roles?.[0]?.value||'TESTER'},create:{workspaceId:workspace.id,userId:row.id,role:input.roles?.[0]?.value||'TESTER'}});return tx.user.findUnique({where:{id:row.id},include:{memberships:{where:{workspaceId:workspace.id},select:{role:true}}}});});return Response.json(resource(user!,base),{status:201,headers:{'Content-Type':'application/scim+json',Location:`${base}/Users/${user!.id}`}});}catch{return scimError(409,'A user with this userName or externalId already exists.','uniqueness');}
 }
 const id=path[1];if(!id)return scimError(404,'SCIM user not found.');const user=await loadUser(id,workspace.id);if(!user)return scimError(404,'SCIM user not found.');
 if(req.method==='GET')return Response.json(resource(user,base),{headers:{'Content-Type':'application/scim+json'}});
 if(req.method==='DELETE'){await db.user.update({where:{id:user.id},data:{active:false,deactivatedAt:new Date(),provisioningSource:'SCIM'}});return new Response(null,{status:204});}
 if(req.method==='PATCH'){
  const body=await req.json().catch(()=>null),parsed=z.object({schemas:z.array(z.string()),Operations:z.array(z.object({op:z.string(),path:z.string().optional(),value:z.unknown().optional()})).min(1).max(20)}).safeParse(body);if(!parsed.success||!parsed.data.schemas.includes(patchSchema))return scimError(400,'The SCIM patch payload is invalid.','invalidSyntax');
  let email=user.email,name=user.name,active=user.active,role=user.memberships[0]?.role||'TESTER';
  try{for(const operation of parsed.data.Operations){if(!['replace','add'].includes(operation.op.toLowerCase()))return scimError(400,`Unsupported patch operation ${operation.op}.`,'invalidValue');const path=(operation.path||'').toLowerCase();if(path==='active')active=z.boolean().parse(operation.value);else if(path==='username')email=z.string().email().parse(operation.value).toLowerCase();else if(path==='displayname'||path==='name.formatted')name=z.string().trim().min(1).max(120).parse(operation.value);else if(path==='roles'||path==='roles[primary eq true].value'){const value=Array.isArray(operation.value)?(operation.value[0] as {value?:unknown})?.value:operation.value;role=roleSchema.parse(value);}else return scimError(400,`Unsupported patch path ${operation.path||'(none)'}.`,'invalidPath');}}catch{return scimError(400,'The SCIM patch value is invalid.','invalidValue');}
  try{await db.$transaction([db.user.update({where:{id:user.id},data:{email,name,active,deactivatedAt:active?null:(user.deactivatedAt||new Date()),provisioningSource:'SCIM'}}),db.membership.update({where:{workspaceId_userId:{workspaceId:workspace.id,userId:user.id}},data:{role}})]);}catch{return scimError(409,'The requested identity conflicts with an existing user.','uniqueness');}const saved=await loadUser(user.id,workspace.id);return Response.json(resource(saved!,base),{headers:{'Content-Type':'application/scim+json'}});
 }
 return scimError(405,'Method not allowed.');
}
