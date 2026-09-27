import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { db } from './db';
import { createRemoteJWKSet, jwtVerify } from 'jose';
export class ApiError extends Error { constructor(public status: number, public code: string, message: string, public fields: unknown = {}) { super(message); } }
export async function boundedRequest(req:Request) {
  if(!req.body||['GET','HEAD'].includes(req.method))return req;
  const max=req.headers.get('content-type')?.includes('multipart/form-data')?11*1024*1024:1024*1024;
  if(Number(req.headers.get('content-length')||0)>max)throw new ApiError(422,'VALIDATION_ERROR','Request is too large. Files must be at most 10 MB.');
  const reader=req.body.getReader(),parts:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new ApiError(422,'VALIDATION_ERROR','Request is too large. Files must be at most 10 MB.');}parts.push(value);}
  return new Request(req.url,{method:req.method,headers:req.headers,body:Buffer.concat(parts)});
}
export async function actor(req: Request) {
  const origin=req.headers.get('origin');
  if(!['GET','HEAD'].includes(req.method) && origin && origin !== new URL(process.env.APP_URL || 'http://localhost:3000').origin) throw new ApiError(403,'FORBIDDEN','Origin is not allowed.');
  if(process.env.DEMO_AUTH==='true' && process.env.APP_ENV!=='production') {
    const user=await db.user.findFirst({where:{email:'demo@testpilot.local'}});
    if(!user) throw new ApiError(503,'NOT_SEEDED','Run the database seed before using the app.');
    return user;
  }
  const value=req.headers.get('authorization');
  if(!value?.startsWith('Bearer '))throw new ApiError(401,'UNAUTHORIZED','A valid enterprise identity token is required.');
  const issuer=process.env.OIDC_ISSUER, audience=process.env.OIDC_AUDIENCE, jwks=process.env.OIDC_JWKS_URL;
  if(!issuer||!audience||!jwks)throw new ApiError(503,'AUTH_NOT_CONFIGURED','OIDC authentication is not configured.');
  let payload;
  try { payload=(await jwtVerify(value.slice(7),createRemoteJWKSet(new URL(jwks)),{issuer,audience})).payload; }
  catch { throw new ApiError(401,'UNAUTHORIZED','The identity token is invalid or expired.'); }
  const subject=String(payload.sub||''),email=String(payload.email||'').toLowerCase(),name=String(payload.name||email);
  if(!subject||!email)throw new ApiError(401,'UNAUTHORIZED','The identity token must contain subject and email claims.');
  const user=await db.user.findFirst({where:{OR:[{externalSubject:subject},{email}]}});
  if(!user) throw new ApiError(503,'NOT_SEEDED','Run the database seed before using the app.');
  if(user.externalSubject&&user.externalSubject!==subject)throw new ApiError(403,'FORBIDDEN','This identity is already bound to another account.');
  return user.externalSubject?user:db.user.update({where:{id:user.id},data:{externalSubject:subject,name}});
}
export async function membership(projectId: string,userId: string,roles?:Array<'ADMIN'|'QA_LEAD'|'TESTER'|'VIEWER'>) {
  const project=await db.project.findFirst({where:{id:projectId,createdBy:userId,workspace:{memberships:{some:{userId,...(roles?{role:{in:roles}}:{})}}}}});
  if(!project) throw new ApiError(404,'NOT_FOUND','Project not found.');
  return project;
}
export async function requireProjectRole(projectId:string,userId:string,roles:Array<'ADMIN'|'QA_LEAD'|'TESTER'|'VIEWER'>){return membership(projectId,userId,roles);}
export function failure(error: unknown, requestId = randomUUID()) {
  if(error instanceof SyntaxError) return Response.json({code:'VALIDATION_ERROR',message:'Provide valid JSON.',field_errors:{body:['Invalid JSON']},request_id:requestId},{status:422});
  if(error instanceof ZodError) return Response.json({code:'VALIDATION_ERROR',message:'Check the highlighted fields.',field_errors:error.flatten(),request_id:requestId},{status:422});
  if(error instanceof ApiError) return Response.json({code:error.code,message:error.message,field_errors:error.fields,request_id:requestId},{status:error.status});
  const code=(error as {code?:string})?.code;
  if(code==='P2002') return Response.json({code:'CONFLICT',message:'This value already exists.',field_errors:{},request_id:requestId},{status:409});
  console.error(JSON.stringify({request_id:requestId,error_category:code || 'internal',error_message:error instanceof Error?error.message:'unknown'}));
  return Response.json({code:'INTERNAL_ERROR',message:'The request failed. Retry or check service health.',field_errors:{},request_id:requestId},{status:500});
}
