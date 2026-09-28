import 'dotenv/config';
import {randomUUID} from 'node:crypto';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {db} from '../../packages/db';
import {scimApi} from '../../apps/web/lib/scim-api';

const token='scim-integration-token-with-at-least-32-characters';
const workspaceId='00000000-0000-4000-8000-000000000002';
const created:string[]=[];
function request(path:string,init:RequestInit={}){return new Request(`http://localhost:3000/api/scim/v2/${path}`,{...init,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/scim+json',...init.headers}});}
beforeAll(()=>{process.env.SCIM_BEARER_TOKEN=token;process.env.SCIM_WORKSPACE_ID=workspaceId;});
afterAll(async()=>{if(created.length){await db.membership.deleteMany({where:{userId:{in:created}}});await db.user.deleteMany({where:{id:{in:created}}});}delete process.env.SCIM_BEARER_TOKEN;delete process.env.SCIM_WORKSPACE_ID;await db.$disconnect();});

describe('SCIM 2.0 provisioning',()=>{
 it('rejects an invalid provisioning token',async()=>{const response=await scimApi(new Request('http://localhost:3000/api/scim/v2/Users',{headers:{Authorization:'Bearer wrong'}}),['Users']);expect(response.status).toBe(401);});
 it('provisions, discovers, changes role, and deactivates a workspace user',async()=>{const suffix=randomUUID(),email=`scim-${suffix}@example.test`,externalId=`directory-${suffix}`;const createdResponse=await scimApi(request('Users',{method:'POST',body:JSON.stringify({schemas:['urn:ietf:params:scim:schemas:core:2.0:User'],externalId,userName:email,displayName:'SCIM Managed User',active:true,roles:[{value:'VIEWER'}]})}),['Users']);expect(createdResponse.status).toBe(201);const body=await createdResponse.json();created.push(body.id);expect(body).toMatchObject({externalId,userName:email,displayName:'SCIM Managed User',active:true,roles:[{value:'VIEWER',primary:true}]});
  const list=await scimApi(request(`Users?filter=${encodeURIComponent(`userName eq "${email}"`)}`),['Users']);expect(list.status).toBe(200);expect((await list.json()).totalResults).toBe(1);
  const changed=await scimApi(request(`Users/${body.id}`,{method:'PATCH',body:JSON.stringify({schemas:['urn:ietf:params:scim:api:messages:2.0:PatchOp'],Operations:[{op:'Replace',path:'roles',value:[{value:'TESTER'}]},{op:'Replace',path:'active',value:false}]})}),['Users',body.id]);expect(changed.status).toBe(200);expect(await changed.json()).toMatchObject({active:false,roles:[{value:'TESTER',primary:true}]});const stored=await db.user.findUniqueOrThrow({where:{id:body.id},include:{memberships:true}});expect(stored).toMatchObject({active:false,provisioningSource:'SCIM'});expect(stored.memberships[0].role).toBe('TESTER');
 });
});
