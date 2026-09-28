import {describe,expect,it} from 'vitest';
import {api,createProject,jsonRequest,requirements,uploadFixture,waitForJob} from '../helpers';

describe('reliability, automation and impact workflow',()=>{
 it('generates governed automation and persists requirement impact',async()=>{
  const projectId=await createProject('Intelligence');
  const upload=await uploadFixture(projectId,'sample-login.txt','text/plain');expect(upload.status).toBe(202);await waitForJob((await upload.json()).job_id);
  let reqs=await requirements(projectId);const confirmation=await api(`/projects/${projectId}/requirements/confirm`,jsonRequest('POST',{requirements:reqs.map(item=>({id:item.id,revision:item.revision}))}));expect(confirmation.status).toBe(200);const snapshot=(await confirmation.json()).snapshot_hash;reqs=await requirements(projectId);
  const generation=await api(`/projects/${projectId}/generations`,jsonRequest('POST',{snapshot_hash:snapshot,types:['positive'],idempotency_key:`intelligence-${crypto.randomUUID()}`}));expect(generation.status).toBe(202);await waitForJob((await generation.json()).job_id);
  const casesResponse=await api(`/projects/${projectId}/test-cases`),cases=(await casesResponse.json()).cases;expect(cases.length).toBeGreaterThan(0);const current=cases[0];
  const approval=await api(`/test-cases/${current.id}/review`,jsonRequest('POST',{action:'approve',note:'Reviewed for automation',version:current.version}));expect(approval.status).toBe(200);
  const automation=await api(`/projects/${projectId}/automation/generate`,jsonRequest('POST',{testCaseIds:[current.id]}));expect(automation.status).toBe(201);const automationBody=await automation.json(),artifact=automationBody.artifacts[0];expect(artifact.source).toContain('TESTPILOT_SELECTOR_FALLBACK');expect(automationBody.agent_run_id).toMatch(/^[0-9a-f-]{36}$/);expect(automationBody.verifier_run_id).toMatch(/^[0-9a-f-]{36}$/);const selector=artifact.selectors[0],fallback=await api(`/projects/${projectId}/automation/${artifact.id}/fallback`,jsonRequest('POST',{step:selector.step,failedSelector:selector.candidates[0],workingSelector:selector.candidates[1]}));expect(fallback.status).toBe(201);const fallbackBody=await fallback.json();expect(fallbackBody.analysis_run_id).toMatch(/^[0-9a-f-]{36}$/);expect(fallbackBody.repair_run_id).toMatch(/^[0-9a-f-]{36}$/);expect(fallbackBody.status).toBe('pending');
  const update=await api(`/requirements/${reqs[0].id}`,jsonRequest('PATCH',{text:`${reqs[0].text} The account locks after five failed attempts.`,version:reqs[0].version}));expect(update.status).toBe(200);reqs=await requirements(projectId);
  const revised=await api(`/projects/${projectId}/requirements/confirm`,jsonRequest('POST',{requirements:reqs.filter(item=>item.included).map(item=>({id:item.id,revision:item.revision}))}));expect(revised.status).toBe(200);
  const intelligence=await api(`/projects/${projectId}/intelligence`);expect(intelligence.status).toBe(200);const data=await intelligence.json();expect(data.changeSets[0].summary.modified).toBeGreaterThanOrEqual(1);expect(data.changeSets[0].summary.affectedCases).toBeGreaterThanOrEqual(1);expect(data.artifacts[0].id).toBe(artifact.id);for(const key of ['script-generation','script-verifier','execution-analysis','script-repair'])expect(data.automationAgentRuns.some((run:{agentKey:string})=>run.agentKey===key)).toBe(true);
 },60000);
});

