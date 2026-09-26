import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { describe,it,expect,afterAll } from 'vitest';
import { db,DEMO_USER_ID } from '../../packages/db';
import { actor } from '../../apps/web/lib/http';
import { api,jsonRequest } from '../helpers';
afterAll(async()=>{await db.$disconnect();});
describe('workspace and request security',()=>{
 it('denies foreign-workspace reads and mutations',async()=>{const workspace=await db.workspace.create({data:{name:`Private ${randomUUID()}`,organizationId:'00000000-0000-4000-8000-000000000010'}});const project=await db.project.create({data:{workspaceId:workspace.id,name:'Private project',createdBy:DEMO_USER_ID,updatedBy:DEMO_USER_ID}});expect((await api(`/projects/${project.id}`)).status).toBe(404);expect((await api(`/projects/${project.id}/sources`,jsonRequest('POST',{text:'Private source'}))).status).toBe(404);expect(await db.sourceDocument.count({where:{projectId:project.id}})).toBe(0);});
 it('blocks cross-origin mutations and malformed input',async()=>{const response=await api('/projects',{...jsonRequest('POST',{name:'Cross-origin blocked'}),headers:{'Content-Type':'application/json',Origin:'https://untrusted.example'}});expect(response.status).toBe(403);expect((await api('/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:'invalid json'})).status).toBe(422);expect((await api('/projects/not-a-uuid')).status).toBe(422);});
 it('forbids demo authentication when the application is marked production',async()=>{const previous=process.env.APP_ENV;process.env.APP_ENV='production';try{await expect(actor(new Request('http://localhost:3000/api/v1/projects'))).rejects.toMatchObject({status:401,code:'UNAUTHORIZED'});}finally{if(previous===undefined)delete process.env.APP_ENV;else process.env.APP_ENV=previous;}});
});
