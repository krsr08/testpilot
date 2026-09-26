import http from 'node:http';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../packages/db';
import { membership } from '../apps/web/lib/http';
import { scanUpload } from '../apps/web/lib/storage';
import { pushApprovedCases } from '../services/worker/jira';
import { validateGeneration } from '../services/worker/schemas';

afterEach(()=>{delete process.env.CLAMAV_ENABLED;delete process.env.CLAMAV_PORT;});
describe('enterprise readiness gates',()=>{
 it('isolates projects by organization-backed workspace membership',async()=>{const org=await db.organization.create({data:{name:`Tenant ${randomUUID()}`,slug:randomUUID()}});const workspace=await db.workspace.create({data:{name:'Private',organizationId:org.id}});const project=await db.project.create({data:{name:'Private',workspaceId:workspace.id,createdBy:'00000000-0000-4000-8000-000000000001',updatedBy:'00000000-0000-4000-8000-000000000001'}});await expect(membership(project.id,'00000000-0000-4000-8000-000000000001')).rejects.toMatchObject({status:404});});
 it('fails closed when ClamAV reports malware',async()=>{const server=net.createServer(socket=>socket.on('data',()=>socket.end('stream: Eicar-Test-Signature FOUND\0')));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address() as net.AddressInfo;process.env.CLAMAV_ENABLED='true';process.env.CLAMAV_PORT=String(address.port);await expect(scanUpload(Buffer.from('EICAR'))).rejects.toThrow('rejected');server.close();});
 it('rejects hallucinated citations and unknown requirement ids',()=>{const id=randomUUID();const snapshot=[{id,stableCode:'REQ-001',text:'Known',revision:1,sourceId:randomUUID(),excerpt:'Known source quote',sourceLocator:{page:1},inferred:false}];expect(()=>validateGeneration({scenarios:[{title:'Scenario',description:'',requirementIds:[id],cases:[{title:'Valid title',type:'positive',priority:'high',preconditions:'',testData:'',postconditions:'',rationale:'',steps:[{action:'Do it',expectedResult:'It works'}],requirementIds:[id],citations:[{requirementId:id,quote:'Invented',locator:{page:1},inferred:false}]}]}]},snapshot,['positive'])).toThrow('unsupported source quote');});
 it('blocks unapproved Jira cases before network access',async()=>{await expect(pushApprovedCases([{id:randomUUID(),title:'Draft',preconditions:'',rationale:'',status:'draft',steps:[]}],{baseUrl:'http://127.0.0.1:1',token:'x',projectKey:'TP'})).rejects.toThrow('Only approved');});
 it('exports approved cases to the Jira/Xray contract',async()=>{let requestBody='';const server=http.createServer((req,res)=>{req.on('data',chunk=>requestBody+=chunk);req.on('end',()=>{res.writeHead(201,{'content-type':'application/json'});res.end(JSON.stringify({key:'TP-101'}));});});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address() as net.AddressInfo;try{const id=randomUUID();const result=await pushApprovedCases([{id,title:'Approved login test',preconditions:'User exists',rationale:'Covers login',status:'approved',steps:[{action:'Sign in',expectedResult:'Dashboard opens'}]}],{baseUrl:`http://127.0.0.1:${address.port}`,token:'secret',projectKey:'TP'});expect(result[0]).toMatchObject({testCaseId:id,key:'TP-101'});expect(JSON.parse(requestBody)).toMatchObject({fields:{project:{key:'TP'},summary:'Approved login test'},xray_steps:[{action:'Sign in',result:'Dashboard opens'}]});}finally{server.close();}});
});
