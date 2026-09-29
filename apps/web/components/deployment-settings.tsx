'use client';

import {useEffect,useMemo,useState} from 'react';
import {api} from './project-nav';

type Field={key:string;label:string;help:string;placeholder?:string;secret?:boolean;options?:readonly string[]};
type Section={title:string;description:string;fields:Field[]};
type ConfigResponse={values:Record<string,string>;runtime:Record<string,string>;updatedAt:string|null};

const sections:Section[]=[
 {title:'Application and infrastructure',description:'Record the deployment values your platform team will apply. Database and Redis references are deliberately stored as references, never passwords or connection strings.',fields:[
  {key:'APP_URL',label:'Application URL',help:'The public HTTPS address users open in a browser, for example https://testpilot.example.com.',placeholder:'https://testpilot.example.com'},
  {key:'DATABASE_URL_REF',label:'Database secret reference',help:'Reference the PostgreSQL connection secret in your secret manager. The running application reads this during deployment and restart.',secret:true,placeholder:'vault://testpilot/database-url'},
  {key:'REDIS_URL_REF',label:'Redis secret reference',help:'Reference the Redis connection secret used by background jobs and queues.',secret:true,placeholder:'vault://testpilot/redis-url'},
  {key:'READINESS_MAX_QUEUE_LAG_SECONDS',label:'Maximum queue lag',help:'The maximum acceptable age, in seconds, of the oldest queued job before readiness reports a degraded state.',placeholder:'300'}
 ]},
 {title:'AI and document intelligence',description:'Choose deterministic mode for a repeatable demo or configure an OpenAI-compatible endpoint for live assisted analysis.',fields:[
  {key:'GENERATOR_MODE',label:'Generation mode',help:'Fixture gives repeatable demo output. External enables the configured OpenAI-compatible model for generation.',options:['fixture','external']},
  {key:'EXTRACTOR_MODE',label:'Extraction mode',help:'Fixture uses deterministic structural extraction. External sends source text to the configured compatible model.',options:['fixture','external']},
  {key:'MODEL_BASE_URL',label:'Compatible model base URL',help:'The HTTPS base URL for your OpenAI-compatible provider. Do not include a secret in the URL.',placeholder:'https://api.openai.com/v1'},
  {key:'MODEL_NAME',label:'Model name',help:'The provider model identifier used for extraction and test generation.',placeholder:'gpt-4.1-mini'},
  {key:'MODEL_API_KEY_REF',label:'Model API key reference',help:'A reference to the API key held by your secret manager. Paste a reference only, never an API key.',secret:true,placeholder:'env://MODEL_API_KEY'}
 ]},
 {title:'Storage and file safety',description:'These values support S3-compatible object storage, encrypted uploads, and optional malware scanning.',fields:[
  {key:'STORAGE_MODE',label:'Storage mode',help:'Use s3 for object storage in a deployed environment. Local storage is appropriate only for local development.',options:['local','s3']},
  {key:'AWS_REGION',label:'Storage region',help:'The region hosting the storage bucket and encryption key.',placeholder:'ap-south-1'},
  {key:'S3_BUCKET_NAME',label:'Storage bucket',help:'The private bucket used for source documents and exports.',placeholder:'testpilot-production'},
  {key:'AWS_S3_ENDPOINT',label:'S3-compatible endpoint',help:'Optional endpoint for MinIO or another S3-compatible service. Leave blank for AWS S3.',placeholder:'https://s3.example.com'},
  {key:'AWS_KMS_KEY_ID',label:'Encryption key ID',help:'Optional customer-managed KMS key used to encrypt stored source documents.',placeholder:'alias/testpilot-production'},
  {key:'AWS_ACCESS_KEY_ID_REF',label:'Storage access-key reference',help:'Reference the access key only when your deployment does not use workload identity.',secret:true,placeholder:'aws-sm://testpilot/s3-access-key'},
  {key:'AWS_SECRET_ACCESS_KEY_REF',label:'Storage secret-key reference',help:'Reference the matching storage secret in the secret manager.',secret:true,placeholder:'aws-sm://testpilot/s3-secret-key'},
  {key:'CLAMAV_ENABLED',label:'Malware scanning',help:'Enable to reject uploads that cannot be scanned cleanly. This requires a reachable ClamAV service.',options:['true','false']},
  {key:'CLAMAV_HOST',label:'ClamAV host',help:'Internal DNS name or host for the ClamAV service.',placeholder:'clamav'},
  {key:'CLAMAV_PORT',label:'ClamAV port',help:'TCP port exposed by the ClamAV daemon.',placeholder:'3310'}
 ]},
 {title:'Identity and provisioning',description:'OIDC enables enterprise sign-in. SCIM lets an identity provider provision and deprovision workspace members.',fields:[
  {key:'OIDC_ISSUER',label:'OIDC issuer',help:'Issuer URL published by your identity provider, such as Microsoft Entra ID or Okta.',placeholder:'https://login.microsoftonline.com/<tenant>/v2.0'},
  {key:'OIDC_AUDIENCE',label:'OIDC audience',help:'The API audience or application identifier that issued tokens must target.',placeholder:'api://testpilot'},
  {key:'OIDC_JWKS_URL',label:'OIDC JWKS URL',help:'Public JSON Web Key Set URL used to verify signed identity tokens.',placeholder:'https://idp.example.com/.well-known/jwks.json'},
  {key:'OIDC_CLIENT_ID',label:'OIDC client ID',help:'Public client identifier registered with the identity provider.',placeholder:'testpilot-web'},
  {key:'OIDC_CLIENT_SECRET_REF',label:'OIDC client-secret reference',help:'Reference the confidential client secret; never paste the secret itself.',secret:true,placeholder:'vault://testpilot/oidc-client-secret'},
  {key:'OIDC_AUTHORIZATION_URL',label:'Authorization URL',help:'Authorization endpoint used to begin sign-in.',placeholder:'https://idp.example.com/oauth2/authorize'},
  {key:'OIDC_TOKEN_URL',label:'Token URL',help:'Token endpoint used to exchange authorization codes.',placeholder:'https://idp.example.com/oauth2/token'},
  {key:'OIDC_END_SESSION_URL',label:'Sign-out URL',help:'Optional identity-provider endpoint to end the upstream browser session.',placeholder:'https://idp.example.com/logout'},
  {key:'OIDC_PASSWORD_RESET_URL',label:'Password-reset URL',help:'Optional identity-provider password-reset page displayed to users who need assistance.',placeholder:'https://idp.example.com/password/reset'},
  {key:'SCIM_WORKSPACE_ID',label:'SCIM workspace ID',help:'Workspace UUID that the SCIM endpoint is allowed to manage.',placeholder:'Workspace UUID'},
  {key:'SCIM_BEARER_TOKEN_REF',label:'SCIM bearer-token reference',help:'Reference the SCIM token used by your identity provider, never the token value.',secret:true,placeholder:'vault://testpilot/scim-token'}
 ]},
 {title:'Operations, integrations and billing',description:'Configure observability, external delivery references, and commercial provider references without exposing credentials in the browser.',fields:[
  {key:'METRICS_BEARER_TOKEN_REF',label:'Metrics-token reference',help:'Reference the bearer token protecting the metrics endpoint.',secret:true,placeholder:'env://METRICS_BEARER_TOKEN'},
  {key:'OTEL_EXPORTER_OTLP_ENDPOINT',label:'OpenTelemetry endpoint',help:'OTLP collector URL for traces, metrics, and logs.',placeholder:'https://otel.example.com/v1'},
  {key:'INTEGRATION_ALLOWED_HOSTS',label:'Allowed integration hosts',help:'Comma-separated trusted hostnames for external integrations. This limits outbound calls.',placeholder:'atlassian.net,sharepoint.com'},
  {key:'JIRA_BASE_URL',label:'Jira base URL',help:'Base URL for a Jira Cloud or Server instance.',placeholder:'https://your-company.atlassian.net'},
  {key:'JIRA_PROJECT_KEY',label:'Jira project key',help:'Default Jira project key used by delivery integrations.',placeholder:'QUALITY'},
  {key:'JIRA_TOKEN_REF',label:'Jira-token reference',help:'Reference the Jira service account token in your secret manager.',secret:true,placeholder:'vault://testpilot/jira-token'},
  {key:'STRIPE_PRICE_ID',label:'Stripe price ID',help:'Recurring price identifier used by the subscription checkout flow.',placeholder:'price_...'},
  {key:'STRIPE_SECRET_KEY_REF',label:'Stripe secret-key reference',help:'Reference the Stripe secret key. Never store or paste it in this form.',secret:true,placeholder:'env://STRIPE_SECRET_KEY'},
  {key:'STRIPE_WEBHOOK_SECRET_REF',label:'Stripe webhook-secret reference',help:'Reference the webhook signature secret used to verify Stripe events.',secret:true,placeholder:'env://STRIPE_WEBHOOK_SECRET'}
 ]}
];

const secretReferenceHint='Allowed formats: env://NAME, vault://path, aws-sm://secret, or azure-kv://secret.';

export function DeploymentSettings(){
 const [values,setValues]=useState<Record<string,string>>({});const [runtime,setRuntime]=useState<Record<string,string>>({});const [updatedAt,setUpdatedAt]=useState<string|null>(null);const [error,setError]=useState('');const [notice,setNotice]=useState('');const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);
 useEffect(()=>{api('enterprise/platform-config').then((data:ConfigResponse)=>{setValues(data.values||{});setRuntime(data.runtime||{});setUpdatedAt(data.updatedAt);}).catch((reason:Error)=>setError(reason.message)).finally(()=>setLoading(false));},[]);
 const configured=useMemo(()=>Object.values(values).filter(Boolean).length,[values]);
 function setValue(key:string,value:string){setValues(current=>({...current,[key]:value}));setNotice('');}
 async function save(){setSaving(true);setError('');setNotice('');try{const result=await api('enterprise/platform-config',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({values})});setValues(result.values||values);setUpdatedAt(result.updatedAt||null);setNotice('Configuration saved. Apply these values through your deployment pipeline, then restart services.');}catch(reason){setError((reason as Error).message);}finally{setSaving(false);}}
 if(loading)return <p>Loading deployment configuration…</p>;
 return <><div className="eyebrow">ENTERPRISE ADMINISTRATION</div><div className="page-heading"><div><h1>Platform settings</h1><p>Prepare a safe, reviewable deployment configuration for this organization.</p></div><span className="badge badge-blue">ADMINISTRATOR</span></div>{error&&<div className="error-box" role="alert">{error}</div>}{notice&&<div className="success-box" role="status">{notice}</div>}<div className="runtime-summary"><div><strong>Active runtime</strong><span>Deployment-owned values are shown for awareness and cannot be changed by a browser.</span></div><dl><div><dt>Environment</dt><dd>{runtime.APP_ENV||'unknown'}</dd></div><div><dt>Demo identity</dt><dd>{runtime.DEMO_AUTH==='true'?'Enabled':'Disabled'}</dd></div><div><dt>Saved fields</dt><dd>{configured}</dd></div></dl></div><div className="settings-callout"><strong>Safe configuration rule</strong><span>Secret references are allowed. Raw passwords, tokens, API keys, database URLs, and Redis URLs are rejected.</span></div>{sections.map(section=><section className="panel deployment-section" key={section.title}><h2>{section.title}</h2><p>{section.description}</p><div className="deployment-grid">{section.fields.map(field=><label className="deployment-field" key={field.key}><span>{field.label}<button type="button" className="help-tooltip" aria-label={`Help for ${field.label}`} data-tooltip={`${field.help}${field.secret?` ${secretReferenceHint}`:''}`}>?</button></span>{field.options?<select value={values[field.key]||''} onChange={event=>setValue(field.key,event.target.value)}><option value="">Not configured</option>{field.options.map(option=><option key={option} value={option}>{option}</option>)}</select>:<input value={values[field.key]||''} onChange={event=>setValue(field.key,event.target.value)} placeholder={field.placeholder} autoComplete="off" spellCheck={false}/>}<small>{field.secret?secretReferenceHint:field.help}</small></label>)}</div></section>)}<div className="settings-savebar"><span>{updatedAt?`Last saved ${new Date(updatedAt).toLocaleString()}`:'No organization configuration has been saved yet.'}</span><button type="button" className="button primary" onClick={()=>void save()} disabled={saving}>{saving?'Saving…':'Save deployment configuration'}</button></div></>;
}
