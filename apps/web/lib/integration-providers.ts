import {isIP} from 'node:net';
import {ApiError} from './http';

export type IntegrationKind='confluence'|'sharepoint'|'figma';
export type IntegrationConnectionConfig={kind:string;baseUrl:string;projectKey:string;credentialRef:string};
export type RemoteRevision={externalUrl:string;revision:string;snapshot:Record<string,unknown>};
type Fetcher=(input:string|URL,init?:RequestInit)=>Promise<Response>;

const MAX_RESPONSE_BYTES=2*1024*1024;
const DEFAULT_HOSTS:Record<IntegrationKind,string[]>= {
 confluence:['atlassian.net'],sharepoint:['graph.microsoft.com'],figma:['api.figma.com']
};

function fail(message:string,status=422,code='INTEGRATION_CONFIGURATION_INVALID'):never{throw new ApiError(status,code,message);}
function privateAddress(host:string){
 if(host==='localhost'||host.endsWith('.localhost'))return true;
 if(isIP(host)===6)return host==='::1'||host.startsWith('fc')||host.startsWith('fd')||host.startsWith('fe80:');
 if(isIP(host)===4){const [a,b]=host.split('.').map(Number);return a===10||a===127||a===0||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168);}
 return false;
}
function validatedBaseUrl(kind:IntegrationKind,value:string,extraHosts=process.env.INTEGRATION_ALLOWED_HOSTS||''){
 let url:URL;try{url=new URL(value);}catch{fail('The integration base URL is invalid.');}
 if(url.protocol!=='https:'||url.username||url.password||url.port)fail('Integration base URLs must use HTTPS without embedded credentials or custom ports.');
 const host=url.hostname.toLowerCase();
 if(privateAddress(host))fail('Private and local integration destinations are not allowed.');
 const configured=extraHosts.split(',').map(item=>item.trim().toLowerCase()).filter(Boolean);
 const vendor=DEFAULT_HOSTS[kind].some(suffix=>host===suffix||host.endsWith(`.${suffix}`));
 if(!vendor&&!configured.includes(host))fail(`Host ${host} is not approved for ${kind}.`);
 return new URL(url.origin+url.pathname.replace(/\/$/,''));
}

export function resolveIntegrationSecret(reference:string,env:Record<string,string|undefined>=process.env){
 const match=/^env:\/\/([A-Za-z_][A-Za-z0-9_]*)$/.exec(reference);
 if(match){const value=env[match[1]];if(!value)fail(`Credential environment variable ${match[1]} is not configured.`,503,'INTEGRATION_CREDENTIAL_UNAVAILABLE');return value;}
 if(/^(vault|aws-sm|azure-kv):\/\//.test(reference))fail('The selected secret-manager resolver is not configured on this deployment.',503,'INTEGRATION_CREDENTIAL_UNAVAILABLE');
 return fail('Credential references must use an approved secret provider.');
}

async function boundedJson(fetcher:Fetcher,url:URL,headers:HeadersInit){
 let response:Response;
 try{response=await fetcher(url,{method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(20_000)});}catch(error){throw new ApiError(502,'INTEGRATION_UPSTREAM_ERROR',error instanceof Error?`Provider request failed: ${error.message}`:'Provider request failed.');}
 if(!response.ok)throw new ApiError(502,'INTEGRATION_UPSTREAM_ERROR',`Provider returned HTTP ${response.status}.`);
 const declared=Number(response.headers.get('content-length')||0);if(declared>MAX_RESPONSE_BYTES)fail('Provider response exceeded the 2 MB limit.',502,'INTEGRATION_RESPONSE_TOO_LARGE');
 const text=await response.text();if(Buffer.byteLength(text,'utf8')>MAX_RESPONSE_BYTES)fail('Provider response exceeded the 2 MB limit.',502,'INTEGRATION_RESPONSE_TOO_LARGE');
 try{return JSON.parse(text) as Record<string,unknown>;}catch{throw new ApiError(502,'INTEGRATION_UPSTREAM_ERROR','Provider returned invalid JSON.');}
}

export async function fetchRemoteRevision(connection:IntegrationConnectionConfig,externalId:string,options:{fetcher?:Fetcher;env?:Record<string,string|undefined>;allowedHosts?:string}={}):Promise<RemoteRevision>{
 const kind=connection.kind as IntegrationKind;if(!DEFAULT_HOSTS[kind])fail('Unsupported integration provider.');
 const base=validatedBaseUrl(kind,connection.baseUrl,options.allowedHosts),token=resolveIntegrationSecret(connection.credentialRef,options.env),fetcher=options.fetcher||fetch;
 if(kind==='confluence'){
  const url=new URL(`${base.toString()}/wiki/api/v2/pages/${encodeURIComponent(externalId)}`);url.searchParams.set('body-format','storage');
  const data=await boundedJson(fetcher,url,{accept:'application/json',authorization:`Bearer ${token}`}),version=data.version as Record<string,unknown>|undefined,links=data._links as Record<string,unknown>|undefined;
  const revision=String(version?.number||'');if(!revision)fail('Confluence did not return a page version.',502,'INTEGRATION_UPSTREAM_ERROR');
  return {externalUrl:String(links?.webui?new URL(String(links.webui),base).toString():url.toString()),revision,snapshot:{id:data.id,title:data.title,version:version?.number,body:data.body}};
 }
 if(kind==='sharepoint'){
  const url=new URL(`${base.toString()}/v1.0/sites/${encodeURIComponent(connection.projectKey)}/drive/items/${encodeURIComponent(externalId)}`);
  const data=await boundedJson(fetcher,url,{accept:'application/json',authorization:`Bearer ${token}`}),revision=String(data.eTag||data.cTag||data.lastModifiedDateTime||'');
  if(!revision)fail('Microsoft Graph did not return a drive item revision.',502,'INTEGRATION_UPSTREAM_ERROR');
  return {externalUrl:String(data.webUrl||url),revision,snapshot:{id:data.id,name:data.name,eTag:data.eTag,cTag:data.cTag,lastModifiedDateTime:data.lastModifiedDateTime,size:data.size}};
 }
 const url=new URL(`${base.toString()}/v1/files/${encodeURIComponent(connection.projectKey)}/nodes`);url.searchParams.set('ids',externalId);url.searchParams.set('depth','2');
 const data=await boundedJson(fetcher,url,{accept:'application/json','x-figma-token':token}),revision=String(data.version||data.lastModified||'');
 if(!revision)fail('Figma did not return a file revision.',502,'INTEGRATION_UPSTREAM_ERROR');
 return {externalUrl:`https://www.figma.com/file/${encodeURIComponent(connection.projectKey)}?node-id=${encodeURIComponent(externalId)}`,revision,snapshot:{name:data.name,lastModified:data.lastModified,version:data.version,nodes:data.nodes}};
}
