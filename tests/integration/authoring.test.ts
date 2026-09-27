import {describe,expect,it} from 'vitest';
import {api,createProject,jsonRequest,waitForJob} from '../helpers';

describe('requirements document authoring',()=>{
 it('creates, versions, downloads and submits an authored document',async()=>{
  const projectId=await createProject('Authoring workflow');
  const createdResponse=await api(`/projects/${projectId}/authoring-documents`,jsonRequest('POST',{title:'Supplier Portal Requirements',templateType:'SIMPLE_PRD'}));
  expect(createdResponse.status).toBe(201);
  const created=await createdResponse.json();
  expect(created).toMatchObject({projectId,title:'Supplier Portal Requirements',version:1,status:'DRAFT'});

  const content='# Supplier Portal\n\n## Functional requirements\nFR-001. Approved suppliers shall submit products.\n\n## Acceptance criteria\nAC-001. Given an approved supplier, when a valid product is submitted, then it enters review.';
  const savedResponse=await api(`/authoring-documents/${created.id}`,jsonRequest('PATCH',{title:created.title,content,version:1}));
  expect(savedResponse.status).toBe(200);
  expect(await savedResponse.json()).toMatchObject({version:2,content});
  expect((await api(`/authoring-documents/${created.id}`,jsonRequest('PATCH',{title:created.title,content,version:1}))).status).toBe(409);

  const docx=await api(`/authoring-documents/${created.id}/download?format=docx`);
  expect(docx.status).toBe(200);
  expect(docx.headers.get('content-type')).toContain('officedocument');
  expect(Buffer.from(await docx.arrayBuffer()).subarray(0,2).toString()).toBe('PK');

  const submitted=await api(`/authoring-documents/${created.id}/process`,{method:'POST'});
  expect(submitted.status).toBe(202);
  const result=await submitted.json();
  expect(result.source).toMatchObject({projectId,filename:'Supplier_Portal_Requirements.txt'});
  expect((await api(`/authoring-documents/${created.id}/process`,{method:'POST'})).status).toBe(409);
  expect((await waitForJob(result.job_id)).status).toBe('succeeded');
 });
});
