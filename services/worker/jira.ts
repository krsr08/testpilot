import { createHash } from 'node:crypto';

export type JiraCase={id:string;title:string;preconditions:string;rationale:string;status:string;steps:Array<{action:string;expectedResult:string}>};
export async function pushApprovedCases(cases:JiraCase[],options:{baseUrl:string;token:string;projectKey:string},existing:Record<string,string>={}){
 if(cases.some(item=>item.status!=='approved'))throw new Error('Only approved test cases may be synchronized.');
 const results:Array<{testCaseId:string;key:string;url:string;contentHash:string}>=[];
 for(const item of cases){
  const body={fields:{project:{key:options.projectKey},summary:item.title,description:`Preconditions:\n${item.preconditions||'None'}\n\nRationale:\n${item.rationale}`,issuetype:{name:'Test'}},xray_steps:item.steps.map(step=>({action:step.action,result:step.expectedResult}))};
  const key=existing[item.id],url=key?`${options.baseUrl.replace(/\/$/,'')}/rest/api/2/issue/${encodeURIComponent(key)}`:`${options.baseUrl.replace(/\/$/,'')}/rest/api/2/issue`;
  const response=await fetch(url,{method:key?'PUT':'POST',headers:{authorization:`Bearer ${options.token}`,'content-type':'application/json',accept:'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`Jira synchronization failed with HTTP ${response.status}.`);
  const created=key?{key}:await response.json() as {key?:string};if(!created.key)throw new Error('Jira returned no issue key.');
  results.push({testCaseId:item.id,key:created.key,url:`${options.baseUrl.replace(/\/$/,'')}/browse/${created.key}`,contentHash:createHash('sha256').update(JSON.stringify(body)).digest('hex')});
 }
 return results;
}
export async function pullJiraCase(key:string,options:{baseUrl:string;token:string}){const response=await fetch(`${options.baseUrl.replace(/\/$/,'')}/rest/api/2/issue/${encodeURIComponent(key)}`,{headers:{authorization:`Bearer ${options.token}`,accept:'application/json'},signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error(`Jira synchronization failed with HTTP ${response.status}.`);const issue=await response.json() as {fields?:{summary?:string;xray_steps?:Array<{action?:string;result?:string}>}};return {title:String(issue.fields?.summary||'').trim(),steps:(issue.fields?.xray_steps||[]).map(step=>({action:String(step.action||'').trim(),expectedResult:String(step.result||'').trim()})).filter(step=>step.action&&step.expectedResult)};}
